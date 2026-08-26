import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Read-only inventory of all Firestore documents related to the temporary
 * orders recreated by backfill-orders-from-inventory.ts. It deliberately
 * performs no writes: use it before the destructive cleanup script.
 */

const PROJECT_ID = "podrozowka";
const DATABASE_ID = "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";
const TEST_MIGRATION_SOURCE = "firestore_inventory_order_repair";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const linkedTo = (data: Record<string, unknown>, field: string, ids: Set<string>) => ids.has(text(data[field]));

async function collectionData(firestore: ReturnType<typeof getFirestore>, name: string) {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, unknown> }));
}

async function main() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const firestore = getFirestore(app, DATABASE_ID);
  const names = [
    "orders", "inventory_units", "stock_batches", "qr_print_jobs", "qr_print_job_items",
    "notifications", "recipient_registrations", "inventory_movements", "inventory_unit_events",
    "pod_production_batches", "pod_production_batch_orders",
  ];
  const entries = await Promise.all(names.map(async (name) => [name, await collectionData(firestore, name)] as const));
  const all = Object.fromEntries(entries) as Record<string, Array<{ id: string; data: Record<string, unknown> }>>;

  const testOrders = all.orders.filter(({ data }) => text(data.migration_source) === TEST_MIGRATION_SOURCE && data.backfilled_from_inventory === true);
  const orderIds = new Set(testOrders.map(({ id }) => id));
  const testUnits = all.inventory_units.filter(({ data }) => linkedTo(data, "order_id", orderIds));
  const unitIds = new Set(testUnits.map(({ id }) => id));
  const testJobs = all.qr_print_jobs.filter(({ data }) => linkedTo(data, "order_id", orderIds));
  const jobIds = new Set(testJobs.map(({ id }) => id));
  const testBatches = all.stock_batches.filter(({ data }) => linkedTo(data, "order_id", orderIds) || linkedTo(data, "print_job_id", jobIds));
  const batchIds = new Set(testBatches.map(({ id }) => id));
  const printItems = all.qr_print_job_items.filter(({ data }) => linkedTo(data, "print_job_id", jobIds) || linkedTo(data, "inventory_unit_id", unitIds));
  const registrations = all.recipient_registrations.filter(({ data }) => linkedTo(data, "inventory_unit_id", unitIds));
  const movements = all.inventory_movements.filter(({ data }) => linkedTo(data, "inventory_unit_id", unitIds) || linkedTo(data, "stock_batch_id", batchIds));
  const events = all.inventory_unit_events.filter(({ data }) => linkedTo(data, "inventory_unit_id", unitIds));
  const notifications = all.notifications.filter(({ data }) => linkedTo(data, "order_id", orderIds));
  const batchOrderRows = all.pod_production_batch_orders.filter(({ data }) => linkedTo(data, "order_id", orderIds) || linkedTo(data, "print_job_id", jobIds));
  const podBatchIds = new Set(batchOrderRows.map(({ data }) => text(data.production_batch_id) || text(data.pod_production_batch_id)).filter(Boolean));
  const podBatches = all.pod_production_batches.filter(({ id }) => podBatchIds.has(id));

  const unlinkedUnits = all.inventory_units.filter(({ data }) => !text(data.order_id));
  console.log("Testowe zamówienia do usunięcia:");
  console.table(testOrders.map(({ id, data }) => ({
    id,
    order_number: text(data.order_number),
    user_id: text(data.user_id),
    status: text(data.status),
    payment_status: text(data.payment_status),
  })));
  console.table([{
    orders: testOrders.length,
    inventory_units: testUnits.length,
    stock_batches: testBatches.length,
    qr_print_jobs: testJobs.length,
    qr_print_job_items: printItems.length,
    notifications: notifications.length,
    recipient_registrations: registrations.length,
    inventory_movements: movements.length,
    inventory_unit_events: events.length,
    pod_production_batch_orders: batchOrderRows.length,
    pod_production_batches: podBatches.length,
  }]);
  console.log("Jednostki bez powiązanego zamówienia (nie będą usunięte bez odrębnej decyzji):");
  console.table(unlinkedUnits.map(({ id, data }) => ({
    id,
    internal_inventory_code: text(data.internal_inventory_code),
    card_design_id: text(data.card_design_id),
    traveler_user_id: text(data.traveler_user_id) ? "assigned" : "none",
    stock_batch_id: text(data.stock_batch_id),
    fulfillment_status: text(data.fulfillment_status),
    business_status: text(data.business_status),
    created_at: text(data.created_at),
  })));
  console.log("DRY RUN: raport wyłącznie do weryfikacji; żadnych danych nie zmieniono.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
