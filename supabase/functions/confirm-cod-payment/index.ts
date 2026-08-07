// Admin-only: marks a COD order as paid after the courier / packstation confirms
// cash was collected. Then triggers fiscal document issuance via the internal
// secret channel (same pattern as p24-webhook).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
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

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) return jsonResp({ error: "unauthorized" }, 401);
    const userId = user.id;

    // Admin check via has_role (SECURITY DEFINER function respects our roles table)
    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return jsonResp({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = body?.order_id;
    if (!isUuid(orderId)) return jsonResp({ error: "invalid_order_id" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: order, error: fetchErr } = await admin
      .from("orders")
      .select("id, payment_method, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (fetchErr || !order) return jsonResp({ error: "not_found" }, 404);
    if (order.payment_method !== "cod") return jsonResp({ error: "not_cod_order" }, 400);
    if (order.payment_status === "paid") {
      // Idempotent — already confirmed.
      return jsonResp({ ok: true, already_confirmed: true });
    }
    if (order.payment_status !== "unpaid") {
      return jsonResp({ error: "invalid_payment_status" }, 400);
    }

    const { error: updateErr, data: updated } = await admin
      .from("orders")
      .update({ payment_status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("payment_method", "cod")
      .eq("payment_status", "unpaid")
      .select("id")
      .maybeSingle();
    if (updateErr) {
      console.error("confirm-cod-payment update failed:", updateErr.message);
      return jsonResp({ error: "update_failed" }, 500);
    }
    if (!updated) {
      // Someone else confirmed in parallel — treat as success.
      return jsonResp({ ok: true, already_confirmed: true });
    }

    // Fire-and-forget fiscal document.
    admin.functions
      .invoke("issue-fiscal-document", {
        body: { order_id: orderId },
        headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
      })
      .catch((e) => console.error("issue-fiscal-document invoke failed:", e?.message || e));

    return jsonResp({ ok: true });
  } catch (e) {
    console.error("confirm-cod-payment error:", e);
    return jsonResp({ error: "internal_error" }, 500);
  }
});
