import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type HotPaySettings = {
  hotpay_secret?: string | null;
  hotpay_notification_password?: string | null;
};

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function normalizeAmount(value: string): number | null {
  const normalized = value.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  try {
    const form = await req.formData();
    const get = (key: string) => String(form.get(key) || "").trim();
    const amount = get("KWOTA");
    const paymentId = get("ID_PLATNOSCI");
    const orderNumber = get("ID_ZAMOWIENIA");
    const status = get("STATUS");
    const secure = get("SECURE");
    const secret = get("SEKRET");
    const incomingHash = get("HASH").toLowerCase();

    if (!amount || !paymentId || !orderNumber || !status || !secure || !secret || !incomingHash) {
      return new Response("bad request", { status: 400, headers: corsHeaders });
    }
    if (!/^(SUCCESS|PENDING|FAILURE)$/.test(status) || orderNumber.length > 64) {
      return new Response("bad request", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: settings, error: settingsError } = await supabase
      .from("payment_settings")
      .select("hotpay_secret, hotpay_notification_password")
      .limit(1)
      .maybeSingle();
    if (settingsError) {
      console.error("HotPay webhook settings error", settingsError.message);
      return new Response("configuration error", { status: 503, headers: corsHeaders });
    }

    const config = (settings ?? {}) as HotPaySettings;
    const serviceSecret = config.hotpay_secret || Deno.env.get("HOTPAY_SECRET") || "";
    const notificationPassword = config.hotpay_notification_password || Deno.env.get("HOTPAY_NOTIFICATION_PASSWORD") || "";
    if (!serviceSecret || !notificationPassword) {
      console.error("HotPay webhook is not configured");
      return new Response("gateway not configured", { status: 503, headers: corsHeaders });
    }
    if (!secureEquals(secret, serviceSecret)) {
      console.error("HotPay webhook secret mismatch", orderNumber);
      return new Response("invalid secret", { status: 400, headers: corsHeaders });
    }

    const expectedHash = await sha256(`${notificationPassword};${amount};${paymentId};${orderNumber};${status};${secure};${secret}`);
    if (!secureEquals(expectedHash, incomingHash)) {
      console.error("HotPay webhook signature mismatch", orderNumber);
      return new Response("invalid signature", { status: 400, headers: corsHeaders });
    }

    const receivedAmount = normalizeAmount(amount);
    if (receivedAmount === null) return new Response("invalid amount", { status: 400, headers: corsHeaders });

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, total_amount, payment_status")
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (orderError || !order) {
      console.error("HotPay webhook order not found", orderNumber, orderError?.message);
      return new Response("not found", { status: 404, headers: corsHeaders });
    }

    if (Math.round(Number(order.total_amount) * 100) !== Math.round(receivedAmount * 100)) {
      console.error("HotPay webhook amount mismatch", orderNumber, amount, order.total_amount);
      return new Response("amount mismatch", { status: 400, headers: corsHeaders });
    }

    if (status === "SUCCESS" && order.payment_status !== "paid") {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ payment_status: "paid", status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id)
        .neq("payment_status", "paid");
      if (updateError) {
        console.error("HotPay webhook update failed", updateError.message);
        return new Response("update failed", { status: 500, headers: corsHeaders });
      }

      supabase.functions
        .invoke("issue-fiscal-document", {
          body: { order_id: order.id },
          headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
        })
        .catch((error) => console.error("issue-fiscal-document invoke failed", error?.message || error));
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("hotpay-webhook error", error);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
