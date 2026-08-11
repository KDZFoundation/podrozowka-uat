import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await admin
    .from("shipping_settings")
    .select("inpost_geowidget_token, inpost_environment")
    .eq("singleton", true)
    .maybeSingle();
  return new Response(JSON.stringify({
    token: data?.inpost_geowidget_token || null,
    environment: data?.inpost_environment === "production" ? "production" : "sandbox",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
