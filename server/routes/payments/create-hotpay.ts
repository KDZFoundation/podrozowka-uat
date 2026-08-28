import crypto from "node:crypto";
import { fromFirestoreFields, queryDocuments, readDocument, updateDocument, writeDocument } from "../../../api/_lib/gcp-firestore.js";
import { json, preflight } from "../../../api/_lib/http.js";
import { releaseExpiredReservations, reserveDesignAvailability, updateReservationStatus } from "../../../api/_lib/design-reservation.js";

type CheckoutItem = { card_design_id?: string; quantity?: number; primary_language_code?: string; secondary_language_code?: string };

const normalizeLanguageCode = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const normalizeIdempotencyKey = (value: unknown) => {
  if (typeof value !== "string") return "";
  const key = value.trim();
  return /^[A-Za-z0-9_-]{16,160}$/.test(key) ? key : "";
};
const deterministicOrderId = (value: string) => crypto.createHash("sha256").update(`order:${value}`, "utf8").digest("hex").slice(0, 32);

const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const safeItems = (value: unknown): CheckoutItem[] =>
  Array.isArray(value) ? value.filter((item): item is CheckoutItem => Boolean(item && typeof item === "object")) : [];

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let reservationId: string | null = null;
    try {
      const body = await request.json() as Record<string, unknown>;
      const suppliedIdempotencyKey = normalizeIdempotencyKey(request.headers.get("Idempotency-Key") || body.idempotency_key);
      if ((request.headers.has("Idempotency-Key") || typeof body.idempotency_key === "string") && !suppliedIdempotencyKey) {
        return json({ error: "invalid_idempotency_key" }, 400);
      }
      const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID();
      const items = safeItems(body.items);
      const totalQuantity = items.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.quantity) || 0)), 0);
      if (totalQuantity < 10) return json({ error: "minimum_order_quantity_10" }, 400);
      await releaseExpiredReservations();

      const orderItems = await Promise.all(items.map(async (item) => {
        if (!item.card_design_id) throw new Error("missing_card_design_id");
        const document = await readDocument("card_designs", item.card_design_id);
        const design = fromFirestoreFields(document.fields);
        const data = design as Record<string, unknown>;
        if (data.active === false) throw new Error("card_design_unavailable");
        const countryId = typeof data.country_id === "string" ? data.country_id : "";
        if (!countryId) throw new Error("card_design_missing_country");
        const quantity = Math.floor(Number(item.quantity) || 0);
        const priceGrosze = Number(data.price_grosze || 0);
        if (quantity < 1 || priceGrosze < 1) throw new Error("invalid_order_item");
        const templates = await queryDocuments("card_language_templates", "country_id", { stringValue: countryId });
        const allowedLanguages = new Set(
          templates
            .map((template) => normalizeLanguageCode(template.data.language_code))
            .filter(Boolean),
        );
        const primaryLanguageCode = normalizeLanguageCode(item.primary_language_code);
        const secondaryLanguageCode = normalizeLanguageCode(item.secondary_language_code);
        if (!primaryLanguageCode) throw new Error("missing_primary_language");
        if (!allowedLanguages.has(primaryLanguageCode)) throw new Error("invalid_primary_language_for_country");
        if (secondaryLanguageCode && !allowedLanguages.has(secondaryLanguageCode)) {
          throw new Error("invalid_secondary_language_for_country");
        }
        if (secondaryLanguageCode && secondaryLanguageCode === primaryLanguageCode) {
          throw new Error("secondary_language_must_differ");
        }
        return {
          card_design_id: item.card_design_id,
          title: String(data.title || "Podróżówka"),
          quantity,
          unit_price_grosze: priceGrosze,
          total_price_grosze: priceGrosze * quantity,
          unit_price_pln: priceGrosze / 100,
          total_price_pln: (priceGrosze * quantity) / 100,
          language_code: primaryLanguageCode,
          product_code: String(data.product_code || ""),
          secondary_language_code: secondaryLanguageCode || null,
          primary_language_code: primaryLanguageCode,
        };
      }));

      const shippingCostGrosze = Math.max(0, Math.floor(Number(body.shipping_cost_grosze) || 0));
      const itemsTotalGrosze = orderItems.reduce((sum, item) => sum + item.total_price_grosze, 0);
      const totalGrosze = itemsTotalGrosze + shippingCostGrosze;
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const customerEmail = typeof body.customer_email === "string" ? body.customer_email : "";
      const orderId = suppliedIdempotencyKey
        ? deterministicOrderId(`${userId}:${customerEmail}:${idempotencyKey}`)
        : crypto.randomUUID();
      const existingOrder = await readDocument("orders", orderId).catch(() => null);
      if (existingOrder?.fields) {
        const data = fromFirestoreFields(existingOrder.fields) as Record<string, unknown>;
        const orderNumber = String(data.order_number || "");
        if (data.payment_method === "cod") {
          return json({ ok: true, payment_method: "cod", order_id: orderId, order_number: orderNumber, redirect_url: `${String(data.return_url || "")}&cod=1` });
        }
        if (typeof data.hotpay_redirect_url === "string" && data.hotpay_redirect_url) {
          return json({ ok: true, payment_gateway: "hotpay", order_id: orderId, order_number: orderNumber, redirect_url: data.hotpay_redirect_url });
        }
        return json({ error: data.payment_status === "initialization_failed" ? "hotpay_initialization_failed" : "payment_initialization_in_progress", order_id: orderId, order_number: orderNumber }, 409);
      }
      const reservation = await reserveDesignAvailability(orderId, orderItems.map((item) => ({ card_design_id: item.card_design_id, quantity: item.quantity })));
      reservationId = reservation?.id || null;
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const origin = typeof body.origin_url === "string" ? body.origin_url : "https://podrozowka.web.app";
      const returnUrl = `${origin}/checkout/potwierdzenie?order=${encodeURIComponent(orderNumber)}&order_id=${encodeURIComponent(orderId)}`;

      try {
        await writeDocument("orders", orderId, {
        id: orderId,
        order_number: orderNumber,
        user_id: userId,
        guest_email: customerEmail,
        customer_email: customerEmail,
        status: "new",
        payment_method: body.payment_method === "cod" ? "cod" : "hotpay",
        payment_status: "pending",
        checkout_idempotency_key: suppliedIdempotencyKey || null,
        return_url: returnUrl,
        total_amount_grosze: totalGrosze,
        total_amount_pln: totalGrosze / 100,
        total_amount: totalGrosze / 100,
        shipping_cost_grosze: shippingCostGrosze,
        shipping_cost_pln: shippingCostGrosze / 100,
        currency: "PLN",
        items: orderItems,
        shipping_method: body.shipping_method || "inpost_courier",
        pickup_point: body.pickup_point || null,
        shipping_address: body.shipping_address || null,
        invoice: body.invoice || { requested: false },
        created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          reservation_id: reservation?.id || null,
          reservation_expires_at: reservation?.expires_at || null,
        });
      } catch (error) {
        const duplicateOrder = await readDocument("orders", orderId).catch(() => null);
        if (duplicateOrder?.fields) {
          const data = fromFirestoreFields(duplicateOrder.fields) as Record<string, unknown>;
          const duplicateOrderNumber = String(data.order_number || "");
          if (typeof data.hotpay_redirect_url === "string" && data.hotpay_redirect_url) {
            return json({ ok: true, payment_gateway: "hotpay", order_id: orderId, order_number: duplicateOrderNumber, redirect_url: data.hotpay_redirect_url });
          }
          return json({ error: "payment_initialization_in_progress", order_id: orderId, order_number: duplicateOrderNumber }, 409);
        }
        await updateReservationStatus(reservationId, "released").catch(() => undefined);
        throw error;
      }

      if (body.payment_method === "cod") {
        return json({ ok: true, payment_method: "cod", order_id: orderId, order_number: orderNumber, redirect_url: `${returnUrl}&cod=1` });
      }

      const secret = process.env.HOTPAY_SECRET;
      const password = process.env.HOTPAY_NOTIFICATION_PASSWORD;
      if (!secret || !password) {
        await updateReservationStatus(reservationId, "released").catch(() => undefined);
        await updateDocument(`orders/${orderId}`, { payment_status: "initialization_failed", status: "payment_initialization_failed", updated_at: new Date().toISOString() }).catch(() => undefined);
        return json({ error: "hotpay_not_configured", order_number: orderNumber }, 503);
      }

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
      if (!response.ok || !result?.STATUS || !result.URL) {
        await updateReservationStatus(reservationId, "released").catch(() => undefined);
        await updateDocument(`orders/${orderId}`, { payment_status: "initialization_failed", status: "payment_initialization_failed", updated_at: new Date().toISOString() }).catch(() => undefined);
        return json({ error: result?.WIADOMOSC || "hotpay_initialization_failed", order_number: orderNumber }, 502);
      }
      await updateDocument(`orders/${orderId}`, { hotpay_redirect_url: result.URL, updated_at: new Date().toISOString() });
      return json({ ok: true, payment_gateway: "hotpay", order_id: orderId, order_number: orderNumber, redirect_url: result.URL });
    } catch (error) {
      // A gateway/network error must not leave finite stock blocked for 15 minutes.
      await updateReservationStatus(reservationId, "released").catch(() => undefined);
      const message = error instanceof Error ? error.message : "payment_initialization_failed";
      const invalidCheckoutInput = new Set([
        "missing_card_design_id",
        "card_design_missing_country",
        "invalid_order_item",
        "missing_primary_language",
        "invalid_primary_language_for_country",
        "invalid_secondary_language_for_country",
        "secondary_language_must_differ",
      ]);
      return json({ error: message }, message === "design_out_of_stock" ? 409 : invalidCheckoutInput.has(message) ? 400 : 500);
    }
  },
};
