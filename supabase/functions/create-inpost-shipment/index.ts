import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { shipxBaseUrl, shipxCredentials, shipxError, shipxHeaders } from "../_shared/shipx.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return json({ error: "Brak autoryzacji" }, 401, corsHeaders);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Nieprawidłowy token autoryzacji" }, 401, corsHeaders);

    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
    if (profile?.role !== "admin") return json({ error: "Brak uprawnień administratora" }, 403, corsHeaders);

    const { order_id, size = "small" } = await req.json();
    if (!order_id) return json({ error: "Wymagane ID zamówienia (order_id)" }, 400, corsHeaders);

    const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", order_id).single();
    if (orderError || !order) return json({ error: "Nie znaleziono zamówienia" }, 404, corsHeaders);
    if (order.payment_status !== "paid") return json({ error: "Przesyłkę można utworzyć dopiero dla opłaconego zamówienia." }, 409, corsHeaders);

    const { data: existing } = await supabase
      .from("shipments")
      .select("id, inpost_shipment_id, inpost_status, tracking_number")
      .eq("order_id", order.id)
      .maybeSingle();
    if (existing?.inpost_shipment_id) {
      return json({ success: true, already_created: true, shipment: existing }, 200, corsHeaders);
    }

    const { organizationId, token: shipxToken, environment } = await shipxCredentials(supabase);
    const templates: Record<string, string> = { A: "small", B: "medium", C: "large", small: "small", medium: "medium", large: "large" };
    const parcelTemplate = templates[size] || "small";
    const [firstName = "Klient", ...lastNameParts] = (order.shipping_name || "Klient Podróżówka").trim().split(/\s+/);
    const isLocker = order.shipping_method === "inpost";
    if (isLocker && !order.pickup_point_name) return json({ error: "Zamówienie nie ma wybranego Paczkomatu docelowego." }, 400, corsHeaders);

    const receiver: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastNameParts.join(" ") || "Podróżówka",
      email: order.customer_email || `${order.order_number.toLowerCase()}@orders.podrozowka.pl`,
      phone: (order.shipping_phone || "500000000").replace(/\D/g, "").slice(-9),
    };
    if (!isLocker) {
      receiver.address = {
        street: order.shipping_address || "Główna",
        building_number: "1",
        city: order.shipping_city || "Warszawa",
        post_code: order.shipping_postal_code || "00-001",
        country_code: "PL",
      };
    }

    const payload: Record<string, unknown> = {
      receiver,
      parcels: [{ template: parcelTemplate }],
      service: isLocker ? "inpost_locker_standard" : "inpost_courier_standard",
      reference: order.order_number,
      additional_services: ["email", "sms"],
    };
    if (isLocker) payload.custom_attributes = { target_point: order.pickup_point_name };

    const response = await fetch(`${shipxBaseUrl(environment)}/organizations/${organizationId}/shipments`, {
      method: "POST", headers: shipxHeaders(shipxToken), body: JSON.stringify(payload),
    });
    if (!response.ok) return json({ error: "Błąd tworzenia przesyłki InPost ShipX", details: await shipxError(response) }, response.status, corsHeaders);
    const shipxShipment = await response.json();

    const mutation = {
      inpost_shipment_id: String(shipxShipment.id), inpost_status: shipxShipment.status || "created",
      carrier: "InPost", shipping_method: order.shipping_method, size: parcelTemplate,
      tracking_number: shipxShipment.tracking_number || null,
    };
    const saved = existing
      ? await supabase.from("shipments").update(mutation).eq("id", existing.id).select().single()
      : await supabase.from("shipments").insert({ order_id: order.id, user_id: order.user_id, ...mutation }).select().single();
    if (saved.error) return json({ error: "Przesyłka utworzona w InPost, ale nie zapisała się lokalnie.", details: saved.error.message }, 500, corsHeaders);

    return json({ success: true, shipment: saved.data, shipx_status: shipxShipment.status, message: "Przesyłka została utworzona. Poczekaj na ofertę ShipX, a następnie kup ją w panelu." }, 201, corsHeaders);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Wewnętrzny błąd serwera" }, 500, corsHeaders);
  }
});
