import crypto from "node:crypto";
import { fromFirestoreFields, queryDocuments, readDocument, setDocument, updateDocument } from "./gcp-firestore.js";

const MAX_POD_UNITS_PER_ORDER = 500;

const deterministicId = (value: string) => {
  const hex = crypto.createHash("sha256").update(value, "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const numericSuffix = (code: unknown) => {
  const match = String(code || "").match(/-(\d{8})$/);
  return match ? Number(match[1]) : 0;
};

type PodOrderItem = {
  card_design_id?: string;
  title?: string;
  quantity?: number;
  product_code?: string;
};

export const preparePaidOrderPod = async (orderPath: string, orderNumber: string) => {
  const orderId = orderPath.split("/").pop() || "";
  const existingJobs = await queryDocuments("qr_print_jobs", "order_number", { stringValue: orderNumber }, 2);
  if (existingJobs.some((job) => job.data.status === "ready")) return existingJobs[0].id;

  const orderDocument = await readDocument("orders", orderId);
  const order = orderDocument.fields
    ? fromFirestoreFields(orderDocument.fields) as Record<string, unknown>
    : {};
  const items = Array.isArray(order.items) ? order.items as PodOrderItem[] : [];
  const totalUnits = items.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.quantity) || 0)), 0);
  if (totalUnits < 1) throw new Error("order_has_no_items");
  if (totalUnits > MAX_POD_UNITS_PER_ORDER) throw new Error("order_exceeds_pod_unit_limit");

  const jobId = deterministicId(`pod-job:${orderId}`);
  const now = new Date().toISOString();
  await setDocument("qr_print_jobs", jobId, {
    id: jobId,
    name: `POD — zamówienie ${orderNumber}`,
    order_id: orderId,
    order_number: orderNumber,
    status: "generating",
    total_items: totalUnits,
    generated_items: 0,
    created_by: order.user_id || null,
    created_at: now,
    updated_at: now,
    schema_version: 1,
  });

  let generated = 0;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    const designId = String(item.card_design_id || "");
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (!designId || quantity < 1) continue;
    const designDocument = await readDocument("card_designs", designId);
    const design = designDocument.fields
      ? fromFirestoreFields(designDocument.fields) as Record<string, unknown>
      : {};
    const productCode = String(item.product_code || design.product_code || `PDZ-${designId.slice(0, 8).toUpperCase()}`);
    const existingUnits = await queryDocuments("inventory_units", "card_design_id", { stringValue: designId });
    const existingOrderUnits = existingUnits.filter((unit) => unit.data.order_id === orderId);
    const maxSerial = Math.max(0, ...existingUnits.map((unit) => numericSuffix(unit.data.internal_inventory_code)));
    const batchId = deterministicId(`pod-batch:${orderId}:${itemIndex}`);
    await setDocument("stock_batches", batchId, {
      id: batchId,
      name: `POD ${orderNumber}`,
      description: "Sztuki utworzone automatycznie po opłaceniu zamówienia.",
      card_design_id: designId,
      quantity,
      source_type: "pod",
      purpose: "Zamówienie internetowe",
      distribution_channel: "ecommerce",
      production_status: "ordered",
      order_id: orderId,
      created_at: now,
      updated_at: now,
      schema_version: 1,
    });

    for (let copyIndex = 0; copyIndex < quantity; copyIndex += 1) {
      const unitId = deterministicId(`pod-unit:${orderId}:${itemIndex}:${copyIndex}`);
      const itemId = deterministicId(`pod-job-item:${orderId}:${itemIndex}:${copyIndex}`);
      const token = crypto.createHash("sha256").update(`pod-claim:${orderId}:${itemIndex}:${copyIndex}:${process.env.HOTPAY_SECRET || "uat"}`, "utf8").digest("hex");
      const sequence = String(existingOrderUnits.find((unit) => unit.id === unitId)?.data.inventory_serial_no || maxSerial + copyIndex + 1).padStart(8, "0");
      const internalCode = `${productCode}-${sequence}`;
      const claimCode = `QR-${internalCode}`;
      await setDocument("inventory_units", unitId, {
        id: unitId,
        stock_batch_id: batchId,
        card_design_id: designId,
        inventory_serial_no: Number(sequence),
        internal_inventory_code: internalCode,
        business_status: "purchased",
        fulfillment_status: "qr_generated",
        traveler_user_id: order.user_id || null,
        order_id: orderId,
        order_number: orderNumber,
        order_item_id: `${orderId}-${itemIndex}`,
        public_claim_code: claimCode,
        public_claim_token_hash: crypto.createHash("sha256").update(token, "utf8").digest("hex"),
        qr_generated_at: now,
        created_at: now,
        updated_at: now,
        schema_version: 1,
      });
      await setDocument("qr_print_job_items", itemId, {
        id: itemId,
        print_job_id: jobId,
        inventory_unit_id: unitId,
        public_claim_code: claimCode,
        qr_url: `/r/${token}`,
        generated_at: now,
        schema_version: 1,
      });
      generated += 1;
    }
  }

  await setDocument("qr_print_jobs", jobId, {
    id: jobId,
    name: `POD — zamówienie ${orderNumber}`,
    order_id: orderId,
    order_number: orderNumber,
    status: "ready",
    total_items: totalUnits,
    generated_items: generated,
    created_by: order.user_id || null,
    created_at: now,
    updated_at: new Date().toISOString(),
    schema_version: 1,
  });
  await updateDocument(orderPath, { qr_print_job_id: jobId, pod_status: "ready", updated_at: new Date().toISOString() });

  // Award traveler gamification points for purchased postcards
  if (order.user_id) {
    try {
      const userDoc = await readDocument("users", String(order.user_id));
      const userData = userDoc.fields ? fromFirestoreFields(userDoc.fields) as Record<string, unknown> : {};
      const currentPoints = Number(userData.gamification_points || userData.total_points || 0);
      const currentPurchased = Number(userData.postcards_purchased || userData.postcards_sent_count || 0);
      const addedPoints = totalUnits * 10;
      const newPoints = currentPoints + addedPoints;
      const newPurchased = currentPurchased + totalUnits;
      const calculateRank = (pts: number) => {
        if (pts >= 7500) return "Legenda Podróżówki";
        if (pts >= 3000) return "Misjonarz Kultury";
        if (pts >= 1500) return "Ambasador";
        if (pts >= 500) return "Odkrywca";
        return "Zwiadowca";
      };
      const rank = calculateRank(newPoints);
      const userUpdate = {
        gamification_points: newPoints,
        total_points: newPoints,
        postcards_purchased: newPurchased,
        postcards_sent_count: newPurchased,
        current_rank: rank,
        current_tier: rank,
        updated_at: now,
      };
      await updateDocument(`users/${order.user_id}`, userUpdate);
      try {
        await updateDocument(`profiles/${order.user_id}`, userUpdate);
      } catch {}
    } catch (e) {
      console.warn("[pod-order] User points update warning:", e);
    }
  }

  return jobId;
};

