import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PaymentGateway = "hotpay" | "p24";
type PaymentSettings = {
  payment_gateway?: PaymentGateway | null;
  p24_mode?: "sandbox" | "production" | null;
  updated_at?: string | null;
  p24_merchant_id?: string | null;
  p24_pos_id?: string | null;
  p24_crc_key?: string | null;
  p24_api_key?: string | null;
  p24_report_key?: string | null;
  hotpay_secret?: string | null;
  hotpay_notification_password?: string | null;
};

function mask(value: string | undefined): { set: boolean; length: number; preview: string } {
  if (!value) return { set: false, length: 0, preview: "" };
  const normalized = String(value);
  if (normalized.length <= 4) return { set: true, length: normalized.length, preview: "•".repeat(normalized.length) };
  return {
    set: true,
    length: normalized.length,
    preview: `${"•".repeat(Math.min(normalized.length - 4, 8))}${normalized.slice(-4)}`,
  };
}

function readP24Values(row: PaymentSettings) {
  return {
    P24_MERCHANT_ID: row.p24_merchant_id || Deno.env.get("P24_MERCHANT_ID") || undefined,
    P24_POS_ID: row.p24_pos_id || row.p24_merchant_id || Deno.env.get("P24_POS_ID") || Deno.env.get("P24_MERCHANT_ID") || undefined,
    P24_CRC_KEY: row.p24_crc_key || Deno.env.get("P24_CRC_KEY") || undefined,
    P24_API_KEY: row.p24_api_key || Deno.env.get("P24_API_KEY") || undefined,
    P24_REPORT_KEY: row.p24_report_key || Deno.env.get("P24_REPORT_KEY") || undefined,
  };
}

function readHotPayValues(row: PaymentSettings) {
  return {
    HOTPAY_SECRET: row.hotpay_secret || Deno.env.get("HOTPAY_SECRET") || undefined,
    HOTPAY_NOTIFICATION_PASSWORD: row.hotpay_notification_password || Deno.env.get("HOTPAY_NOTIFICATION_PASSWORD") || undefined,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const jsonResp = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResp({ error: "unauthorized" }, 401);

    const token = authHeader.slice("Bearer ".length);
    const authenticated = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await authenticated.auth.getUser(token);
    if (userError || !user) return jsonResp({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResp({ error: "forbidden" }, 403);

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonResp({ error: "invalid_body" }, 400);

      const updates: Record<string, unknown> = { singleton: true, updated_at: new Date().toISOString() };
      const gateway = body.payment_gateway;
      if (gateway !== undefined) {
        if (gateway !== "hotpay" && gateway !== "p24") return jsonResp({ error: "invalid_gateway" }, 400);
        updates.payment_gateway = gateway;
      }

      const mode = body.p24_mode;
      if (mode !== undefined) {
        if (mode !== "sandbox" && mode !== "production") return jsonResp({ error: "invalid_mode" }, 400);
        updates.p24_mode = mode;
      }

      const p24 = body.p24_credentials;
      if (p24 !== undefined) {
        if (!p24 || typeof p24 !== "object") return jsonResp({ error: "invalid_p24_credentials" }, 400);
        const mapped: Record<string, unknown> = {
          p24_merchant_id: p24.merchant_id,
          p24_pos_id: p24.pos_id,
          p24_api_key: p24.api_key,
          p24_crc_key: p24.crc_key,
          p24_report_key: p24.report_key,
        };
        for (const [column, raw] of Object.entries(mapped)) {
          if (raw === undefined || raw === null || raw === "") continue;
          if (typeof raw !== "string" || raw.trim().length > 200) return jsonResp({ error: "invalid_p24_credentials" }, 400);
          const value = raw.trim();
          if ((column === "p24_merchant_id" || column === "p24_pos_id") && !/^\d{1,20}$/.test(value)) {
            return jsonResp({ error: "invalid_merchant_id" }, 400);
          }
          updates[column] = value;
        }
      }

      const hotpay = body.hotpay_credentials;
      if (hotpay !== undefined) {
        if (!hotpay || typeof hotpay !== "object") return jsonResp({ error: "invalid_hotpay_credentials" }, 400);
        const mapped: Record<string, unknown> = {
          hotpay_secret: hotpay.secret,
          hotpay_notification_password: hotpay.notification_password,
        };
        for (const [column, raw] of Object.entries(mapped)) {
          if (raw === undefined || raw === null || raw === "") continue;
          if (typeof raw !== "string" || raw.trim().length < 4 || raw.trim().length > 200) {
            return jsonResp({ error: "invalid_hotpay_credentials" }, 400);
          }
          updates[column] = raw.trim();
        }
      }

      if (Object.keys(updates).length === 2) return jsonResp({ error: "missing_update" }, 400);
      const { error: upsertError } = await admin.from("payment_settings").upsert(updates, { onConflict: "singleton" });
      if (upsertError) return jsonResp({ error: upsertError.message }, 500);
    }

    const { data: settings, error: settingsError } = await admin
      .from("payment_settings")
      .select("payment_gateway, p24_mode, updated_at, p24_merchant_id, p24_pos_id, p24_crc_key, p24_api_key, p24_report_key, hotpay_secret, hotpay_notification_password")
      .limit(1)
      .maybeSingle();
    if (settingsError) return jsonResp({ error: settingsError.message }, 500);

    const row = (settings ?? {}) as PaymentSettings;
    const p24Values = readP24Values(row);
    const hotpayValues = readHotPayValues(row);
    const makeStatuses = (values: Record<string, string | undefined>) => Object.entries(values).map(([name, value]) => ({ name, ...mask(value) }));
    const p24Secrets = makeStatuses(p24Values);
    const hotpaySecrets = makeStatuses(hotpayValues);

    return jsonResp({
      payment_gateway: row.payment_gateway === "p24" ? "p24" : "hotpay",
      p24_mode: row.p24_mode ?? "sandbox",
      updated_at: row.updated_at ?? null,
      hotpay: {
        secrets: hotpaySecrets,
        all_secrets_set: hotpaySecrets.every((secret) => secret.set),
      },
      p24: {
        secrets: p24Secrets,
        all_secrets_set: ["P24_MERCHANT_ID", "P24_POS_ID", "P24_CRC_KEY", "P24_API_KEY"].every(
          (name) => p24Secrets.find((secret) => secret.name === name)?.set,
        ),
      },
    });
  } catch (error) {
    console.error("admin-payment-status error:", error);
    return jsonResp({ error: "internal_error" }, 500);
  }
});
