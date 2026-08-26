import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Repairs the one-time Supabase -> Firestore operational import where
 * inventory units were imported but their parent `orders` documents were not.
 *
 * The script is intentionally idempotent: it only creates an order when the
 * exact document id is missing. Run without --apply to inspect the plan.
 */

const PROJECT_ID = "podrozowka";
const DATABASE_ID = "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";
const apply = process.argv.includes("--apply");

type InventoryUnit = {
  id: string;
  order_id?: unknown;
  order_number?: unknown;
  traveler_user_id?: unknown;
  card_design_id?: unknown;
  primary_language_code?: unknown;
  secondary_language_code?: unknown;
  created_at?: unknown;
};

type CardDesign = {
  id: string;
  title?: unknown;
  product_code?: unknown;
  price_grosze?: unknown;
  price_pln?: unknown;
  language_code?: unknown;
};

const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const timestamp = (value: unknown) => {
  const text = asText(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : "";
};

const canonicalItemKey = (unit: InventoryUnit) => [
  asText(unit.card_design_id),
  asText(unit.primary_language_code),
  asText(unit.secondary_language_code),
].join("|");

async function main() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const firestore = getFirestore(app, DATABASE_ID);
  const [unitSnapshot, orderSnapshot, designSnapshot] = await Promise.all([
    firestore.collection("inventory_units").get(),
    firestore.collection("orders").get(),
    firestore.collection("card_designs").get(),
  ]);

  const existingOrderIds = new Set(orderSnapshot.docs.map((document) => document.id));
  const designs = new Map<string, CardDesign>(designSnapshot.docs.map((document) => [
    document.id,
    { id: document.id, ...document.data() } as CardDesign,
  ]));
  const groups = new Map<string, InventoryUnit[]>();
  let ownerlessUnits = 0;
  let ownedUnitsWithoutOrder = 0;
  let unitsForExistingOrders = 0;

  for (const document of unitSnapshot.docs) {
    const unit = { id: document.id, ...document.data() } as InventoryUnit;
    const orderId = asText(unit.order_id);
    const ownerId = asText(unit.traveler_user_id);
    if (!ownerId) {
      ownerlessUnits += 1;
      continue;
    }
    if (!orderId) {
      ownedUnitsWithoutOrder += 1;
      continue;
    }
    if (existingOrderIds.has(orderId)) {
      unitsForExistingOrders += 1;
      continue;
    }
    const current = groups.get(orderId) || [];
    current.push(unit);
    groups.set(orderId, current);
  }

  const now = new Date().toISOString();
  const reconstructed = [...groups.entries()].map(([orderId, units]) => {
    const orderNumber = asText(units[0]?.order_number) || `MIGRATED-${orderId.slice(0, 8).toUpperCase()}`;
    const userId = asText(units[0]?.traveler_user_id);
    const itemGroups = new Map<string, InventoryUnit[]>();
    for (const unit of units) {
      const key = canonicalItemKey(unit);
      if (!asText(unit.card_design_id)) continue;
      const current = itemGroups.get(key) || [];
      current.push(unit);
      itemGroups.set(key, current);
    }

    const items = [...itemGroups.values()].map((itemUnits) => {
      const source = itemUnits[0];
      const design = designs.get(asText(source.card_design_id));
      const priceGrosze = Math.round(asNumber(design?.price_grosze) || asNumber(design?.price_pln) * 100);
      const quantity = itemUnits.length;
      const primaryLanguageCode = asText(source.primary_language_code) || asText(design?.language_code) || "pl";
      const secondaryLanguageCode = asText(source.secondary_language_code) || null;
      return {
        card_design_id: asText(source.card_design_id),
        title: asText(design?.title) || "Podróżówka",
        quantity,
        product_code: asText(design?.product_code),
        primary_language_code: primaryLanguageCode,
        language_code: primaryLanguageCode,
        secondary_language_code: secondaryLanguageCode,
        unit_price_grosze: priceGrosze,
        total_price_grosze: priceGrosze * quantity,
        unit_price_pln: priceGrosze / 100,
        total_price_pln: (priceGrosze * quantity) / 100,
      };
    });
    const totalAmountGrosze = items.reduce((sum, item) => sum + item.total_price_grosze, 0);
    const createdAt = units.map((unit) => timestamp(unit.created_at)).filter(Boolean).sort()[0] || now;

    return {
      id: orderId,
      order_number: orderNumber,
      user_id: userId,
      guest_email: "",
      customer_email: "",
      status: "paid",
      payment_method: "hotpay",
      payment_status: "paid",
      total_amount_grosze: totalAmountGrosze,
      total_amount_pln: totalAmountGrosze / 100,
      total_amount: totalAmountGrosze / 100,
      shipping_cost_grosze: 0,
      shipping_cost_pln: 0,
      currency: "PLN",
      shipping_method: "historical_migration",
      shipping_address: null,
      pickup_point: null,
      invoice: { requested: false },
      items,
      pod_status: "ready",
      backfilled_from_inventory: true,
      migration_source: "firestore_inventory_order_repair",
      schema_version: 1,
      created_at: createdAt,
      paid_at: createdAt,
      updated_at: now,
    };
  });

  console.table(reconstructed.map((order) => ({
    order_number: order.order_number,
    user_id: order.user_id,
    postcards: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items: order.items.length,
    total_pln: order.total_amount_pln.toFixed(2),
  })));
  console.log(`Brakujących zamówień do odtworzenia: ${reconstructed.length}.`);
  console.log(
    `Poza odtworzeniem: ${ownerlessUnits} bez właściciela, ${ownedUnitsWithoutOrder} przypisanych do podróżnika bez zamówienia, ${unitsForExistingOrders} dla już istniejących zamówień.`,
  );

  if (!apply) {
    console.log("DRY RUN: nic nie zostało zapisane. Dodaj --apply po akceptacji raportu.");
    return;
  }

  for (let index = 0; index < reconstructed.length; index += 400) {
    const batch = firestore.batch();
    for (const order of reconstructed.slice(index, index + 400)) {
      batch.create(firestore.collection("orders").doc(order.id), order);
    }
    await batch.commit();
  }
  console.log(`Odtworzono ${reconstructed.length} zamówień. Nie zmieniono żadnej istniejącej pozycji.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
