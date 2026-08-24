import { listDocuments } from "../../../api/_lib/gcp-firestore.js";
import { json, preflight } from "../../../api/_lib/http.js";

const asText = (value: unknown) => typeof value === "string" ? value : "";
const isRegistered = (value: unknown) => ["registered", "active"].includes(asText(value).toLowerCase());

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    try {
      const [users, units, registrations, designs, countries] = await Promise.all([
        listDocuments("users", 500),
        listDocuments("inventory_units", 1000),
        listDocuments("recipient_registrations", 1000),
        listDocuments("card_designs", 1000),
        listDocuments("countries", 500),
      ]);
      const designCountry = new Map(designs.map((doc) => [doc.id, asText(doc.data.country_id)]));
      const countryNames = new Map(countries.map((doc) => [doc.id, asText(doc.data.name_pl || doc.data.name)]));
      const registeredUnits = units.filter((doc) => isRegistered(doc.data.business_status));
      const countriesReached = new Set(
        registeredUnits.map((unit) => countryNames.get(designCountry.get(asText(unit.data.card_design_id)) || "") || "").filter(Boolean),
      );
      const purchased = units.filter((unit) => {
        const status = asText(unit.data.business_status).toLowerCase();
        return Boolean(unit.data.order_id) && !["in_stock", "available", "voided", "damaged"].includes(status);
      });
      return json({
        total_members: users.length,
        total_countries: countriesReached.size,
        total_registered: Math.max(registeredUnits.length, registrations.length),
        total_purchased: purchased.length,
      });
    } catch (error) {
      console.error("[public stats]", error);
      return json({ error: "public_stats_unavailable" }, 503);
    }
  },
};
