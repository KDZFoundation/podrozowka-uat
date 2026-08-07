import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const P24_MERCHANT_ID = Number(Deno.env.get("P24_MERCHANT_ID"));
const P24_POS_ID = Number(Deno.env.get("P24_POS_ID") || Deno.env.get("P24_MERCHANT_ID"));
const P24_CRC_KEY = Deno.env.get("P24_CRC_KEY")!;
const P24_API_KEY = Deno.env.get("P24_API_KEY")!;
const P24_SANDBOX = (Deno.env.get("P24_SANDBOX") || "true").toLowerCase() === "true";

const P24_API_BASE = P24_SANDBOX
  ? "https://sandbox.przelewy24.pl/api/v1"
  : "https://secure.przelewy24.pl/api/v1";

async function sha384Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-384", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
      crc: P24_CRC_KEY,
    }));

    if (expectedNotifySign !== incomingSign) {
      console.error("webhook: signature mismatch", sessionId);
      return new Response("invalid signature", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

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
      crc: P24_CRC_KEY,
    }));

    const basicAuth = btoa(`${P24_POS_ID}:${P24_API_KEY}`);
    const verifyRes = await fetch(`${P24_API_BASE}/transaction/verify`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        merchantId: P24_MERCHANT_ID,
        posId: P24_POS_ID,
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
