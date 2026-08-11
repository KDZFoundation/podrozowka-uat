import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const P24_MERCHANT_ID = Deno.env.get("P24_MERCHANT_ID") || "";
const P24_POS_ID = Deno.env.get("P24_POS_ID") || P24_MERCHANT_ID;
const P24_CRC_KEY = Deno.env.get("P24_CRC_KEY") || "";
const P24_API_KEY = Deno.env.get("P24_API_KEY") || "";
const P24_SANDBOX = (Deno.env.get("P24_SANDBOX") || "true").toLowerCase() === "true";

type P24Credentials = {
  merchantId: number;
  posId: number;
  crcKey: string;
  apiKey: string;
  sandbox: boolean;
};

async function sha384Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-384", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveP24Credentials(serviceClient: any): Promise<P24Credentials | null> {
  const { data } = await serviceClient
    .from("payment_settings")
    .select("p24_mode, p24_merchant_id, p24_pos_id, p24_crc_key, p24_api_key")
    .limit(1)
    .maybeSingle();
  const settings = (data ?? {}) as Record<string, string | null | undefined>;
  const merchantRaw = settings.p24_merchant_id || P24_MERCHANT_ID;
  const posRaw = settings.p24_pos_id || P24_POS_ID || merchantRaw;
  const crcKey = settings.p24_crc_key || P24_CRC_KEY;
  const apiKey = settings.p24_api_key || P24_API_KEY;
  const merchantId = Number(merchantRaw);
  const posId = Number(posRaw);
  if (!Number.isInteger(merchantId) || merchantId <= 0 || !Number.isInteger(posId) || posId <= 0 || !crcKey || !apiKey) return null;
  return {
    merchantId,
    posId,
    crcKey,
    apiKey,
    sandbox: settings.p24_mode ? settings.p24_mode === "sandbox" : P24_SANDBOX,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  try {
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      console.error("webhook: invalid payload");
      return new Response("bad request", { status: 400 });
    }

    const {
      merchantId,
      posId,
      sessionId,
      amount,
      originAmount,
      currency,
      orderId,
      methodId,
      statement,
      sign: incomingSign,
    } = payload as Record<string, unknown>;

    if (typeof sessionId !== "string" || typeof incomingSign !== "string") {
      return new Response("bad request", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const credentials = await resolveP24Credentials(supabase);
    if (!credentials) {
      console.error("webhook: P24 credentials are not configured");
      return new Response("gateway not configured", { status: 503 });
    }

    // Verify incoming notification signature
    const expectedNotifySign = await sha384Hex(JSON.stringify({
      merchantId,
      posId,
      sessionId,
      amount,
      originAmount,
      currency,
      orderId,
      methodId,
      statement,
      crc: credentials.crcKey,
    }));

    if (expectedNotifySign !== incomingSign) {
      console.error("webhook: signature mismatch", sessionId);
      return new Response("invalid signature", { status: 400 });
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, total_amount, payment_status")
      .eq("id", sessionId)
      .maybeSingle();

    if (orderErr || !order) {
      console.error("webhook: order not found", sessionId, orderErr?.message);
      return new Response("not found", { status: 404 });
    }

    // Idempotency: if already paid, ACK
    if (order.payment_status === "paid") {
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const expectedGrosze = Math.round(Number(order.total_amount) * 100);
    if (Number(amount) !== expectedGrosze) {
      console.error("webhook: amount mismatch", sessionId, amount, expectedGrosze);
      return new Response("amount mismatch", { status: 400 });
    }

    // Verify with P24 server-to-server
    const verifySign = await sha384Hex(JSON.stringify({
      sessionId,
      orderId,
      amount,
      currency,
      crc: credentials.crcKey,
    }));

    const p24ApiBase = credentials.sandbox
      ? "https://sandbox.przelewy24.pl/api/v1"
      : "https://secure.przelewy24.pl/api/v1";
    const basicAuth = btoa(`${credentials.posId}:${credentials.apiKey}`);
    const verifyRes = await fetch(`${p24ApiBase}/transaction/verify`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        merchantId: credentials.merchantId,
        posId: credentials.posId,
        sessionId,
        amount,
        currency,
        orderId,
        sign: verifySign,
      }),
    });
    const verifyJson = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok || verifyJson?.data?.status !== "success") {
      console.error("webhook: verify failed", verifyRes.status, JSON.stringify(verifyJson));
      return new Response("verify failed", { status: 400 });
    }

    // Mark paid + reserve inventory
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ payment_status: "paid", status: "paid", paid_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("payment_status", "unpaid");

    if (updateErr) {
      console.error("webhook: update failed", updateErr.message);
      return new Response("update failed", { status: 500 });
    }

    // POD: payment confirms a print request. Do not reserve pre-existing inventory;
    // physical units and QR codes are generated later for this paid order.

    // Fire-and-forget: issue fiscal document. Never blocks the webhook ACK.
    supabase.functions
      .invoke("issue-fiscal-document", {
        body: { order_id: sessionId },
        headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
      })
      .catch((e) => console.error("issue-fiscal-document invoke failed:", e?.message || e));

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("p24-webhook error:", e);
    return new Response("error", { status: 500 });
  }
});
