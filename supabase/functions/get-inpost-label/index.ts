import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { shipxBaseUrl, shipxCredentials, shipxError, shipxHeaders } from "../_shared/shipx.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!auth) return new Response(JSON.stringify({ error: "Brak autoryzacji" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await supabase.auth.getUser(auth);
    const { data: profile } = user ? await supabase.from("profiles").select("role").eq("user_id", user.id).single() : { data: null };
    if (profile?.role !== "admin") return new Response(JSON.stringify({ error: "Brak uprawnień administratora" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const shipmentId = new URL(req.url).searchParams.get("shipment_id");
    if (!shipmentId) return new Response(JSON.stringify({ error: "Wymagane shipment_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: shipment } = await supabase.from("shipments").select("inpost_shipment_id").eq("id", shipmentId).single();
    if (!shipment?.inpost_shipment_id) return new Response(JSON.stringify({ error: "Brak przesyłki InPost" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { token, environment } = await shipxCredentials(supabase);
    const response = await fetch(`${shipxBaseUrl(environment)}/shipments/${shipment.inpost_shipment_id}/label?format=pdf&type=A6`, { headers: shipxHeaders(token) });
    if (!response.ok) return new Response(JSON.stringify({ error: "Etykieta nie jest jeszcze dostępna", details: await shipxError(response) }), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=inpost-${shipment.inpost_shipment_id}.pdf` } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Wewnętrzny błąd serwera" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
