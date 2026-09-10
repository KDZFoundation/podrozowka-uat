import { json, preflight } from "../../../../api/_lib/http.js";
import { fromFirestoreFields, readDocument } from "../../../../api/_lib/gcp-firestore.js";
import { gcpDownloadBinaryObject } from "../../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../../auth/require-admin.js";

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;
    const shipmentId = new URL(request.url).pathname.split("/").pop() || "";
    if (!shipmentId) return json({ error: "shipment_id_required" }, 400);
    try {
      const document = await readDocument("shipments", shipmentId);
      const shipment = fromFirestoreFields(document.fields) as Record<string, unknown>;
      const bucket = typeof shipment.orlen_label_bucket === "string" ? shipment.orlen_label_bucket : "";
      const object = typeof shipment.orlen_label_object === "string" ? shipment.orlen_label_object : "";
      const generation = typeof shipment.orlen_label_generation === "string" ? shipment.orlen_label_generation : "";
      const tracking = typeof shipment.orlen_tracking_number === "string" ? shipment.orlen_tracking_number : shipmentId;
      if (!bucket || !object || !generation) return json({ error: "orlen_paczka_label_not_available" }, 404);
      const bytes = await gcpDownloadBinaryObject(bucket, object, generation);
      return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="orlen-paczka-${tracking}.pdf"` } });
    } catch (error) {
      console.error("[orlen-paczka label]", error instanceof Error ? error.message : error);
      return json({ error: "orlen_paczka_label_download_failed" }, 502);
    }
  },
};
