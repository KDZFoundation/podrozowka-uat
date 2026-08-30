import crypto from "node:crypto";
import {
  commitWrites,
  createDocumentWrite,
  fromFirestoreFields,
  queryDocuments,
  readDocument,
  updateDocument,
  updateDocumentIfCurrent,
  updateDocumentWrite,
} from "./gcp-firestore.js";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "../../src/lib/podImposition.js";
import { resolveRegisteredPodPrintFormat } from "../../src/lib/podPrintFormats.js";

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

const claimToken = () => crypto.randomBytes(32).toString("hex");
const claimTokenHash = (token: string) => crypto.createHash("sha256").update(token, "utf8").digest("hex");

const createIfMissing = async (documentPath: string, data: Record<string, unknown>) => {
  try {
    await commitWrites([createDocumentWrite(documentPath, data)]);
    return true;
  } catch (error) {
    const [collection, id] = documentPath.split("/");
    const existing = await readDocument(collection, id).catch(() => null);
    if (existing?.fields) return false;
    throw error;
  }
};

const readPodJobLease = async (jobId: string, leaseId: string) => {
  const jobDocument = await readDocument("qr_print_jobs", jobId);
  const job = jobDocument.fields ? fromFirestoreFields(jobDocument.fields) as Record<string, unknown> : {};
  if (!jobDocument.updateTime || job.status !== "generating" || job.recovery_lease_id !== leaseId) {
    throw new Error("pod_job_lease_lost");
  }
  return jobDocument.updateTime;
};

const commitWithPodJobLease = async (
  jobId: string,
  leaseId: string,
  data: Record<string, unknown>,
  writes: unknown[] = [],
) => {
  const jobUpdateTime = await readPodJobLease(jobId, leaseId);
  await commitWrites([
    updateDocumentWrite(`qr_print_jobs/${jobId}`, {
      status: "generating",
      recovery_lease_id: leaseId,
      ...data,
      updated_at: new Date().toISOString(),
    }, jobUpdateTime),
    ...writes,
  ]);
};

const createIfMissingWithPodJobLease = async (
  jobId: string,
  leaseId: string,
  jobData: Record<string, unknown>,
  documentPath: string,
  data: Record<string, unknown>,
) => {
  try {
    await commitWithPodJobLease(jobId, leaseId, jobData, [createDocumentWrite(documentPath, data)]);
    return true;
  } catch (error) {
    const [collection, id] = documentPath.split("/");
    const existing = await readDocument(collection, id).catch(() => null);
    if (!existing?.fields) throw error;
    // A concurrent worker may already have created this deterministic document.
    // Renewing in a separate guarded commit proves that this worker still owns
    // the job before it continues with the existing data.
    await commitWithPodJobLease(jobId, leaseId, jobData);
    return false;
  }
};

const renewPodJobLease = async (jobId: string, leaseId: string, data: Record<string, unknown>) => {
  await commitWithPodJobLease(jobId, leaseId, data);
};

export const reserveSerialRange = async (designId: string, quantity: number) => {
  const sequenceId = deterministicId(`inventory-sequence:${designId}`);
  for (let attempt = 0; attempt < MAX_SERIAL_RETRIES; attempt += 1) {
    const sequenceDocument = await readDocument("inventory_serial_sequences", sequenceId).catch(() => null);
    const sequenceData = sequenceDocument?.fields
      ? fromFirestoreFields(sequenceDocument.fields) as Record<string, unknown>
      : null;
    let start = Number(sequenceData?.next_serial || 0);
    if (!Number.isInteger(start) || start < 1) {
      const existingUnits = await queryDocuments(
        "inventory_units",
        "card_design_id",
        { stringValue: designId },
        1,
        { fieldPath: "inventory_serial_no", direction: "DESCENDING" },
      );
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
  print_format_id?: string;
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

const ensurePurchaseNotifications = async (
  userId: string,
  orderId: string,
  totalUnits: number,
  rank: string,
  previousRank: string,
  createdAt: string,
) => {
  const addedPoints = totalUnits * 10;
  await createIfMissing(`notifications/order-${orderId}-purchase`, {
    id: `order-${orderId}-purchase`,
    user_id: userId,
    type: "purchase_points",
    title: "Punkty za zakup",
    message: `Za zakup ${totalUnits} ${totalUnits === 1 ? "Podróżówki" : "Podróżówek"} otrzymujesz +${addedPoints} pkt.`,
    is_read: false,
    created_at: createdAt,
    order_id: orderId,
    schema_version: 1,
  });
  if (previousRank && previousRank !== rank) {
    await createIfMissing(`notifications/order-${orderId}-rank-${rank}`, {
      id: `order-${orderId}-rank-${rank}`,
      user_id: userId,
      type: "rank_up",
      title: "Nowa ranga Podróżnika",
      message: `Awansujesz z rangi ${previousRank} do rangi ${rank}.`,
      is_read: false,
      created_at: createdAt,
      order_id: orderId,
      schema_version: 1,
    });
  }
};

export const awardPurchaseGamification = async (
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
    if (!userId) return;
    if (order.gamification_awarded_at) {
      await ensurePurchaseNotifications(
        userId,
        orderId,
        totalUnits,
        String(order.gamification_rank_awarded || ""),
        String(order.gamification_previous_rank || ""),
        String(order.gamification_awarded_at),
      );
      return;
    }
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
        updateDocumentWrite(orderPath, {
          gamification_awarded_at: now,
          gamification_rank_awarded: rank,
          gamification_previous_rank: previousRank,
          updated_at: now,
        }, orderDocument.updateTime),
        updateDocumentWrite(`users/${userId}`, userUpdate, userDoc.updateTime),
      ]);
    } catch (error) {
      if (attempt === MAX_SERIAL_RETRIES - 1) throw error;
      continue;
    }

    await updateDocument(`profiles/${userId}`, userUpdate).catch(() => undefined);
    await ensurePurchaseNotifications(userId, orderId, totalUnits, rank, previousRank, now);
    return;
  }
};

type NewPodUnitInput = {
  jobId: string;
  leaseId: string;
  generatedItems: number;
  designId: string;
  unitId: string;
  itemId: string;
  batchId: string;
  productCode: string;
  orderId: string;
  orderNumber: string;
  orderUserId: unknown;
  itemIndex: number;
  primaryLanguageCode: string;
  secondaryLanguageCode: string | null;
  printFormatId: string;
  printFormatSource: "inventory_unit" | "legacy_fallback_v1";
};

/**
 * Allocate the serial number and create both the inventory unit and printable
 * QR item in the same Firestore commit as the lease heartbeat. A process that
 * loses the lease cannot consume a serial or write a partial unit afterwards.
 */
const createNewPodUnitWithLease = async (input: NewPodUnitInput) => {
  const sequenceId = deterministicId(`inventory-sequence:${input.designId}`);
  for (let attempt = 0; attempt < MAX_SERIAL_RETRIES; attempt += 1) {
    const jobUpdateTime = await readPodJobLease(input.jobId, input.leaseId);
    const sequenceDocument = await readDocument("inventory_serial_sequences", sequenceId).catch(() => null);
    const sequenceData = sequenceDocument?.fields
      ? fromFirestoreFields(sequenceDocument.fields) as Record<string, unknown>
      : null;
    let serial = Number(sequenceData?.next_serial || 0);
    if (!Number.isInteger(serial) || serial < 1) {
      const existingUnits = await queryDocuments(
        "inventory_units",
        "card_design_id",
        { stringValue: input.designId },
        1,
        { fieldPath: "inventory_serial_no", direction: "DESCENDING" },
      );
      serial = Math.max(0, ...existingUnits.map((unit) => Number(unit.data.inventory_serial_no || 0))) + 1;
    }
    const now = new Date().toISOString();
    const token = claimToken();
    const sequence = String(serial).padStart(8, "0");
    const internalCode = `${input.productCode}-${sequence}`;
    const claimCode = `QR-${internalCode}`;
    const sequenceDataForWrite = {
      id: sequenceId,
      card_design_id: input.designId,
      next_serial: serial + 1,
      updated_at: now,
      schema_version: 1,
    };

    try {
      await commitWrites([
        updateDocumentWrite(`qr_print_jobs/${input.jobId}`, {
          status: "generating",
          recovery_lease_id: input.leaseId,
          generated_items: input.generatedItems + 1,
          updated_at: now,
        }, jobUpdateTime),
        sequenceDocument?.fields
          ? updateDocumentWrite(`inventory_serial_sequences/${sequenceId}`, sequenceDataForWrite, sequenceDocument.updateTime)
          : createDocumentWrite(`inventory_serial_sequences/${sequenceId}`, { ...sequenceDataForWrite, created_at: now }),
        createDocumentWrite(`inventory_units/${input.unitId}`, {
          id: input.unitId,
          stock_batch_id: input.batchId,
          card_design_id: input.designId,
          inventory_serial_no: serial,
          internal_inventory_code: internalCode,
          business_status: "purchased",
          fulfillment_status: "qr_generated",
          traveler_user_id: input.orderUserId || null,
          order_id: input.orderId,
          order_number: input.orderNumber,
          order_item_id: `${input.orderId}-${input.itemIndex}`,
          primary_language_code: input.primaryLanguageCode,
          secondary_language_code: input.secondaryLanguageCode,
          print_format_id: input.printFormatId,
          print_format_source: input.printFormatSource,
          public_claim_code: claimCode,
          public_claim_token: token,
          public_claim_token_hash: claimTokenHash(token),
          qr_generated_at: now,
          created_at: now,
          updated_at: now,
          schema_version: 1,
        }),
        createDocumentWrite(`qr_print_job_items/${input.itemId}`, {
          id: input.itemId,
          print_job_id: input.jobId,
          inventory_unit_id: input.unitId,
          public_claim_code: claimCode,
          qr_url: `/r/${token}`,
          generated_at: now,
          schema_version: 1,
        }),
      ]);
      return;
    } catch (error) {
      const existingItem = await readDocument("qr_print_job_items", input.itemId).catch(() => null);
      if (existingItem?.fields) {
        await renewPodJobLease(input.jobId, input.leaseId, {
          status: "generating",
          generated_items: input.generatedItems + 1,
        });
        return;
      }
      if (attempt === MAX_SERIAL_RETRIES - 1) throw error;
    }
  }
  throw new Error("pod_inventory_unit_creation_failed");
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
  const leaseId = crypto.randomUUID();
  const existingJob = await readDocument("qr_print_jobs", jobId).catch(() => null);
  let resumeExistingJob = false;
  if (existingJob?.fields) {
    const existingData = fromFirestoreFields(existingJob.fields) as Record<string, unknown>;
    if (existingData.status === "ready") {
      await updateDocument(orderPath, { qr_print_job_id: jobId, pod_status: "ready", updated_at: new Date().toISOString() });
      await awardPurchaseGamification(orderPath, orderId, totalUnits);
      return jobId;
    }
    if (existingData.status !== "generating") return jobId;
    const activityAt = Date.parse(String(existingData.updated_at || existingData.created_at || ""));
    if (Number.isFinite(activityAt) && Date.now() - activityAt < POD_JOB_STALE_AFTER_MS) return jobId;
    try {
      await updateDocumentIfCurrent(`qr_print_jobs/${jobId}`, {
        status: "generating",
        recovery_lease_id: leaseId,
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
    recovery_lease_id: leaseId,
    lease_started_at: now,
    schema_version: 1,
  };
  if (!resumeExistingJob) {
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
    // New checkouts freeze the server-validated format on the order item. An
    // older paid order has no such snapshot, so it must use the explicitly
    // marked v1 compatibility format instead of a mutable current design.
    const explicitPrintFormatId = typeof item.print_format_id === "string" ? item.print_format_id.trim() : "";
    const printFormatSource = explicitPrintFormatId ? "inventory_unit" as const : "legacy_fallback_v1" as const;
    const printFormat = resolveRegisteredPodPrintFormat(
      explicitPrintFormatId || CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
    );
    const incompleteCopies = Array.from({ length: quantity }, (_, copyIndex) => copyIndex)
      .filter((copyIndex) => !existingItemIds.has(deterministicId(`pod-job-item:${orderId}:${itemIndex}:${copyIndex}`)));
    const batchId = deterministicId(`pod-batch:${orderId}:${itemIndex}`);
    await createIfMissingWithPodJobLease(jobId, leaseId, { status: "generating", generated_items: generated }, `stock_batches/${batchId}`, {
      id: batchId,
      name: `POD ${orderNumber}`,
      description: "Sztuki utworzone automatycznie po opłaceniu zamówienia.",
      card_design_id: designId,
      print_format_id: printFormat.print_format_id,
      print_format_source: printFormatSource,
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

    for (const copyIndex of incompleteCopies) {
      const unitId = deterministicId(`pod-unit:${orderId}:${itemIndex}:${copyIndex}`);
      const itemId = deterministicId(`pod-job-item:${orderId}:${itemIndex}:${copyIndex}`);
      const existingItem = await readDocument("qr_print_job_items", itemId).catch(() => null);
      if (existingItem?.fields) {
        await renewPodJobLease(jobId, leaseId, { status: "generating", generated_items: generated + 1 });
        generated += 1;
        continue;
      }

      const unitDocument = await readDocument("inventory_units", unitId).catch(() => null);
      if (!unitDocument?.fields) {
        await createNewPodUnitWithLease({
          jobId,
          leaseId,
          generatedItems: generated,
          designId,
          unitId,
          itemId,
          batchId,
          productCode,
          orderId,
          orderNumber,
          orderUserId: order.user_id,
          itemIndex,
          primaryLanguageCode,
          secondaryLanguageCode,
          printFormatId: printFormat.print_format_id,
          printFormatSource,
        });
        generated += 1;
        continue;
      }

      const unitData = fromFirestoreFields(unitDocument.fields) as Record<string, unknown>;
      const claimCode = String(unitData.public_claim_code || "");
      if (!claimCode) throw new Error("pod_inventory_unit_missing_claim_code");
      const storedToken = String(unitData.public_claim_token || "");
      const storedTokenHash = String(unitData.public_claim_token_hash || "");
      if (storedToken && storedTokenHash && claimTokenHash(storedToken) !== storedTokenHash) {
        throw new Error("pod_inventory_unit_claim_token_hash_mismatch");
      }

      if (storedToken) {
        await createIfMissingWithPodJobLease(jobId, leaseId, { status: "generating", generated_items: generated + 1 }, `qr_print_job_items/${itemId}`, {
          id: itemId,
          print_job_id: jobId,
          inventory_unit_id: unitId,
          public_claim_code: claimCode,
          qr_url: `/r/${storedToken}`,
          generated_at: now,
          schema_version: 1,
        });
      } else if (storedTokenHash) {
        // A hash without the source token can belong to a QR code that has
        // already been printed. Never replace it: doing so would invalidate
        // that physical card. The unit needs explicit data repair instead.
        throw new Error("pod_inventory_unit_claim_token_unrecoverable");
      } else if (!unitDocument.updateTime) {
        throw new Error("pod_inventory_unit_version_missing");
      } else {
        const token = claimToken();
        await commitWithPodJobLease(jobId, leaseId, { status: "generating", generated_items: generated + 1 }, [
          updateDocumentWrite(`inventory_units/${unitId}`, {
            public_claim_token: token,
            public_claim_token_hash: claimTokenHash(token),
            updated_at: new Date().toISOString(),
          }, unitDocument.updateTime),
          createDocumentWrite(`qr_print_job_items/${itemId}`, {
            id: itemId,
            print_job_id: jobId,
            inventory_unit_id: unitId,
            public_claim_code: claimCode,
            qr_url: `/r/${token}`,
            generated_at: now,
            schema_version: 1,
          }),
        ]);
      }
      generated += 1;
    }
  }

  await renewPodJobLease(jobId, leaseId, {
    status: "ready",
    total_items: totalUnits,
    generated_items: generated,
    updated_at: new Date().toISOString(),
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
