import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Removes the explicitly approved UAT test commerce data.
 *
 * Scope is deliberately narrow and repeatable:
 * - orders reconstructed by the historical inventory repair;
 * - their POD / QR / batch / notification children;
 * - the three current inventory units without an order (approved test stock);
 * - the sequence counters for the affected designs, returning them to 1.
 *
 * Run without --apply first. Nothing is written in dry-run mode.
 */

const PROJECT_ID = "podrozowka";
const DATABASE_ID = "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";
const TEST_MIGRATION_SOURCE = "firestore_inventory_order_repair";
const apply = process.argv.includes("--apply");
const MAX_BATCH_WRITES = 400;

type Entry = { id: string; data: Record<string, unknown> };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const hasLink = (data: Record<string, unknown>, field: string, ids: Set<string>) => ids.has(text(data[field]));
const unique = (entries: Entry[]) => [...new Map(entries.map((entry) => [entry.id, entry])).values()];

async function readCollection(firestore: ReturnType<typeof getFirestore>, name: string): Promise<Entry[]> {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, unknown> }));
}

function rankFor(points: number) {
  if (points >= 7500) return "Legenda Podróżówki";
  if (points >= 3000) return "Misjonarz Kultury";
  if (points >= 1500) return "Ambasador";
  if (points >= 500) return "Odkrywca";
  return "Zwiadowca";
}

async function main() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const firestore = getFirestore(app, DATABASE_ID);
  const names = [
    "orders", "inventory_units", "stock_batches", "stock_production_orders", "qr_print_jobs",
    "qr_print_job_items", "notifications", "recipient_registrations", "inventory_movements",
    "inventory_unit_events", "pod_production_batches", "pod_production_batch_orders",
  ];
  const loaded = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readCollection(firestore, name)] as const))) as Record<string, Entry[]>;

  const testOrders = loaded.orders.filter(({ data }) => data.backfilled_from_inventory === true && text(data.migration_source) === TEST_MIGRATION_SOURCE);
  const orderIds = new Set(testOrders.map(({ id }) => id));
  const orderedUnits = loaded.inventory_units.filter(({ data }) => hasLink(data, "order_id", orderIds));
  // The preceding inspection showed exactly three standalone, approved test units.
  const standaloneTestUnits = loaded.inventory_units.filter(({ data }) => !text(data.order_id));
  const units = unique([...orderedUnits, ...standaloneTestUnits]);
  const unitIds = new Set(units.map(({ id }) => id));
  const designIds = new Set(units.map(({ data }) => text(data.card_design_id)).filter(Boolean));
  const userIds = new Set(testOrders.map(({ data }) => text(data.user_id)).filter(Boolean));

  const batches = loaded.stock_batches.filter(({ id, data }) =>
    hasLink(data, "order_id", orderIds) || units.some((unit) => text(unit.data.stock_batch_id) === id),
  );
  const batchIds = new Set(batches.map(({ id }) => id));
  const stockOrderIds = new Set(batches.map(({ data }) => text(data.production_order_id)).filter(Boolean));
  const stockOrders = loaded.stock_production_orders.filter(({ id }) => stockOrderIds.has(id));
  const jobs = loaded.qr_print_jobs.filter(({ data }) =>
    hasLink(data, "order_id", orderIds) || hasLink(data, "stock_batch_id", batchIds) || hasLink(data, "stock_production_order_id", stockOrderIds),
  );
  const jobIds = new Set(jobs.map(({ id }) => id));
  const jobItems = loaded.qr_print_job_items.filter(({ data }) => hasLink(data, "print_job_id", jobIds) || hasLink(data, "inventory_unit_id", unitIds));
  const registrations = loaded.recipient_registrations.filter(({ data }) => hasLink(data, "inventory_unit_id", unitIds));
  const movements = loaded.inventory_movements.filter(({ data }) => hasLink(data, "inventory_unit_id", unitIds) || hasLink(data, "stock_batch_id", batchIds));
  const events = loaded.inventory_unit_events.filter(({ data }) => hasLink(data, "inventory_unit_id", unitIds));
  const notifications = loaded.notifications.filter(({ data }) => hasLink(data, "order_id", orderIds));
  const batchOrderRows = loaded.pod_production_batch_orders.filter(({ data }) => hasLink(data, "order_id", orderIds) || hasLink(data, "print_job_id", jobIds));
  const podBatchIds = new Set(batchOrderRows.map(({ data }) => text(data.production_batch_id) || text(data.pod_production_batch_id)).filter(Boolean));
  const podBatches = loaded.pod_production_batches.filter(({ id }) => podBatchIds.has(id));

  const deletions: Array<[string, Entry[]]> = [
    ["recipient_registrations", registrations], ["inventory_movements", movements], ["inventory_unit_events", events],
    ["qr_print_job_items", jobItems], ["pod_production_batch_orders", batchOrderRows], ["pod_production_batches", podBatches],
    ["notifications", notifications], ["inventory_units", units], ["qr_print_jobs", jobs], ["stock_batches", batches],
    ["stock_production_orders", stockOrders], ["orders", testOrders],
  ];
  const totalDeletes = deletions.reduce((sum, [, entries]) => sum + entries.length, 0);

  console.table([{
    orders: testOrders.length, inventory_units: units.length, stock_batches: batches.length,
    stock_production_orders: stockOrders.length, qr_print_jobs: jobs.length, qr_print_job_items: jobItems.length,
    notifications: notifications.length, recipient_registrations: registrations.length, inventory_movements: movements.length,
    inventory_unit_events: events.length, pod_production_batch_orders: batchOrderRows.length,
    pod_production_batches: podBatches.length, sequence_counters_reset: designIds.size, total_documents_deleted: totalDeletes,
  }]);
  console.log(`Zamówienia: ${testOrders.map(({ data }) => text(data.order_number)).join(", ") || "brak"}`);
  console.log(`Wzory z resetowaną numeracją: ${[...designIds].join(", ") || "brak"}`);

  if (!apply) {
    console.log("DRY RUN: nic nie zostało usunięte. Uruchom z --apply po akceptacji raportu.");
    return;
  }

  const refs = new Map<string, ReturnType<typeof firestore.doc>>();
  for (const [collection, entries] of deletions) {
    for (const entry of entries) refs.set(`${collection}/${entry.id}`, firestore.collection(collection).doc(entry.id));
  }
  const writes: Array<{ type: "delete"; ref: ReturnType<typeof firestore.doc> } | { type: "set"; ref: ReturnType<typeof firestore.doc>; data: Record<string, unknown> }> =
    [...refs.values()].map((ref) => ({ type: "delete", ref }));

  // Recalculate the affected account from the remaining paid orders, rather
  // than subtracting a fixed number. This keeps the cleanup safe if real
  // orders are added before the script is run.
  const survivingOrders = loaded.orders.filter(({ id, data }) => !orderIds.has(id) && text(data.payment_status) === "paid");
  const survivingOrderIds = new Set(survivingOrders.map(({ id }) => id));
  const survivingUnits = loaded.inventory_units.filter(({ id, data }) => !unitIds.has(id) && hasLink(data, "order_id", survivingOrderIds));
  for (const userId of userIds) {
    const purchased = survivingUnits.filter(({ data }) => text(data.traveler_user_id) === userId).length;
    const points = purchased * 10;
    const update = {
      postcards_purchased: purchased,
      postcards_sent_count: purchased,
      gamification_points: points,
      total_points: points,
      current_rank: rankFor(points),
      current_tier: rankFor(points),
      updated_at: new Date().toISOString(),
    };
    for (const collection of ["users", "profiles"]) {
      const reference = firestore.collection(collection).doc(userId);
      if ((await reference.get()).exists) writes.push({ type: "set", ref: reference, data: update });
    }
  }
  for (const designId of designIds) {
    writes.push({
      type: "set",
      ref: firestore.collection("config").doc(`inventory_sequence_${designId}`),
      data: { next_number: 1, card_design_id: designId, reset_reason: "approved_test_data_cleanup", updated_at: new Date().toISOString() },
    });
  }

  for (let index = 0; index < writes.length; index += MAX_BATCH_WRITES) {
    const batch = firestore.batch();
    for (const write of writes.slice(index, index + MAX_BATCH_WRITES)) {
      if (write.type === "delete") batch.delete(write.ref);
      else batch.set(write.ref, write.data, { merge: true });
    }
    await batch.commit();
  }
  console.log(`Usunięto ${totalDeletes} dokumentów testowych. Resetowano ${designIds.size} liczników do 1.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
