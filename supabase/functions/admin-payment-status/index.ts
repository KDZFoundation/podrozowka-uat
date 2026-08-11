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
  "P24_REPORT_KEY",
  "P24_SANDBOX",
] as const;

const DB_SECRET_COLUMNS = {
  P24_MERCHANT_ID: "p24_merchant_id",
  P24_POS_ID: "p24_pos_id",
  P24_CRC_KEY: "p24_crc_key",
  P24_API_KEY: "p24_api_key",
  P24_REPORT_KEY: "p24_report_key",
} as const;

type PaymentSettings = {
  p24_mode?: string | null;
  updated_at?: string | null;
  p24_merchant_id?: string | null;
  p24_pos_id?: string | null;
  p24_crc_key?: string | null;
  p24_api_key?: string | null;
  p24_report_key?: string | null;
};

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
      if (mode !== undefined && mode !== "sandbox" && mode !== "production") {
        return jsonResp({ error: "invalid_mode" }, 400);
      }
      const input = body?.credentials;
      const updates: Record<string, unknown> = {
        singleton: true,
        updated_at: new Date().toISOString(),
      };
      if (mode !== undefined) updates.p24_mode = mode;

      if (input !== undefined) {
        if (!input || typeof input !== "object") return jsonResp({ error: "invalid_credentials" }, 400);
        const values: Record<string, unknown> = {
          p24_merchant_id: input.merchant_id,
          p24_pos_id: input.pos_id,
          p24_api_key: input.api_key,
          p24_crc_key: input.crc_key,
          p24_report_key: input.report_key,
        };
        for (const [column, raw] of Object.entries(values)) {
          if (raw === undefined || raw === null || raw === "") continue;
          if (typeof raw !== "string" || raw.trim().length > 200) {
            return jsonResp({ error: "invalid_credentials" }, 400);
          }
          const value = raw.trim();
          if ((column === "p24_merchant_id" || column === "p24_pos_id") && !/^\d{1,20}$/.test(value)) {
            return jsonResp({ error: "invalid_merchant_id" }, 400);
          }
          updates[column] = value;
        }
      }
      if (Object.keys(updates).length === 2) return jsonResp({ error: "missing_update" }, 400);
      const { error: upsertErr } = await admin
        .from("payment_settings")
        .upsert(updates, { onConflict: "singleton" });
      if (upsertErr) return jsonResp({ error: upsertErr.message }, 500);
    }

    const { data: settings } = await admin
      .from("payment_settings")
      .select("p24_mode, updated_at, p24_merchant_id, p24_pos_id, p24_crc_key, p24_api_key, p24_report_key")
      .limit(1)
      .maybeSingle();

    const row = (settings ?? {}) as PaymentSettings;
    const values: Record<string, string | undefined> = {};
    for (const name of REQUIRED_SECRETS) {
      if (name === "P24_SANDBOX") {
        values[name] = (row.p24_mode ?? "sandbox") === "sandbox" ? "true" : "false";
      } else {
        const column = DB_SECRET_COLUMNS[name as keyof typeof DB_SECRET_COLUMNS];
        values[name] = (column ? row[column as keyof PaymentSettings] : undefined) as string | undefined;
        if (name === "P24_POS_ID" && !values[name]) values[name] = row.p24_merchant_id ?? undefined;
        if (!values[name]) values[name] = Deno.env.get(name) || undefined;
      }
    }

    const secrets = REQUIRED_SECRETS.map((name) => {
      const v = values[name];
      const m = mask(v);
      return {
        name,
        set: m.set,
        length: m.length,
        preview: m.preview,
      };
    });

    const allSet = ["P24_MERCHANT_ID", "P24_POS_ID", "P24_CRC_KEY", "P24_API_KEY", "P24_SANDBOX"]
      .every((name) => secrets.find((s) => s.name === name)?.set);

    return jsonResp({
      p24_mode: row.p24_mode ?? "sandbox",
      p24_mode_updated_at: row.updated_at ?? null,
      secrets,
      all_secrets_set: allSet,
    });
  } catch (e) {
    console.error("admin-payment-status error:", e);
    return jsonResp({ error: "internal_error" }, 500);
  }
});
