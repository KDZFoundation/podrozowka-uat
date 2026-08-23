import { json } from "../../_lib/http.js";

export default {
  async fetch(request: Request) {
    const token = process.env.INPOST_SHIPX_TOKEN || "";
    const environment = (process.env.INPOST_SHIPX_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
    if (!token) return json({ error: "inpost_not_configured" }, 503);
    const shipmentId = new URL(request.url).pathname.split("/").pop();
    if (!shipmentId) return json({ error: "shipment_id_required" }, 400);
    const baseUrl = environment === "production" ? "https://api-shipx-pl.easypack24.net/v1" : "https://sandbox-api-shipx-pl.easypack24.net/v1";
    const response = await fetch(`${baseUrl}/shipments/${encodeURIComponent(shipmentId)}/label?format=pdf&type=normal`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return json({ error: "inpost_label_unavailable" }, response.status);
    return new Response(await response.arrayBuffer(), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="inpost-${shipmentId}.pdf"` } });
  },
};
