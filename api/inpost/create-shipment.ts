import { json, preflight } from "../_lib/http";

const inpostConfig = () => {
  const environment = (process.env.INPOST_SHIPX_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
  return {
    environment,
    organizationId: process.env.INPOST_SHIPX_ORGANIZATION_ID || "",
    token: process.env.INPOST_SHIPX_TOKEN || "",
    baseUrl: environment === "production" ? "https://api-shipx-pl.easypack24.net/v1" : "https://sandbox-api-shipx-pl.easypack24.net/v1",
  };
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const config = inpostConfig();
    if (!config.organizationId || !config.token) return json({ error: "inpost_not_configured" }, 503);
    try {
      const body = await request.json() as Record<string, unknown>;
      const receiverPoint = typeof body.receiver_point === "string" ? body.receiver_point : "";
      const address = body.receiver_address as Record<string, string> | undefined;
      const isLocker = Boolean(receiverPoint || !address);
      const payload = {
        receiver: {
          first_name: "Klient",
          last_name: "Podróżówka",
          email: typeof body.customer_email === "string" ? body.customer_email : "klient@podrozowka.pl",
          phone: String(body.customer_phone || "500000000").replace(/\D/g, "").slice(-9),
          ...(isLocker ? {} : { address: { street: address?.street || "Główna", building_number: address?.building_number || "1", city: address?.city || "Warszawa", post_code: address?.postal_code || "00-001", country_code: "PL" } }),
        },
        parcels: { template: body.size === "medium" ? "medium" : body.size === "large" ? "large" : "small" },
        service: isLocker ? "inpost_locker_standard" : "inpost_courier_standard",
        reference: typeof body.order_number === "string" ? body.order_number : `ORD-${Date.now()}`,
        ...(isLocker ? { custom_attributes: { target_point: receiverPoint || "KRA010" } } : {}),
      };
      const response = await fetch(`${config.baseUrl}/organizations/${config.organizationId}/shipments`, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { id?: string | number; status?: string; tracking_number?: string; message?: string } | null;
      if (!response.ok || !result?.id) return json({ error: result?.message || "inpost_shipment_failed" }, response.status || 502);
      return json({ success: true, shipment: { inpost_shipment_id: String(result.id), inpost_status: result.status || "created", tracking_number: result.tracking_number || null } });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "inpost_shipment_failed" }, 500);
    }
  },
};
