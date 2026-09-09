import crypto from "node:crypto";
import { json, preflight } from "../../../api/_lib/http.js";
import { fromFirestoreFields, readDocument, updateDocumentIfCurrent } from "../../../api/_lib/gcp-firestore.js";
import { gcpCreateOnlyBinaryObject } from "../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../auth/require-admin.js";
import { createOrlenPaczkaLabel, splitPersonName } from "../../services/orlen-paczka.js";

type RecordData = Record<string, unknown>;

const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): RecordData => value && typeof value === "object" && !Array.isArray(value) ? value as RecordData : {};
const parcelSize = (value: unknown): "S" | "M" | "L" => value === "medium" || value === "M" ? "M" : value === "large" || value === "L" ? "L" : "S";
const labelBucket = () => process.env.ORLEN_PACZKA_LABEL_BUCKET || process.env.POD_PRINT_ARTIFACT_BUCKET || "";

const senderFromSettings = async () => {
  const document = await readDocument("config", "orlen_paczka").catch(() => null);
  const settings = document?.fields ? fromFirestoreFields(document.fields) as RecordData : {};
  const environment = (name: string) => string(process.env[name]);
  return {
    name: environment("ORLEN_PACZKA_SENDER_NAME") || string(settings.sender_name),
    email: environment("ORLEN_PACZKA_SENDER_EMAIL") || string(settings.sender_email),
    phone: environment("ORLEN_PACZKA_SENDER_PHONE") || string(settings.sender_phone),
    street: environment("ORLEN_PACZKA_SENDER_STREET") || string(settings.sender_street),
    city: environment("ORLEN_PACZKA_SENDER_CITY") || string(settings.sender_city),
    postCode: environment("ORLEN_PACZKA_SENDER_POSTAL_CODE") || string(settings.sender_postal_code),
  };
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;
    try {
      const body = await request.json().catch(() => null) as RecordData | null;
      const shipmentId = string(body?.shipment_id);
      if (!shipmentId) return json({ error: "shipment_id_required" }, 400);
      const shipmentDocument = await readDocument("shipments", shipmentId).catch(() => null);
      if (!shipmentDocument?.fields || !shipmentDocument.updateTime) return json({ error: "shipment_not_found" }, 404);
      const shipment = fromFirestoreFields(shipmentDocument.fields) as RecordData;
      if (string(shipment.orlen_tracking_number)) return json({
        success: true,
        already_created: true,
        tracking_number: string(shipment.orlen_tracking_number),
        label_available: Boolean(string(shipment.orlen_label_object)),
      });
      if (string(shipment.orlen_creation_state) === "creating") return json({ error: "orlen_paczka_creation_in_progress" }, 409);

      const orderId = string(shipment.order_id);
      if (!orderId) return json({ error: "shipment_order_id_missing" }, 422);
      const orderDocument = await readDocument("orders", orderId).catch(() => null);
      if (!orderDocument?.fields) return json({ error: "shipment_order_not_found" }, 404);
      const order = fromFirestoreFields(orderDocument.fields) as RecordData;
      if (string(order.shipping_method) !== "orlen_paczka") return json({ error: "shipment_not_orlen_paczka" }, 422);
      if (string(order.payment_status) !== "paid") return json({ error: "shipment_order_not_paid" }, 422);
      const pickup = object(order.pickup_point);
      const address = object(order.shipping_address);
      const userDocument = string(order.user_id) ? await readDocument("users", string(order.user_id)).catch(() => null) : null;
      const user = userDocument?.fields ? fromFirestoreFields(userDocument.fields) as RecordData : {};
      const destinationCode = string(pickup.code);
      const recipientName = `${string(address.first_name || address.name || user.first_name || user.display_name || user.full_name)} ${string(address.last_name || user.last_name)}`.trim();
      const recipient = splitPersonName(recipientName);
      const sender = await senderFromSettings();
      const bucket = labelBucket();
      if (!bucket) return json({ error: "orlen_paczka_label_bucket_not_configured" }, 503);
      const recipientPhone = string(address.phone || user.phone || user.phone_number);
      const recipientEmail = string(address.email || order.customer_email || order.guest_email || user.email);
      if (!destinationCode || !recipient.firstName || !recipientPhone || !recipientEmail) {
        return json({ error: "orlen_paczka_receiver_data_incomplete" }, 422);
      }
      if (!sender.name || !sender.email || !sender.phone || !sender.street || !sender.city || !sender.postCode) {
        return json({ error: "orlen_paczka_sender_data_incomplete" }, 422);
      }

      try {
        await updateDocumentIfCurrent(`shipments/${shipmentId}`, { orlen_creation_state: "creating", orlen_creation_started_at: new Date().toISOString() }, shipmentDocument.updateTime);
      } catch {
        return json({ error: "orlen_paczka_creation_in_progress" }, 409);
      }

      const label = await createOrlenPaczkaLabel({
        destinationCode,
        boxSize: parcelSize(body?.size),
        packValueGrosze: Math.round(Number(order.total_amount_grosze ?? Number(order.total_amount_pln || order.total_amount || 0) * 100)),
        recipient: {
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          email: recipientEmail,
          phone: recipientPhone,
          streetName: string(address.street),
          buildingNumber: "",
          city: string(address.city),
          postCode: string(address.postal_code),
        },
        sender,
        reference: string(order.order_number) || shipmentId,
      });
      const safeTracking = label.trackingNumber.replace(/[^A-Za-z0-9_-]/g, "");
      const objectName = `orlen-paczka-labels/${shipmentId}/${safeTracking}.pdf`;
      const stored = await gcpCreateOnlyBinaryObject(bucket, objectName, label.bytes, "application/pdf", {
        carrier: "orlen_paczka", shipment_id: shipmentId, tracking_number: safeTracking, label_sha256: crypto.createHash("sha256").update(label.bytes).digest("hex"),
      });
      await updateDocumentIfCurrent(`shipments/${shipmentId}`, {
        carrier: "ORLEN Paczka",
        tracking_number: label.trackingNumber,
        shipping_method: "orlen_paczka",
        orlen_tracking_number: label.trackingNumber,
        orlen_destination_code: label.destinationCode,
        orlen_label_bucket: stored.bucket,
        orlen_label_object: stored.object,
        orlen_label_generation: stored.generation,
        orlen_label_created_at: new Date().toISOString(),
        orlen_creation_state: "created",
        updated_at: new Date().toISOString(),
      }, (await readDocument("shipments", shipmentId)).updateTime || "");
      return json({ success: true, tracking_number: label.trackingNumber, label_available: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "orlen_paczka_shipment_failed";
      console.error("[orlen-paczka create shipment]", message);
      const safeError = message.startsWith("orlen_paczka_") || message.startsWith("gcs_") ? message : "orlen_paczka_shipment_failed";
      return json({ error: safeError }, safeError.endsWith("not_configured") ? 503 : 502);
    }
  },
};
