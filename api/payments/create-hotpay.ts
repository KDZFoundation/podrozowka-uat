import crypto from "node:crypto";
import { fromFirestoreFields, readDocument, writeDocument } from "../_lib/gcp-firestore.js";
import { json, preflight } from "../_lib/http.js";

type CheckoutItem = { card_design_id?: string; quantity?: number; secondary_language_code?: string };

const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const safeItems = (value: unknown): CheckoutItem[] =>
  Array.isArray(value) ? value.filter((item): item is CheckoutItem => Boolean(item && typeof item === "object")) : [];

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    try {
      const body = await request.json() as Record<string, unknown>;
      const items = safeItems(body.items);
      const totalQuantity = items.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.quantity) || 0)), 0);
      if (totalQuantity < 10) return json({ error: "minimum_order_quantity_10" }, 400);

      const orderItems = await Promise.all(items.map(async (item) => {
        if (!item.card_design_id) throw new Error("missing_card_design_id");
        const document = await readDocument("card_designs", item.card_design_id);
        const design = fromFirestoreFields(document.fields);
        const data = design as Record<string, unknown>;
        if (data.active === false) throw new Error("card_design_unavailable");
        const quantity = Math.floor(Number(item.quantity) || 0);
        const priceGrosze = Number(data.price_grosze || 0);
        if (quantity < 1 || priceGrosze < 1) throw new Error("invalid_order_item");
        return {
          card_design_id: item.card_design_id,
          title: String(data.title || "Podróżówka"),
          quantity,
          unit_price_grosze: priceGrosze,
          total_price_grosze: priceGrosze * quantity,
          language_code: String(data.language_code || "pl"),
          secondary_language_code: item.secondary_language_code || null,
        };
      }));

      const shippingCostGrosze = Math.max(0, Math.floor(Number(body.shipping_cost_grosze) || 0));
      const itemsTotalGrosze = orderItems.reduce((sum, item) => sum + item.total_price_grosze, 0);
      const totalGrosze = itemsTotalGrosze + shippingCostGrosze;
      const orderId = crypto.randomUUID();
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
      const origin = typeof body.origin_url === "string" ? body.origin_url : "https://podrozowka.web.app";
      const returnUrl = `${origin}/checkout/potwierdzenie?order=${encodeURIComponent(orderNumber)}`;
      const customerEmail = typeof body.customer_email === "string" ? body.customer_email : "";

      await writeDocument("orders", orderId, {
        id: orderId,
        order_number: orderNumber,
        guest_email: customerEmail,
        status: "new",
        payment_method: "hotpay",
        payment_status: "pending",
        total_amount_grosze: totalGrosze,
        shipping_cost_grosze: shippingCostGrosze,
        items: orderItems,
        shipping_method: body.shipping_method || "courier",
        pickup_point: body.pickup_point || null,
        shipping_address: body.shipping_address || null,
        invoice: body.invoice || { requested: false },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (body.payment_method === "cod") {
        return json({ ok: true, payment_method: "cod", order_number: orderNumber, redirect_url: `${returnUrl}&cod=1` });
      }

      const secret = process.env.HOTPAY_SECRET;
      const password = process.env.HOTPAY_NOTIFICATION_PASSWORD;
      if (!secret || !password) return json({ error: "hotpay_not_configured", order_number: orderNumber }, 503);

      const amount = (totalGrosze / 100).toFixed(2);
      const serviceName = `Podróżówka - zamówienie ${orderNumber}`;
      const form = new URLSearchParams({
        SEKRET: secret,
        KWOTA: amount,
        NAZWA_USLUGI: serviceName,
        ADRES_WWW: returnUrl,
        ID_ZAMOWIENIA: orderNumber,
        EMAIL: customerEmail,
        TYP: "INIT",
        HASH: sha256(`${password};${amount};${serviceName};${returnUrl};${orderNumber};${secret}`),
      });
      const response = await fetch("https://platnosc.hotpay.pl/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      const result = await response.json().catch(() => null) as { STATUS?: boolean; URL?: string; WIADOMOSC?: string } | null;
      if (!response.ok || !result?.STATUS || !result.URL) return json({ error: result?.WIADOMOSC || "hotpay_initialization_failed", order_number: orderNumber }, 502);
      return json({ ok: true, payment_gateway: "hotpay", order_number: orderNumber, redirect_url: result.URL });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "payment_initialization_failed" }, 500);
    }
  },
};
