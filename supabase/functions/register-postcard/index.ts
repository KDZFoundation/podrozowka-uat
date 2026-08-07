import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto API is unavailable");
  const hashBuffer = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "token is required" }), { status: 400, headers: jsonHeaders });
      }

      // POD tokens are stored as random, plaintext values. Older units may
      // contain a SHA-256 hash, so use it only when the runtime supports it.
      const tokenHash = globalThis.crypto?.subtle ? await hashToken(token) : null;
      const { data: unit, error } = await supabase
        .from("inventory_units")
        .select(`
          id, business_status, fulfillment_status, registered_at, traveler_user_id,
          card_designs!inner(title, image_front_url, language_code, countries!inner(name_pl, iso2))
        `)
        .in("public_claim_token_hash", tokenHash ? [token, tokenHash] : [token])
        .maybeSingle();

      if (error || !unit) {
        if (error) console.error("lookup error:", error);
        return new Response(JSON.stringify({ error: "Kartka nie znaleziona" }), { status: 404, headers: jsonHeaders });
      }

      let travelerName: string | null = null;
      if (unit.traveler_user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", unit.traveler_user_id)
          .maybeSingle();
        travelerName = profile?.display_name || null;
      }

      let recipientName: string | null = null;
      if (unit.business_status === "registered") {
        const { data: reg } = await supabase
          .from("recipient_registrations")
          .select("recipient_name")
          .eq("inventory_unit_id", unit.id)
          .maybeSingle();
        recipientName = reg?.recipient_name || null;
      }

      interface InventoryUnitWithDesign {
        id: string;
        business_status: string;
        fulfillment_status: string;
        registered_at: string | null;
        traveler_user_id: string | null;
        card_designs: {
          title: string | null;
          image_front_url: string | null;
          language_code: string | null;
          countries: {
            name_pl: string | null;
            iso2: string | null;
          } | null;
        } | null;
      }

      const { data: countriesData } = await supabase
        .from("countries")
        .select("iso2, name_pl")
        .eq("active", true)
        .order("name_pl", { ascending: true });

      const availableCountries = (countriesData || []).map((c) => ({
        iso2: c.iso2,
        name_pl: c.name_pl,
      }));

      const design = (unit as unknown as InventoryUnitWithDesign).card_designs;
      return new Response(JSON.stringify({
        business_status: unit.business_status,
        fulfillment_status: unit.fulfillment_status,
        registered_at: unit.registered_at,
        traveler_name: travelerName,
        recipient_name: recipientName,
        available_countries: availableCountries,
        design: {
          title: design?.title,
          image_front_url: design?.image_front_url,
          country_name: design?.countries?.name_pl,
          country_iso2: design?.countries?.iso2,
          language_code: design?.language_code || "en",
        },
      }), { status: 200, headers: jsonHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { token, recipient_name, recipient_message, recipient_email, contact_opt_in, latitude, longitude, registered_country_iso2 } = body;

      // Coordinate validation
      let lat: number | null = null;
      let lon: number | null = null;
      if (latitude !== undefined && latitude !== null) {
        if (typeof latitude !== "number" || latitude < -90 || latitude > 90) {
          return new Response(JSON.stringify({ error: "Nieprawidłowe współrzędne geograficzne" }), { status: 400, headers: jsonHeaders });
        }
        lat = latitude;
      }
      if (longitude !== undefined && longitude !== null) {
        if (typeof longitude !== "number" || longitude < -180 || longitude > 180) {
          return new Response(JSON.stringify({ error: "Nieprawidłowe współrzędne geograficzne" }), { status: 400, headers: jsonHeaders });
        }
        lon = longitude;
      }

      if (!token || !recipient_name) {
        return new Response(JSON.stringify({ error: "token i recipient_name są wymagane" }), { status: 400, headers: jsonHeaders });
      }
      if (recipient_email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(recipient_email).trim())) {
          return new Response(JSON.stringify({ error: "Nieprawidłowy format email" }), { status: 400, headers: jsonHeaders });
        }
      }
      if (String(recipient_name).length > 100) {
        return new Response(JSON.stringify({ error: "Imię zbyt długie (max 100)" }), { status: 400, headers: jsonHeaders });
      }
      if (recipient_message && String(recipient_message).length > 500) {
        return new Response(JSON.stringify({ error: "Wiadomość zbyt długa (max 500)" }), { status: 400, headers: jsonHeaders });
      }

      const tokenHash = globalThis.crypto?.subtle ? await hashToken(token) : null;

      const { data: unit, error: fetchError } = await supabase
        .from("inventory_units")
        .select("id")
        .in("public_claim_token_hash", tokenHash ? [token, tokenHash] : [token])
        .maybeSingle();

      if (fetchError || !unit) {
        if (fetchError) console.error("unit lookup error:", fetchError);
        return new Response(JSON.stringify({ error: "Kartka nie znaleziona" }), { status: 404, headers: jsonHeaders });
      }

      // Atomic registration via SECURITY DEFINER RPC (SELECT FOR UPDATE inside)
      const { error: rpcError } = await supabase.rpc("register_recipient", {
        _unit_id: unit.id,
        _recipient_name: String(recipient_name).trim(),
        _recipient_message: recipient_message ? String(recipient_message).trim() : null,
        _recipient_email: recipient_email ? String(recipient_email).trim() : null,
        _contact_opt_in: contact_opt_in === true,
        _latitude: lat,
        _longitude: lon,
        _registered_country_iso2: registered_country_iso2 ? String(registered_country_iso2).trim() : null,
      });

      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("already_registered") || (rpcError as { code?: string }).code === "23505") {
          return new Response(JSON.stringify({ error: "Ta kartka została już zarejestrowana" }), { status: 409, headers: jsonHeaders });
        }
        if (msg.includes("not_activated")) {
          return new Response(JSON.stringify({ error: "Ta kartka nie została jeszcze aktywowana" }), { status: 409, headers: jsonHeaders });
        }
        if (msg.includes("not_found")) {
          return new Response(JSON.stringify({ error: "Kartka nie znaleziona" }), { status: 404, headers: jsonHeaders });
        }
        console.error("register_recipient error:", rpcError);
        return new Response(JSON.stringify({ error: "Nie udało się zarejestrować kartki" }), { status: 500, headers: jsonHeaders });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: jsonHeaders });
  }
});
