import { json, preflight } from "../_lib/http.js";

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const token = process.env.INPOST_SHIPX_TOKEN || "";
    const environment = (process.env.INPOST_SHIPX_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
    if (!token) return json({ error: "inpost_not_configured" }, 503);
    const body = await request.json() as { shipment_id?: string };
    if (!body.shipment_id) return json({ error: "shipment_id_required" }, 400);
    const baseUrl = environment === "production" ? "https://api-shipx-pl.easypack24.net/v1" : "https://sandbox-api-shipx-pl.easypack24.net/v1";
    const response = await fetch(`${baseUrl}/shipments/${encodeURIComponent(body.shipment_id)}/buy`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    const result = await response.json().catch(() => null) as { message?: string } | null;
    return response.ok ? json({ success: true, data: result }) : json({ error: result?.message || "inpost_buy_failed" }, response.status);
  },
};
