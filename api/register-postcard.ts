import crypto from "node:crypto";
import {
  commitWrites,
  fromFirestoreFields,
  queryDocuments,
  readDocument,
  toFirestoreValue,
} from "./_lib/gcp-firestore.js";

const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const calculateRank = (points: number): string => {
  if (points >= 7500) return "Legenda Podróżówki";
  if (points >= 3000) return "Misjonarz Kultury";
  if (points >= 1500) return "Ambasador";
  if (points >= 500) return "Odkrywca";
  return "Zwiadowca";
};

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const jsonHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: jsonHeaders });
    }

    try {
      if (request.method === "GET") {
        const token = url.searchParams.get("token") || "";
        if (!token) {
          return new Response(JSON.stringify({ error: "token is required" }), { status: 400, headers: jsonHeaders });
        }

        const tokenHash = sha256(token);
        // Query inventory_units by token hash or token or claim code
        let units = await queryDocuments("inventory_units", "public_claim_token_hash", { stringValue: tokenHash }, 1);
        if (units.length === 0) {
          units = await queryDocuments("inventory_units", "public_claim_token_hash", { stringValue: token }, 1);
        }
        if (units.length === 0) {
          units = await queryDocuments("inventory_units", "public_claim_code", { stringValue: token }, 1);
        }

        if (units.length === 0) {
          return new Response(JSON.stringify({ error: "Kartka nie znaleziona" }), { status: 404, headers: jsonHeaders });
        }

        const unit = units[0].data;
        const designId = String(unit.card_design_id || "");
        let designData: Record<string, unknown> = {};
        let countryName = "Polska";
        let countryIso2 = "PL";

        if (designId) {
          try {
            const designDoc = await readDocument("card_designs", designId);
            if (designDoc.fields) designData = fromFirestoreFields(designDoc.fields) as Record<string, unknown>;
            const countryId = String(designData.country_id || "PL");
            const countryDoc = await readDocument("countries", countryId);
            if (countryDoc.fields) {
              const cData = fromFirestoreFields(countryDoc.fields) as Record<string, unknown>;
              countryName = String(cData.name_pl || cData.name || countryName);
              countryIso2 = String(cData.iso2 || countryId);
            }
          } catch (e) {
            console.warn("[register-postcard] design load warning:", e);
          }
        }

        let travelerName: string | null = null;
        const travelerUserId = String(unit.traveler_user_id || "");
        if (travelerUserId) {
          try {
            const userDoc = await readDocument("users", travelerUserId);
            if (userDoc.fields) {
              const uData = fromFirestoreFields(userDoc.fields) as Record<string, unknown>;
              travelerName = String(uData.display_name || uData.first_name || uData.full_name || "Podróżnik");
            }
          } catch {}
        }

        let recipientName: string | null = null;
        if (unit.business_status === "registered") {
          const regs = await queryDocuments("recipient_registrations", "inventory_unit_id", { stringValue: units[0].id }, 1);
          if (regs.length > 0) {
            recipientName = String(regs[0].data.recipient_name || "");
          }
        }

        return new Response(JSON.stringify({
          business_status: unit.business_status || null,
          fulfillment_status: unit.fulfillment_status || "qr_generated",
          registered_at: unit.registered_at || null,
          traveler_name: travelerName,
          recipient_name: recipientName,
          design: {
            title: designData.title || "Podróżówka",
            image_front_url: designData.image_front_url || null,
            country_name: countryName,
            country_iso2: countryIso2,
            language_code: designData.language_code || "pl",
          },
        }), { status: 200, headers: jsonHeaders });
      }

      if (request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        const {
          token,
          recipient_name,
          recipient_message,
          recipient_email,
          contact_opt_in,
          latitude,
          longitude,
          registered_country_iso2,
        } = body;

        if (!token || !recipient_name) {
          return new Response(JSON.stringify({ error: "token i recipient_name są wymagane" }), { status: 400, headers: jsonHeaders });
        }

        const tokenStr = String(token).trim();
        const tokenHash = sha256(tokenStr);

        let units = await queryDocuments("inventory_units", "public_claim_token_hash", { stringValue: tokenHash }, 1);
        if (units.length === 0) {
          units = await queryDocuments("inventory_units", "public_claim_token_hash", { stringValue: tokenStr }, 1);
        }
        if (units.length === 0) {
          units = await queryDocuments("inventory_units", "public_claim_code", { stringValue: tokenStr }, 1);
        }

        if (units.length === 0) {
          return new Response(JSON.stringify({ error: "Kartka nie znaleziona" }), { status: 404, headers: jsonHeaders });
        }

        const unitDoc = units[0];
        const unit = unitDoc.data;

        if (unit.business_status === "registered") {
          return new Response(JSON.stringify({ error: "Ta kartka została już zarejestrowana" }), { status: 409, headers: jsonHeaders });
        }

        if (!unitDoc.name || !unitDoc.updateTime) {
          return new Response(JSON.stringify({ error: "Nie można bezpiecznie zarejestrować tej kartki" }), { status: 409, headers: jsonHeaders });
        }

        const now = new Date().toISOString();
        const regId = crypto.randomUUID();
        const toFields = (data: Record<string, unknown>) =>
          Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
        const documentPrefix = unitDoc.name.split("/documents/")[0] + "/documents";
        const registration = {
          id: regId,
          inventory_unit_id: unitDoc.id,
          card_design_id: unit.card_design_id || "",
          traveler_user_id: unit.traveler_user_id || null,
          recipient_name: String(recipient_name).trim(),
          recipient_message: recipient_message ? String(recipient_message).trim() : "",
          recipient_email: recipient_email ? String(recipient_email).trim() : null,
          contact_opt_in: Boolean(contact_opt_in),
          registered_country_iso2: registered_country_iso2 ? String(registered_country_iso2).trim() : null,
          latitude: typeof latitude === "number" ? latitude : null,
          longitude: typeof longitude === "number" ? longitude : null,
          registered_at: now,
          created_at: now,
          schema_version: 1,
        };
        const unitUpdate = {
          business_status: "registered",
          registered_at: now,
          updated_at: now,
        };
        const writes: Record<string, unknown>[] = [
          {
            update: { name: `${documentPrefix}/recipient_registrations/${regId}`, fields: toFields(registration) },
            currentDocument: { exists: false },
          },
          {
            update: { name: unitDoc.name, fields: toFields(unitUpdate) },
            updateMask: { fieldPaths: Object.keys(unitUpdate) },
            currentDocument: { updateTime: unitDoc.updateTime },
          },
        ];

        // Calculate gamification changes before the commit; their writes use an
        // update-time precondition too, so concurrent scans cannot double-count.
        const travelerId = String(unit.traveler_user_id || "");
        if (travelerId) {
          try {
            const userDoc = await readDocument("users", travelerId);
            const userData = userDoc.fields ? fromFirestoreFields(userDoc.fields) as Record<string, unknown> : {};
            const currentPoints = Number(userData.gamification_points || userData.total_points || 0);
            const currentRegs = Number(userData.postcards_registered_count || userData.postcards_received || 0);
            const currentKm = Number(userData.total_kilometers || 0);

            let addedKm = 0;
            if (typeof latitude === "number" && typeof longitude === "number") {
              addedKm = calculateDistanceKm(52.2297, 21.0122, latitude, longitude);
            }

            const newPoints = currentPoints + 50; // +50 pkt za relację
            const newRank = calculateRank(newPoints);
            const newKm = currentKm + addedKm;
            const newRegs = currentRegs + 1;

            const userUpdate = {
              gamification_points: newPoints,
              total_points: newPoints,
              current_rank: newRank,
              current_tier: newRank,
              postcards_registered_count: newRegs,
              total_kilometers: newKm,
              updated_at: now,
            };

            if (userDoc.name && userDoc.updateTime) {
              writes.push({
                update: { name: userDoc.name, fields: toFields(userUpdate) },
                updateMask: { fieldPaths: Object.keys(userUpdate) },
                currentDocument: { updateTime: userDoc.updateTime },
              });
            }

            try {
              const profileDoc = await readDocument("profiles", travelerId);
              if (profileDoc.name && profileDoc.updateTime) {
                writes.push({
                  update: { name: profileDoc.name, fields: toFields(userUpdate) },
                  updateMask: { fieldPaths: Object.keys(userUpdate) },
                  currentDocument: { updateTime: profileDoc.updateTime },
                });
              }
            } catch {
              // Public profiles are optional in the Firebase model.
            }
          } catch (err) {
            console.warn("[register-postcard] gamification read warning:", err);
          }
        }

        try {
          await commitWrites(writes);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("FAILED_PRECONDITION") || message.includes("already exists")) {
            return new Response(JSON.stringify({ error: "Ta kartka została już zarejestrowana" }), { status: 409, headers: jsonHeaders });
          }
          throw error;
        }

        return new Response(JSON.stringify({ success: true, id: regId }), { status: 200, headers: jsonHeaders });
      }

      return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: jsonHeaders });
    } catch (err) {
      console.error("[register-postcard error]:", err);
      return new Response(JSON.stringify({ error: "internal server error" }), { status: 500, headers: jsonHeaders });
    }
  },
};
