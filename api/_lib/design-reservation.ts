import crypto from "node:crypto";
import {
  commitWrites,
  createDocumentWrite,
  fromFirestoreFields,
  listDocuments,
  readDocument,
  updateDocumentWrite,
} from "./gcp-firestore.js";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 3;

type ReservationLine = { design_id: string; quantity: number };
type ReservationData = {
  id: string;
  order_id: string;
  status: "pending" | "confirmed" | "released";
  expires_at: string;
  created_at: string;
  updated_at: string;
  lines: ReservationLine[];
};

const activeReservationTotals = async (designIds: string[], now: number) => {
  const totals = new Map<string, number>();
  const reservations = await listDocuments("inventory_reservations", 1000);
  for (const reservation of reservations) {
    const data = reservation.data as Partial<ReservationData>;
    if (data.status !== "pending") continue;
    if (Date.parse(String(data.expires_at || "")) <= now) continue;
    for (const line of Array.isArray(data.lines) ? data.lines : []) {
      if (designIds.includes(line.design_id)) totals.set(line.design_id, (totals.get(line.design_id) || 0) + Math.max(0, Number(line.quantity) || 0));
    }
  }
  return totals;
};

/** Reserve finite stock before an order is sent to HotPay. POD-only designs are skipped. */
export const reserveDesignAvailability = async (orderId: string, items: Array<{ card_design_id: string; quantity: number }>) => {
  const requested = new Map<string, number>();
  for (const item of items) requested.set(item.card_design_id, (requested.get(item.card_design_id) || 0) + Math.max(0, Math.floor(item.quantity)));
  const designIds = [...requested.keys()];
  if (!designIds.length) return null;

  const reservationId = crypto.createHash("sha256").update(`reservation:${orderId}`).digest("hex").slice(0, 32);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const existing = await readDocument("inventory_reservations", reservationId).catch(() => null);
    if (existing?.fields) {
      const data = fromFirestoreFields(existing.fields) as Partial<ReservationData>;
      if (data.status === "pending" || data.status === "confirmed") {
        return { id: reservationId, expires_at: String(data.expires_at || "") };
      }
      throw new Error("design_reservation_released");
    }

    try {
      const now = Date.now();
      const lines: ReservationLine[] = [];
      const snapshots: Array<{ id: string; reserved: number; updateTime?: string }> = [];
      const activeTotals = await activeReservationTotals(designIds, now);
      for (const designId of designIds) {
        const snapshot = await readDocument("card_designs", designId);
        const data = fromFirestoreFields(snapshot.fields) as Record<string, unknown>;
        const type = String(data.inventory_type || "pod");
        const stock = Number(data.stock_quantity);
        if ((type !== "stock" && type !== "hybrid") || !Number.isFinite(stock) || stock < 0) continue;
        const reserved = Math.max(Number(data.reserved_quantity) || 0, activeTotals.get(designId) || 0);
        const quantity = requested.get(designId) || 0;
        if (stock - reserved < quantity) throw new Error("design_out_of_stock");
        lines.push({ design_id: designId, quantity });
        snapshots.push({ id: designId, reserved, updateTime: snapshot.updateTime });
      }
      if (!lines.length) return null;

      const createdAt = new Date(now).toISOString();
      const reservation: ReservationData = {
        id: reservationId,
        order_id: orderId,
        status: "pending",
        expires_at: new Date(now + RESERVATION_TTL_MS).toISOString(),
        created_at: createdAt,
        updated_at: createdAt,
        lines,
      };
      await commitWrites([
        ...snapshots.map((snapshot) => updateDocumentWrite(`card_designs/${snapshot.id}`, {
          reserved_quantity: snapshot.reserved + (requested.get(snapshot.id) || 0),
          updated_at: createdAt,
        }, snapshot.updateTime)),
        createDocumentWrite(`inventory_reservations/${reservationId}`, reservation),
      ]);
      return { id: reservationId, expires_at: reservation.expires_at };
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
    }
  }
  return null;
};

export const updateReservationStatus = async (reservationId: string | null | undefined, status: "confirmed" | "released") => {
  if (!reservationId) return;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const reservationDoc = await readDocument("inventory_reservations", reservationId).catch(() => null);
    if (!reservationDoc?.fields) return;
    const reservation = fromFirestoreFields(reservationDoc.fields) as Partial<ReservationData>;
    if (reservation.status !== "pending") return;
    const lines = Array.isArray(reservation.lines) ? reservation.lines : [];
    const now = new Date().toISOString();
    const writes: unknown[] = [];
    if (status === "released") {
      for (const line of lines) {
        const designDoc = await readDocument("card_designs", line.design_id).catch(() => null);
        if (!designDoc?.fields) continue;
        const design = fromFirestoreFields(designDoc.fields) as Record<string, unknown>;
        writes.push(updateDocumentWrite(`card_designs/${line.design_id}`, {
          reserved_quantity: Math.max(0, (Number(design.reserved_quantity) || 0) - Math.max(0, Number(line.quantity) || 0)),
          updated_at: now,
        }, designDoc.updateTime));
      }
    }
    writes.push(updateDocumentWrite(`inventory_reservations/${reservationId}`, { status, updated_at: now }, reservationDoc.updateTime));
    try {
      await commitWrites(writes);
      return;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
    }
  }
};

/** Best-effort garbage collection for abandoned checkout reservations. */
export const releaseExpiredReservations = async () => {
  const now = Date.now();
  const reservations = await listDocuments("inventory_reservations", 1000).catch(() => []);
  for (const reservation of reservations) {
    const data = reservation.data as Partial<ReservationData>;
    if (data.status === "pending" && Date.parse(String(data.expires_at || "")) <= now) {
      await updateReservationStatus(reservation.id, "released").catch(() => undefined);
    }
  }
};
