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
    if (!token || !authHeader) return json({ error: "unauthorized" }, 401);
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
        updates.inpost_environment = body.environment;
      }
      const values: Record<string, unknown> = { inpost_organization_id: body.organization_id, inpost_api_token: body.api_token, inpost_geowidget_token: body.geowidget_token };
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === "") continue;
        if (typeof value !== "string") return json({ error: "invalid_inpost_credentials" }, 400);
        const normalized = value.trim();
        const maxLength = key === "inpost_organization_id" ? 100 : 4096;
        if (normalized.length < 3 || normalized.length > maxLength) return json({ error: `invalid_${key}` }, 400);
        updates[key] = normalized;
      }
      if (Object.keys(updates).length === 2) return json({ error: "missing_update" }, 400);
      const { error } = await admin.from("shipping_settings").upsert(updates, { onConflict: "singleton" });
      if (error) return json({ error: error.message }, 500);
    }
    const { data, error } = await admin.from("shipping_settings").select("inpost_environment, inpost_organization_id, inpost_api_token, inpost_geowidget_token, updated_at").eq("singleton", true).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ environment: data?.inpost_environment ?? "sandbox", updated_at: data?.updated_at ?? null, organization: mask(data?.inpost_organization_id), api_token: mask(data?.inpost_api_token), geowidget_token: mask(data?.inpost_geowidget_token) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "internal_error" }, 500); }
});
