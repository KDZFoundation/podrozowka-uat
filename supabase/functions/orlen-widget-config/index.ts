import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await admin.from("shipping_settings").select("orlen_widget_token, orlen_environment").eq("singleton", true).maybeSingle();
  return new Response(JSON.stringify({
    token: data?.orlen_widget_token || null,
    environment: data?.orlen_environment === "production" ? "production" : "sandbox",
    map_url: "https://mapa.orlenpaczka.pl/",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
