import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { shipxBaseUrl, shipxCredentials, shipxError, shipxHeaders } from "../_shared/shipx.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (body: unknown, status: number, headers: HeadersInit) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!auth) return json({ error: "Brak autoryzacji" }, 401, corsHeaders);
    const { data: { user } } = await supabase.auth.getUser(auth);
    const { data: profile } = user ? await supabase.from("profiles").select("role").eq("user_id", user.id).single() : { data: null };
    if (profile?.role !== "admin") return json({ error: "Brak uprawnień administratora" }, 403, corsHeaders);

    const { shipment_id } = await req.json();
    const { data: shipment } = await supabase.from("shipments").select("id, inpost_shipment_id").eq("id", shipment_id).single();
    if (!shipment?.inpost_shipment_id) return json({ error: "Najpierw utwórz przesyłkę w InPost." }, 409, corsHeaders);

    const { token, environment } = await shipxCredentials(supabase);
    const getResponse = await fetch(`${shipxBaseUrl(environment)}/shipments/${shipment.inpost_shipment_id}`, { headers: shipxHeaders(token) });
    if (!getResponse.ok) return json({ error: "Nie udało się pobrać oferty ShipX", details: await shipxError(getResponse) }, getResponse.status, corsHeaders);
    const remoteShipment = await getResponse.json();
    const offer = remoteShipment.selected_offer || remoteShipment.offers?.find((item: { status?: string }) => item.status === "available" || item.status === "selected");
    if (!offer?.id) return json({ error: "Oferta ShipX nie jest jeszcze gotowa. Odśwież za chwilę i spróbuj ponownie.", shipx_status: remoteShipment.status }, 409, corsHeaders);

    const buyResponse = await fetch(`${shipxBaseUrl(environment)}/shipments/${shipment.inpost_shipment_id}/buy`, {
      method: "POST", headers: shipxHeaders(token), body: JSON.stringify({ offer_id: offer.id }),
    });
    if (!buyResponse.ok) return json({ error: "Nie udało się kupić przesyłki w ShipX", details: await shipxError(buyResponse) }, buyResponse.status, corsHeaders);
    const purchase = await buyResponse.json();
    await supabase.from("shipments").update({ inpost_offer_id: String(offer.id), inpost_status: purchase.status || "purchase_requested" }).eq("id", shipment.id);
    return json({ success: true, message: "Zakup przesyłki zlecono. ShipX potwierdzi go asynchronicznie; wtedy dostępna będzie etykieta." }, 202, corsHeaders);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Wewnętrzny błąd serwera" }, 500, corsHeaders);
  }
});
