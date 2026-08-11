import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const mask = (value?: string | null) => !value ? { set: false, preview: "" } : { set: true, preview: `••••${value.slice(-4)}` };

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!authHeader || !token) return json({ error: "unauthorized" }, 401);
    const authenticated = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user } } = await authenticated.auth.getUser(token);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: role } = user ? await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle() : { data: null };
    if (!role) return json({ error: "forbidden" }, 403);

    if (req.method === "POST") {
      const body = await req.json();
      const updates: Record<string, unknown> = { singleton: true, updated_at: new Date().toISOString() };
      if (body.environment !== undefined) {
        if (body.environment !== "sandbox" && body.environment !== "production") return json({ error: "invalid_environment" }, 400);
        updates.orlen_environment = body.environment;
      }
      const values: Record<string, unknown> = {
        orlen_partner_id: body.partner_id, orlen_partner_key: body.partner_key, orlen_widget_token: body.widget_token,
        orlen_sender_name: body.sender_name, orlen_sender_street: body.sender_street, orlen_sender_postal_code: body.sender_postal_code,
        orlen_sender_city: body.sender_city, orlen_sender_phone: body.sender_phone, orlen_sender_email: body.sender_email,
      };
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === "") continue;
        if (typeof value !== "string") return json({ error: "invalid_orlen_configuration" }, 400);
        const normalized = value.trim();
        if (normalized.length < 2 || normalized.length > 4096) return json({ error: `invalid_${key}` }, 400);
        updates[key] = normalized;
      }
      if (Object.keys(updates).length === 2) return json({ error: "missing_update" }, 400);
      const { error } = await admin.from("shipping_settings").upsert(updates, { onConflict: "singleton" });
      if (error) return json({ error: error.message }, 500);
    }

    const { data, error } = await admin.from("shipping_settings").select("orlen_environment, orlen_partner_id, orlen_partner_key, orlen_widget_token, orlen_sender_name, orlen_sender_street, orlen_sender_postal_code, orlen_sender_city, orlen_sender_phone, orlen_sender_email, updated_at").eq("singleton", true).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ environment: data?.orlen_environment ?? "sandbox", updated_at: data?.updated_at ?? null, partner_id: mask(data?.orlen_partner_id), partner_key: mask(data?.orlen_partner_key), widget_token: mask(data?.orlen_widget_token), sender: { name: mask(data?.orlen_sender_name), street: mask(data?.orlen_sender_street), postal_code: mask(data?.orlen_sender_postal_code), city: mask(data?.orlen_sender_city), phone: mask(data?.orlen_sender_phone), email: mask(data?.orlen_sender_email) } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "internal_error" }, 500); }
});
