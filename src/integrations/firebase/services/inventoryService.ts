import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config";

const MAX_WRITE_OPERATIONS = 400;

type InventoryStatus = "qr_generated" | "qr_applied" | "in_stock" | "voided" | "damaged";

export interface LocalInventoryCountry { id: string; name?: string; name_pl?: string; }
export interface LocalInventoryDesign { id: string; title?: string | null; view_no?: number; country_id?: string; }
export interface LocalInventoryBatch {
  id: string; name?: string; source_type?: string; purpose?: string | null;
  distribution_channel?: string; event_name?: string | null; partner_name?: string | null;
  production_status?: string; production_order_id?: string | null;
}
export interface LocalInventoryUnit {
  id: string; card_design_id?: string; stock_batch_id?: string; internal_inventory_code?: string;
  business_status?: string | null; fulfillment_status?: string; traveler_user_id?: string | null;
  order_id?: string | null; public_claim_code?: string | null; qr_generated_at?: string | null;
  shipped_at?: string | null; registered_at?: string | null; created_at?: string;
}
export interface LocalStockOrder { id: string; order_number?: string; name?: string; total_quantity?: number; status?: string; created_at?: string; }

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sha256 = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const numericSuffix = (code: string | undefined) => {
  const match = code?.match(/-(\d{8})$/);
  return match ? Number(match[1]) : 0;
};

export interface PreparedStockPrintOrder {
  stockOrderId: string;
  stockBatchId: string;
  printJobId: string;
  quantity: number;
  documentNumber: string;
}

export const inventoryService = {
  async prepareStockPrintOrder(input: {
    cardDesignId: string;
    quantity: number;
    name: string;
    adminUid: string;
  }): Promise<PreparedStockPrintOrder> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10000) {
      throw new Error("Ilość musi mieścić się w zakresie 1–10000.");
    }

    const designRef = doc(db, "card_designs", input.cardDesignId);
    const designSnapshot = await getDoc(designRef);
    if (!designSnapshot.exists() || designSnapshot.data().active === false) {
      throw new Error("Nie znaleziono aktywnego wzoru Podróżówki.");
    }
    const design = designSnapshot.data();
    const productCode = typeof design.product_code === "string" && design.product_code
      ? design.product_code
      : `PDZ-${input.cardDesignId.slice(0, 8).toUpperCase()}`;

    const existingUnits = await getDocs(query(collection(db, "inventory_units"), where("card_design_id", "==", input.cardDesignId)));
    const maxExistingSequence = Math.max(0, ...existingUnits.docs.map((unit) => numericSuffix(unit.data().internal_inventory_code)));
    const sequenceRef = doc(db, "config", `inventory_sequence_${input.cardDesignId}`);
    const sequenceStart = await runTransaction(db, async (transaction) => {
      const sequence = await transaction.get(sequenceRef);
      const next = Math.max(Number(sequence.data()?.next_number || 1), maxExistingSequence + 1);
      transaction.set(sequenceRef, { next_number: next + input.quantity, card_design_id: input.cardDesignId, updated_at: serverTimestamp() }, { merge: true });
      return next;
    });

    const now = new Date();
    const date = now.toISOString().slice(2, 10).replace(/-/g, "");
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
    const stockOrderId = crypto.randomUUID();
    const stockBatchId = crypto.randomUUID();
    const printJobId = crypto.randomUUID();
    const documentNumber = `MAG-${date}-${suffix}`;
    const mainLocation = await getDocs(query(collection(db, "inventory_locations"), where("code", "==", "MAIN")));
    const locationId = mainLocation.docs[0]?.id || null;

    const parentBatch = writeBatch(db);
    parentBatch.set(doc(db, "stock_production_orders", stockOrderId), {
      id: stockOrderId,
      order_number: `STK-${date}-${suffix}`,
      name: input.name,
      purpose: "Stan magazynowy",
      distribution_channel: "warehouse",
      location_id: locationId,
      status: "ordered",
      total_quantity: input.quantity,
      ordered_at: now.toISOString(),
      created_by: input.adminUid,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      schema_version: 1,
    });
    parentBatch.set(doc(db, "stock_batches", stockBatchId), {
      id: stockBatchId,
      name: input.name,
      description: "Wewnętrzne zlecenie magazynowe z indywidualnymi kodami QR.",
      card_design_id: input.cardDesignId,
      quantity: input.quantity,
      source_type: "stock",
      purpose: "Stan magazynowy",
      distribution_channel: "warehouse",
      location_id: locationId,
      production_status: "ordered",
      production_order_id: stockOrderId,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      schema_version: 1,
    });
    parentBatch.set(doc(db, "qr_print_jobs", printJobId), {
      id: printJobId,
      name: `MAG — ${input.name}`,
      status: "generating",
      total_items: input.quantity,
      generated_items: 0,
      stock_production_order_id: stockOrderId,
      stock_batch_id: stockBatchId,
      created_by: input.adminUid,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      schema_version: 1,
    });
    await parentBatch.commit();

    const unitPayloads = await Promise.all(Array.from({ length: input.quantity }, async (_, index) => {
      const unitId = crypto.randomUUID();
      const sequence = String(sequenceStart + index).padStart(8, "0");
      const token = randomToken();
      const claimCode = `QR-${productCode}-${sequence}`;
      return {
        unitId,
        itemId: crypto.randomUUID(),
        internalCode: `${productCode}-${sequence}`,
        claimCode,
        tokenHash: await sha256(token),
        qrUrl: `/r/${token}`,
      };
    }));

    for (let index = 0; index < unitPayloads.length; index += Math.floor(MAX_WRITE_OPERATIONS / 2)) {
      const batch = writeBatch(db);
      for (const unit of unitPayloads.slice(index, index + Math.floor(MAX_WRITE_OPERATIONS / 2))) {
        batch.set(doc(db, "inventory_units", unit.unitId), {
          id: unit.unitId,
          stock_batch_id: stockBatchId,
          card_design_id: input.cardDesignId,
          internal_inventory_code: unit.internalCode,
          business_status: null,
          fulfillment_status: "qr_generated",
          current_location_id: null,
          public_claim_code: unit.claimCode,
          public_claim_token_hash: unit.tokenHash,
          qr_generated_at: now.toISOString(),
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          schema_version: 1,
        });
        batch.set(doc(db, "qr_print_job_items", unit.itemId), {
          id: unit.itemId,
          print_job_id: printJobId,
          inventory_unit_id: unit.unitId,
          public_claim_code: unit.claimCode,
          qr_url: unit.qrUrl,
          generated_at: now.toISOString(),
          schema_version: 1,
        });
      }
      await batch.commit();
    }

    await updateDoc(doc(db, "qr_print_jobs", printJobId), {
      status: "ready",
      generated_items: input.quantity,
      updated_at: new Date().toISOString(),
    });

    return { stockOrderId, stockBatchId, printJobId, quantity: input.quantity, documentNumber };
  },

  async receiveStockProductionOrder(stockOrderId: string): Promise<number> {
    const stockOrderRef = doc(db, "stock_production_orders", stockOrderId);
    const stockOrder = await getDoc(stockOrderRef);
    if (!stockOrder.exists()) throw new Error("Nie znaleziono zlecenia magazynowego.");
    const locationId = stockOrder.data().location_id || null;
    const batches = await getDocs(query(collection(db, "stock_batches"), where("production_order_id", "==", stockOrderId)));
    const unitDocs = [] as Array<{ id: string; data: Record<string, unknown> }>;
    for (const batchDoc of batches.docs) {
      const units = await getDocs(query(collection(db, "inventory_units"), where("stock_batch_id", "==", batchDoc.id)));
      unitDocs.push(...units.docs.map((unit) => ({ id: unit.id, data: unit.data() })));
    }
    const receivable = unitDocs.filter((unit) => ["qr_generated", "qr_applied", "reserved"].includes(String(unit.data.fulfillment_status)));
    for (let index = 0; index < receivable.length; index += MAX_WRITE_OPERATIONS) {
      const batch = writeBatch(db);
      for (const unit of receivable.slice(index, index + MAX_WRITE_OPERATIONS)) {
        batch.update(doc(db, "inventory_units", unit.id), { fulfillment_status: "in_stock", current_location_id: locationId, updated_at: new Date().toISOString() });
      }
      await batch.commit();
    }
    const finalBatch = writeBatch(db);
    for (const batchDoc of batches.docs) {
      finalBatch.update(batchDoc.ref, { production_status: "received", received_at: new Date().toISOString(), location_id: locationId });
    }
    finalBatch.update(stockOrderRef, { status: "received", received_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await finalBatch.commit();
    return receivable.length;
  },

  async setUnitStatus(unitId: string, status: InventoryStatus): Promise<void> {
    await updateDoc(doc(db, "inventory_units", unitId), { fulfillment_status: status, updated_at: new Date().toISOString() });
  },

  async getInventorySnapshot() {
    const [countries, designs, batches, units, orders] = await Promise.all([
      getDocs(collection(db, "countries")),
      getDocs(collection(db, "card_designs")),
      getDocs(collection(db, "stock_batches")),
      getDocs(collection(db, "inventory_units")),
      getDocs(collection(db, "stock_production_orders")),
    ]);
    return {
      countries: countries.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<LocalInventoryCountry, "id">) })),
      designs: designs.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<LocalInventoryDesign, "id">) })),
      batches: batches.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<LocalInventoryBatch, "id">) })),
      units: units.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<LocalInventoryUnit, "id">) })),
      orders: orders.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<LocalStockOrder, "id">) })),
    };
  },

  async getUnitEvents(unitId: string) {
    const snapshot = await getDocs(query(collection(db, "inventory_unit_events"), where("inventory_unit_id", "==", unitId)));
    const events: Array<Record<string, unknown> & { id: string }> = snapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
    return events
      .sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  },

  async deleteUnit(unitId: string): Promise<void> {
    await deleteDoc(doc(db, "inventory_units", unitId));
  },

  /**
   * Development-only cleanup used by the administrator's test inventory
   * button. Keep the scope identical to the former database cleanup: QR
   * print items, their jobs, and inventory units. Production orders and
   * batches remain as an audit trail and are not silently erased.
   */
  async clearTestInventory(): Promise<void> {
    const collectionsToClear = ["qr_print_job_items", "qr_print_jobs", "inventory_units"] as const;

    for (const collectionName of collectionsToClear) {
      const snapshot = await getDocs(collection(db, collectionName));
      for (let index = 0; index < snapshot.docs.length; index += MAX_WRITE_OPERATIONS) {
        const batch = writeBatch(db);
        for (const item of snapshot.docs.slice(index, index + MAX_WRITE_OPERATIONS)) {
          batch.delete(item.ref);
        }
        await batch.commit();
      }
    }
  },
};
