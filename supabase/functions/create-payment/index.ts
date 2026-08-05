import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const P24_MERCHANT_ID = Number(Deno.env.get("P24_MERCHANT_ID"));
const P24_POS_ID = Number(Deno.env.get("P24_POS_ID") || Deno.env.get("P24_MERCHANT_ID"));
const P24_CRC_KEY = Deno.env.get("P24_CRC_KEY")!;
const P24_API_KEY = Deno.env.get("P24_API_KEY")!;
const P24_SANDBOX_ENV = (Deno.env.get("P24_SANDBOX") || "true").toLowerCase() === "true";

async function resolveP24Mode(): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await admin
      .from("payment_settings")
      .select("p24_mode")
      .limit(1)
      .maybeSingle();
    if (data?.p24_mode) return data.p24_mode === "sandbox";
  } catch (_) { /* fall through to env */ }
  return P24_SANDBOX_ENV;
}

const SHIPPING_COST_GROSZE = 1399;
const COD_SHIPPING_COST_GROSZE = 1699;

async function ensureAndGetCodFlag(serviceClient: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await serviceClient
      .from("feature_flags")
      .select("is_enabled")
      .eq("key", "cod_payment_enabled")
      .maybeSingle();

    if (error || !data) {
      return false;
    }
    return !!data.is_enabled;
  } catch (err) {
    console.error("Error checking feature flag:", err);
    return false;
  }
}

async function sha384Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-384", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function normalizeNip(raw: string): string {
  return (raw || "").replace(/[^0-9]/g, "");
}
function isValidNip(raw: string): boolean {
  const nip = normalizeNip(raw);
  if (nip.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let s = 0;
  for (let i = 0; i < 9; i++) s += w[i] * Number(nip[i]);
  const c = s % 11;
  if (c === 10) return false;
  return c === Number(nip[9]);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  function jsonResp(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return jsonResp({ error: "unauthorized" }, 401);
    const userEmail = String(claimsData.claims.email || "");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonResp({ error: "invalid_body" }, 400);

    const items = Array.isArray(body.items) ? body.items : null;
    const shippingCostGrosze = Number(body.shipping_cost_grosze);

    if (!items || items.length === 0 || items.length > 100) {
      return jsonResp({ error: "invalid_items" }, 400);
    }
    let totalQty = 0;
    for (const it of items) {
      if (!it || !isUuid(it.card_design_id) || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 1000) {
        return jsonResp({ error: "invalid_items" }, 400);
      }
      totalQty += it.quantity;
    }
    if (totalQty < 10) {
      return jsonResp({ error: "Minimalne zamówienie to 10 podróżówek" }, 400);
    }

    // Shipping method: 'inpost' (paczkomat) or 'courier' (home address)
    const shippingMethodRaw = typeof body.shipping_method === "string" ? body.shipping_method : "inpost";
    if (shippingMethodRaw !== "inpost" && shippingMethodRaw !== "courier") {
      return jsonResp({ error: "invalid_shipping_method" }, 400);
    }
    const shippingMethod: "inpost" | "courier" = shippingMethodRaw;

    // Pickup point (only for inpost)
    const pickup = body.pickup_point;
    let pickupName = "";
    let pickupAddress = "";
    let pickupCity = "";
    if (shippingMethod === "inpost") {
      if (!pickup || typeof pickup.name !== "string" || pickup.name.trim().length === 0) {
        return jsonResp({ error: "invalid_pickup_point" }, 400);
      }
      pickupName = String(pickup.name).slice(0, 200);
      pickupAddress = String(pickup.address || "").slice(0, 300);
      pickupCity = String(pickup.city || "").slice(0, 100);
    }

    // Courier address (only for courier)
    let shipName: string | null = null;
    let shipStreet: string | null = null;
    let shipPostal: string | null = null;
    let shipCity: string | null = null;
    let shipPhone: string | null = null;
    if (shippingMethod === "courier") {
      const addr = body.shipping_address;
      if (!addr || typeof addr !== "object") {
        return jsonResp({ error: "invalid_shipping_address" }, 400);
      }
      shipName = String(addr.name || "").trim();
      shipStreet = String(addr.street || "").trim();
      shipPostal = String(addr.postal_code || "").trim();
      shipCity = String(addr.city || "").trim();
      shipPhone = String(addr.phone || "").replace(/[^0-9+]/g, "");
      if (!shipName || shipName.length > 200) return jsonResp({ error: "shipping_name_required" }, 400);
      if (!shipStreet || shipStreet.length > 300) return jsonResp({ error: "shipping_street_required" }, 400);
      if (!/^[0-9]{2}-[0-9]{3}$/.test(shipPostal)) return jsonResp({ error: "shipping_postal_code_invalid" }, 400);
      if (!shipCity || shipCity.length > 100) return jsonResp({ error: "shipping_city_required" }, 400);
      if (shipPhone.length < 9 || shipPhone.length > 15) return jsonResp({ error: "shipping_phone_invalid" }, 400);
    }

    const paymentMethodRaw = typeof body.payment_method === "string" ? body.payment_method : "online";
    if (paymentMethodRaw !== "online" && paymentMethodRaw !== "cod") {
      return jsonResp({ error: "invalid_payment_method" }, 400);
    }
    const paymentMethod: "online" | "cod" = paymentMethodRaw;

    if (paymentMethod === "cod") {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const codEnabled = await ensureAndGetCodFlag(serviceClient);
      if (!codEnabled) {
        return jsonResp({ error: "cod_payment_disabled" }, 400);
      }
    }

    const expectedShipping = paymentMethod === "cod" ? COD_SHIPPING_COST_GROSZE : SHIPPING_COST_GROSZE;
    if (shippingCostGrosze !== expectedShipping) {
      return jsonResp({ error: "invalid_shipping_cost" }, 400);
    }

    // Invoice fields (optional block)
    const invoice = body.invoice && typeof body.invoice === "object" ? body.invoice : null;
    const invoiceRequested = !!invoice?.requested;
    let companyName: string | null = null;
    let companyNip: string | null = null;
    let companyAddress: string | null = null;
    if (invoiceRequested) {
      companyName = String(invoice.company_name || "").trim();
      companyNip = normalizeNip(String(invoice.company_nip || ""));
      companyAddress = String(invoice.company_address || "").trim();
      if (companyName.length === 0 || companyName.length > 200) {
        return jsonResp({ error: "invoice_company_name_required" }, 400);
      }
      if (companyAddress.length === 0 || companyAddress.length > 500) {
        return jsonResp({ error: "invoice_company_address_required" }, 400);
      }
      if (!isValidNip(companyNip)) {
        return jsonResp({ error: "invoice_nip_invalid" }, 400);
      }
    }

    // Create order via RPC (runs with user's identity, RLS enforced)
    const { data: rpcData, error: rpcError } = await supabase.rpc("create_order", {
      _items: items.map((i: { card_design_id: string; quantity: number }) => ({ card_design_id: i.card_design_id, quantity: i.quantity })),
      _pickup_point_name: pickupName,
      _pickup_point_address: pickupAddress,
      _pickup_point_city: pickupCity,
      _shipping_cost: shippingCostGrosze / 100,
      _invoice_requested: invoiceRequested,
      _company_name: companyName,
      _company_nip: companyNip,
      _company_address: companyAddress,
      _payment_method: paymentMethod,
      _shipping_method: shippingMethod,
      _shipping_name: shipName,
      _shipping_street: shipStreet,
      _shipping_postal_code: shipPostal,
      _shipping_city: shipCity,
      _shipping_phone: shipPhone,
    });

    if (rpcError) {
      const msg = rpcError.message || "";
      const oos = msg.match(/out_of_stock:([^:]+):(\d+):(\d+)/);
      if (oos) {
        return jsonResp({
          error: "out_of_stock",
          card_design_id: oos[1],
          requested: Number(oos[2]),
          available: Number(oos[3]),
        }, 409);
      }
      if (msg.includes("invalid_design")) return jsonResp({ error: "invalid_design" }, 400);
      if (msg.includes("invalid_payment_method")) return jsonResp({ error: "invalid_payment_method" }, 400);
      if (msg.includes("invalid_shipping_method")) return jsonResp({ error: "invalid_shipping_method" }, 400);
      if (msg.includes("invalid_shipping_cost")) return jsonResp({ error: "invalid_shipping_cost" }, 400);
      if (msg.includes("pickup_point_required")) return jsonResp({ error: "invalid_pickup_point" }, 400);
      if (msg.includes("shipping_postal_code_invalid")) return jsonResp({ error: "shipping_postal_code_invalid" }, 400);
      if (msg.includes("shipping_phone_invalid")) return jsonResp({ error: "shipping_phone_invalid" }, 400);
      if (msg.startsWith("shipping_") || msg.includes("shipping_")) return jsonResp({ error: msg.split(":")[0] }, 400);
      if (msg.includes("unauthorized")) return jsonResp({ error: "unauthorized" }, 401);
      if (msg.includes("invoice_nip_invalid")) return jsonResp({ error: "invoice_nip_invalid" }, 400);
      if (msg.includes("invoice_company_name")) return jsonResp({ error: "invoice_company_name_required" }, 400);
      if (msg.includes("invoice_company_address")) return jsonResp({ error: "invoice_company_address_required" }, 400);
      console.error("create_order failed:", msg);
      return jsonResp({ error: "create_order_failed" }, 500);
    }

    const order = rpcData as { id: string; order_number: string; total_amount: number };
    const totalGrosze = Math.round(Number(order.total_amount) * 100);

    // COD: no P24 registration — order is placed, customer pays on delivery.
    if (paymentMethod === "cod") {
      return jsonResp({
        order_id: order.id,
        order_number: order.order_number,
        payment_method: "cod",
      });
    }

    // Sign P24 register request
    const origin = req.headers.get("Origin") || req.headers.get("origin") || "https://podrozowka.lovable.app";
    const sessionId = order.id;
    const signPayload = JSON.stringify({
      sessionId,
      merchantId: P24_MERCHANT_ID,
      amount: totalGrosze,
      currency: "PLN",
      crc: P24_CRC_KEY,
    });
    const sign = await sha384Hex(signPayload);

    const registerBody = {
      merchantId: P24_MERCHANT_ID,
      posId: P24_POS_ID,
      sessionId,
      amount: totalGrosze,
      currency: "PLN",
      description: `Podróżówka – zamówienie ${order.order_number}`,
      email: userEmail || "no-reply@podrozowka.pl",
      country: "PL",
      language: "pl",
      urlReturn: `${origin}/checkout/potwierdzenie?order=${encodeURIComponent(order.order_number)}`,
      urlStatus: `${SUPABASE_URL}/functions/v1/p24-webhook`,
      sign,
      encoding: "UTF-8",
    };

    const isSandbox = await resolveP24Mode();
    const p24ApiBase = isSandbox
      ? "https://sandbox.przelewy24.pl/api/v1"
      : "https://secure.przelewy24.pl/api/v1";
    const p24TrnUrl = isSandbox
      ? "https://sandbox.przelewy24.pl/trnRequest"
      : "https://secure.przelewy24.pl/trnRequest";

    const basicAuth = btoa(`${P24_POS_ID}:${P24_API_KEY}`);
    const registerRes = await fetch(`${p24ApiBase}/transaction/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify(registerBody),
    });
    const registerJson = await registerRes.json().catch(() => ({}));
    if (!registerRes.ok || !registerJson?.data?.token) {
      console.error("P24 register failed", registerRes.status, JSON.stringify(registerJson));
      return jsonResp({ error: "payment_gateway_error" }, 502);
    }

    const redirectUrl = `${p24TrnUrl}/${registerJson.data.token}`;
    return jsonResp({
      order_id: order.id,
      order_number: order.order_number,
      redirect_url: redirectUrl,
    });
  } catch (e) {
    console.error("create-payment error:", e);
    return jsonResp({ error: "internal_error" }, 500);
  }
});
