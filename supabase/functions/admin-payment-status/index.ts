import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REQUIRED_SECRETS = [
  "P24_MERCHANT_ID",
  "P24_POS_ID",
  "P24_CRC_KEY",
  "P24_API_KEY",
  "P24_SANDBOX",
] as const;

function mask(value: string | undefined): { set: boolean; length: number; preview: string } {
  if (!value) return { set: false, length: 0, preview: "" };
  const v = String(value);
  if (v.length <= 4) return { set: true, length: v.length, preview: "•".repeat(v.length) };
  const last = v.slice(-4);
  return { set: true, length: v.length, preview: `${"•".repeat(Math.min(v.length - 4, 8))}${last}` };
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
    if (!authHeader?.startsWith("Bearer ")) return jsonResp({ error: "unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return jsonResp({ error: "unauthorized" }, 401);

    const userId = user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResp({ error: "forbidden" }, 403);

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const mode = body?.p24_mode;
      if (mode !== "sandbox" && mode !== "production") {
        return jsonResp({ error: "invalid_mode" }, 400);
      }
      const { error: upsertErr } = await admin
        .from("payment_settings")
        .upsert(
          { singleton: true, p24_mode: mode, updated_at: new Date().toISOString() },
          { onConflict: "singleton" }
        );
      if (upsertErr) return jsonResp({ error: upsertErr.message }, 500);
    }

    const { data: settings } = await admin
      .from("payment_settings")
      .select("p24_mode, updated_at")
      .limit(1)
      .maybeSingle();

    const secrets = REQUIRED_SECRETS.map((name) => {
      const v = Deno.env.get(name);
      const m = mask(v);
      return {
        name,
        set: m.set,
        length: m.length,
        preview: m.preview,
      };
    });

    const allSet = secrets.every((s) => s.set);

    return jsonResp({
      p24_mode: settings?.p24_mode ?? "sandbox",
      p24_mode_updated_at: settings?.updated_at ?? null,
      secrets,
      all_secrets_set: allSet,
    });
  } catch (e) {
    console.error("admin-payment-status error:", e);
    return jsonResp({ error: "internal_error" }, 500);
  }
});
