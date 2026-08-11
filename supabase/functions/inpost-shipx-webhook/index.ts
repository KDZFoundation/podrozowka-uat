import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const shipmentStatus = (event: string) => {
  if (event === "shipment_delivered") return "delivered";
  if (event.includes("dispatched") || event.includes("collected") || event.includes("out_for_delivery")) return "shipped";
  return "packed";
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: settings } = await supabase
      .from("shipping_settings")
      .select("inpost_organization_id")
      .eq("singleton", true)
      .maybeSingle();
    const expectedOrganization = settings?.inpost_organization_id || Deno.env.get("INPOST_SHIPX_ORGANIZATION_ID");
    if (expectedOrganization && String(body.organization_id) !== expectedOrganization) {
      return new Response(JSON.stringify({ error: "Nieprawidłowa organizacja ShipX" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const remoteId = body.payload?.shipment_id ?? body.shipment_id;
    if (!remoteId) return new Response(JSON.stringify({ error: "Brak ID przesyłki" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const event = String(body.event || "shipment_status_changed");
    const trackingNumber = body.payload?.tracking_number ?? body.tracking_number ?? null;
    const update: Record<string, unknown> = { inpost_status: event, status: shipmentStatus(event) };
    if (trackingNumber) update.tracking_number = trackingNumber;
    if (event === "shipment_delivered") update.delivered_at = new Date().toISOString();
    if (update.status === "shipped") update.shipped_at = new Date().toISOString();
    const { error } = await supabase.from("shipments").update(update).eq("inpost_shipment_id", String(remoteId));
    if (error) throw error;
    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Wewnętrzny błąd serwera" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
