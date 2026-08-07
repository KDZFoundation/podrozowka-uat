import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Brak autoryzacji" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nieprawidłowy token autoryzacji" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Brak uprawnień administratora" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { order_id, size = "small" } = body; // size: 'small' (A), 'medium' (B), 'large' (C)

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Wymagane ID zamówienia (order_id)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Nie znaleziono zamówienia w bazie" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check ShipX credentials
    const shipxOrgId = Deno.env.get("INPOST_SHIPX_ORGANIZATION_ID");
    const shipxToken = Deno.env.get("INPOST_SHIPX_TOKEN");
    const shipxEnv = Deno.env.get("INPOST_SHIPX_ENV") || "sandbox";

    if (!shipxOrgId || !shipxToken) {
      return new Response(
        JSON.stringify({
          error: "Brak skonfigurowanych kluczy API ShipX (INPOST_SHIPX_ORGANIZATION_ID / INPOST_SHIPX_TOKEN) w środowisku.",
          environment: shipxEnv,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl =
      shipxEnv === "production"
        ? "https://api-shipx-pl.easypack24.net/v1"
        : "https://sandbox-api-shipx-pl.easypack24.net/v1";

    // Split name into first_name / last_name
    const nameParts = (order.shipping_name || "Klient Podrozowka").trim().split(" ");
    const firstName = nameParts[0] || "Klient";
    const lastName = nameParts.slice(1).join(" ") || "Podróżówka";

    // Map template size
    const templateMap: Record<string, string> = {
      A: "small",
      B: "medium",
      C: "large",
      small: "small",
      medium: "medium",
      large: "large",
    };
    const parcelTemplate = templateMap[size] || "small";

    const isLocker = order.shipping_method === "inpost" || !order.shipping_method;

    const payload: Record<string, unknown> = {
      receiver: {
        first_name: firstName,
        last_name: lastName,
        email: order.shipping_email || `${order.order_number.toLowerCase()}@order.inpostpay.pl`,
        phone: (order.shipping_phone || "500000000").replace(/\D/g, "").slice(-9),
      },
      parcels: [
        {
          template: parcelTemplate,
        },
      ],
      service: isLocker ? "inpost_locker_standard" : "inpost_courier_standard",
    };

    if (isLocker) {
      if (!order.pickup_point_name) {
        return new Response(
          JSON.stringify({ error: "Zamówienie nie ma wybranego Paczkomatu docelowego." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      payload.custom_attributes = {
        target_point: order.pickup_point_name,
      };
    } else {
      payload.receiver = {
        ...(payload.receiver as object),
        address: {
          street: order.shipping_address || "Główna",
          building_number: "1",
          city: order.shipping_city || "Warszawa",
          post_code: order.shipping_postal_code || "00-001",
          country_code: "PL",
        },
      };
    }

    // Call InPost ShipX API
    const shipxRes = await fetch(`${baseUrl}/organizations/${shipxOrgId}/shipments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${shipxToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const shipxData = await shipxRes.json();

    if (!shipxRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Błąd podczas zgłaszania przesyłki w InPost ShipX",
          details: shipxData,
        }),
        { status: shipxRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inpostShipmentId = shipxData.id;
    const trackingNumber = shipxData.tracking_number || `INP-${inpostShipmentId}`;
    const inpostStatus = shipxData.status || "created";

    // Save shipment record in database
    const { data: existingShipment } = await supabase
      .from("shipments")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();

    let savedShipment;
    if (existingShipment) {
      const { data, error } = await supabase
        .from("shipments")
        .update({
          inpost_shipment_id: String(inpostShipmentId),
          tracking_number: trackingNumber,
          carrier: "InPost",
          shipping_method: order.shipping_method || "inpost",
          status: "packed",
          size: parcelTemplate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingShipment.id)
        .select()
        .single();
      savedShipment = data;
    } else {
      const { data, error } = await supabase
        .from("shipments")
        .insert({
          order_id: order.id,
          user_id: order.user_id,
          inpost_shipment_id: String(inpostShipmentId),
          tracking_number: trackingNumber,
          carrier: "InPost",
          shipping_method: order.shipping_method || "inpost",
          status: "packed",
          size: parcelTemplate,
        })
        .select()
        .single();
      savedShipment = data;
    }

    return new Response(
      JSON.stringify({
        success: true,
        shipment: savedShipment,
        shipx_response: shipxData,
        environment: shipxEnv,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Wewnętrzny błąd serwera" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
