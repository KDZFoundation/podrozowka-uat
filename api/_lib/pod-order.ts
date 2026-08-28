import crypto from "node:crypto";
import {
  commitWrites,
  createDocumentWrite,
  fromFirestoreFields,
  queryDocuments,
  readDocument,
  setDocument,
  updateDocument,
  updateDocumentIfCurrent,
  updateDocumentWrite,
} from "./gcp-firestore.js";

const MAX_POD_UNITS_PER_ORDER = 500;
const POD_JOB_STALE_AFTER_MS = 5 * 60 * 1000;
const normalizeLanguageCode = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

const deterministicId = (value: string) => {
  const hex = crypto.createHash("sha256").update(value, "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const numericSuffix = (code: unknown) => {
  const match = String(code || "").match(/-(\d{8})$/);
  return match ? Number(match[1]) : 0;
};

// Allow a burst of concurrent checkouts to converge on the sequence CAS.
const MAX_SERIAL_RETRIES = 12;

export const reserveSerialRange = async (designId: string, quantity: number) => {
  const sequenceId = deterministicId(`inventory-sequence:${designId}`);
  for (let attempt = 0; attempt < MAX_SERIAL_RETRIES; attempt += 1) {
    const sequenceDocument = await readDocument("inventory_serial_sequences", sequenceId).catch(() => null);
    const sequenceData = sequenceDocument?.fields
      ? fromFirestoreFields(sequenceDocument.fields) as Record<string, unknown>
      : null;
    let start = Number(sequenceData?.next_serial || 0);
    if (!Number.isInteger(start) || start < 1) {
      const existingUnits = await queryDocuments("inventory_units", "card_design_id", { stringValue: designId });
      start = Math.max(0, ...existingUnits.map((unit) => numericSuffix(unit.data.internal_inventory_code))) + 1;
    }
    const now = new Date().toISOString();
    const data = {
      id: sequenceId,
      card_design_id: designId,
      next_serial: start + quantity,
      updated_at: now,
      schema_version: 1,
    };
    try {
      await commitWrites([sequenceDocument?.fields
        ? updateDocumentWrite(`inventory_serial_sequences/${sequenceId}`, data, sequenceDocument.updateTime)
        : createDocumentWrite(`inventory_serial_sequences/${sequenceId}`, { ...data, created_at: now })]);
      return start;
    } catch (error) {
      if (attempt === MAX_SERIAL_RETRIES - 1) throw error;
    }
  }
  throw new Error("inventory_serial_allocation_failed");
};

type PodOrderItem = {
  card_design_id?: string;
  title?: string;
  quantity?: number;
  product_code?: string;
  primary_language_code?: string;
  secondary_language_code?: string;
};

type LanguageTemplate = { language_code?: unknown; is_primary?: unknown };

export const resolvePodLanguages = (
  item: PodOrderItem,
  design: Record<string, unknown>,
  templates: LanguageTemplate[],
) => {
  const templateCodes = new Set(
    templates.map((template) => normalizeLanguageCode(template.language_code)).filter(Boolean),
  );
  const fallbackCode = normalizeLanguageCode(design.language_code);
  const countryPrimaryCode = normalizeLanguageCode(templates.find((template) => template.is_primary === true)?.language_code);
  const firstAvailableCode = normalizeLanguageCode(templates[0]?.language_code);
  const requestedPrimaryCode = normalizeLanguageCode(item.primary_language_code);
  const primaryLanguageCode = templateCodes.has(requestedPrimaryCode)
    ? requestedPrimaryCode
    : templateCodes.has(fallbackCode)
      ? fallbackCode
      : templateCodes.has(countryPrimaryCode)
        ? countryPrimaryCode
        : firstAvailableCode;
  if (!primaryLanguageCode) throw new Error("missing_language_template_for_design");

  const requestedSecondaryCode = normalizeLanguageCode(item.secondary_language_code);
  const secondaryLanguageCode = requestedSecondaryCode && requestedSecondaryCode !== primaryLanguageCode && templateCodes.has(requestedSecondaryCode)
    ? requestedSecondaryCode
    : null;

  return { primaryLanguageCode, secondaryLanguageCode };
};

const awardPurchaseGamification = async (
  orderPath: string,
  orderId: string,
  totalUnits: number,
) => {
  for (let attempt = 0; attempt < MAX_SERIAL_RETRIES; attempt += 1) {
    const orderDocument = await readDocument("orders", orderId);
    const order = orderDocument.fields
      ? fromFirestoreFields(orderDocument.fields) as Record<string, unknown>
      : {};
    const userId = typeof order.user_id === "string" ? order.user_id : "";
    if (!userId || order.gamification_awarded_at) return;
    if (!orderDocument.updateTime) throw new Error("order_version_missing");

    const userDoc = await readDocument("users", userId).catch(() => null);
    if (!userDoc?.fields || !userDoc.updateTime) return;
    const userData = fromFirestoreFields(userDoc.fields) as Record<string, unknown>;
    const currentPoints = Number(userData.gamification_points || userData.total_points || 0);
    const currentPurchased = Number(userData.postcards_purchased || userData.postcards_sent_count || 0);
    const addedPoints = totalUnits * 10;
    const newPoints = currentPoints + addedPoints;
    const newPurchased = currentPurchased + totalUnits;
    const calculateRank = (points: number) => {
      if (points >= 7500) return "Legenda Podróżówki";
      if (points >= 3000) return "Misjonarz Kultury";
      if (points >= 1500) return "Ambasador";
      if (points >= 500) return "Odkrywca";
      return "Zwiadowca";
    };
    const rank = calculateRank(newPoints);
    const previousRank = String(userData.current_rank || userData.current_tier || "Zwiadowca");
    const now = new Date().toISOString();
    const userUpdate = {
      gamification_points: newPoints,
      total_points: newPoints,
      postcards_purchased: newPurchased,
      postcards_sent_count: newPurchased,
      current_rank: rank,
      current_tier: rank,
      updated_at: now,
    };
    try {
      await commitWrites([
        updateDocumentWrite(orderPath, { gamification_awarded_at: now, updated_at: now }, orderDocument.updateTime),
        updateDocumentWrite(`users/${userId}`, userUpdate, userDoc.updateTime),
      ]);
    } catch (error) {
      if (attempt === MAX_SERIAL_RETRIES - 1) throw error;
      continue;
    }

    await updateDocument(`profiles/${userId}`, userUpdate).catch(() => undefined);
    await setDocument("notifications", `order-${orderId}-purchase`, {
      id: `order-${orderId}-purchase`,
      user_id: userId,
      type: "purchase_points",
      title: "Punkty za zakup",
      message: `Za zakup ${totalUnits} ${totalUnits === 1 ? "Podróżówki" : "Podróżówek"} otrzymujesz +${addedPoints} pkt.`,
      is_read: false,
      created_at: now,
      order_id: orderId,
      schema_version: 1,
    });
    if (previousRank !== rank) {
      await setDocument("notifications", `order-${orderId}-rank-${rank}`, {
        id: `order-${orderId}-rank-${rank}`,
        user_id: userId,
        type: "rank_up",
        title: "Nowa ranga Podróżnika",
        message: `Awansujesz z rangi ${previousRank} do rangi ${rank}.`,
        is_read: false,
        created_at: now,
        order_id: orderId,
        schema_version: 1,
      });
    }
    return;
  }
};

export const preparePaidOrderPod = async (orderPath: string, orderNumber: string) => {
  const orderId = orderPath.split("/").pop() || "";
  const orderDocument = await readDocument("orders", orderId);
  const order = orderDocument.fields
    ? fromFirestoreFields(orderDocument.fields) as Record<string, unknown>
    : {};
  const items = Array.isArray(order.items) ? order.items as PodOrderItem[] : [];
  const totalUnits = items.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.quantity) || 0)), 0);
  if (totalUnits < 1) throw new Error("order_has_no_items");
  if (totalUnits > MAX_POD_UNITS_PER_ORDER) throw new Error("order_exceeds_pod_unit_limit");

  const jobId = deterministicId(`pod-job:${orderId}`);
  const existingJob = await readDocument("qr_print_jobs", jobId).catch(() => null);
  let resumeExistingJob = false;
  if (existingJob?.fields) {
    const existingData = fromFirestoreFields(existingJob.fields) as Record<string, unknown>;
    if (existingData.status === "ready") await awardPurchaseGamification(orderPath, orderId, totalUnits);
    if (existingData.status !== "generating") return jobId;
    const updatedAt = Date.parse(String(existingData.updated_at || ""));
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt < POD_JOB_STALE_AFTER_MS) return jobId;
    try {
      await updateDocumentIfCurrent(`qr_print_jobs/${jobId}`, {
        status: "generating",
        recovery_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, String(existingJob.updateTime || ""));
      resumeExistingJob = true;
    } catch {
      // Another worker won the recovery lease, so it owns the in-progress job.
      return jobId;
    }
  }
  const now = new Date().toISOString();
  const job = {
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
  };
  try {
    // Firestore's create precondition makes this a per-order generation lock.
    // A repeated HotPay callback observes the existing job instead of running
    // POD creation and gamification a second time.
    await commitWrites([createDocumentWrite(`qr_print_jobs/${jobId}`, job)]);
  } catch (error) {
    const concurrentJob = await readDocument("qr_print_jobs", jobId).catch(() => null);
    if (concurrentJob?.fields) return jobId;
    throw error;
  }

  const existingItems = resumeExistingJob
    ? await queryDocuments("qr_print_job_items", "print_job_id", { stringValue: jobId }).catch(() => [])
    : [];
  const existingItemIds = new Set(existingItems.map((item) => item.id));
  let generated = existingItems.length;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    const designId = String(item.card_design_id || "");
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (!designId || quantity < 1) continue;
    const designDocument = await readDocument("card_designs", designId);
    const design = designDocument.fields
      ? fromFirestoreFields(designDocument.fields) as Record<string, unknown>
      : {};
    const countryId = typeof design.country_id === "string" ? design.country_id : "";
    if (!countryId) throw new Error("card_design_missing_country");
    const languageTemplates = await queryDocuments("card_language_templates", "country_id", { stringValue: countryId });
    const { primaryLanguageCode, secondaryLanguageCode } = resolvePodLanguages(
      item,
      design,
      languageTemplates.map((template) => template.data),
    );
    const productCode = String(item.product_code || design.product_code || `PDZ-${designId.slice(0, 8).toUpperCase()}`);
    const missingCopies = Array.from({ length: quantity }, (_, copyIndex) => copyIndex)
      .filter((copyIndex) => !existingItemIds.has(deterministicId(`pod-job-item:${orderId}:${itemIndex}:${copyIndex}`)));
    const firstSerial = missingCopies.length > 0 ? await reserveSerialRange(designId, missingCopies.length) : 0;
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

    for (let copyPosition = 0; copyPosition < missingCopies.length; copyPosition += 1) {
      const copyIndex = missingCopies[copyPosition];
      const unitId = deterministicId(`pod-unit:${orderId}:${itemIndex}:${copyIndex}`);
      const itemId = deterministicId(`pod-job-item:${orderId}:${itemIndex}:${copyIndex}`);
      const token = crypto.createHash("sha256").update(`pod-claim:${orderId}:${itemIndex}:${copyIndex}:${process.env.HOTPAY_SECRET || "uat"}`, "utf8").digest("hex");
      const sequence = String(firstSerial + copyPosition).padStart(8, "0");
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
        primary_language_code: primaryLanguageCode,
        secondary_language_code: secondaryLanguageCode,
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
      await setDocument("qr_print_jobs", jobId, {
        ...job,
        status: "generating",
        generated_items: generated,
        updated_at: new Date().toISOString(),
      });
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

  try {
    await awardPurchaseGamification(orderPath, orderId, totalUnits);
  } catch (error) {
    // The order is already paid and POD is ready. A later duplicate callback
    // can safely retry this idempotent award using the order marker.
    console.warn("[pod-order] User points update warning:", error);
  }

  return jobId;
};

