import { listDocuments } from "../_lib/gcp-firestore.js";
import { json, preflight } from "../_lib/http.js";

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const registered = (value: unknown) => ["registered", "active"].includes(text(value).toLowerCase());

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    try {
      const [units, registrations, designs, countries, users] = await Promise.all([
        listDocuments("inventory_units", 1000),
        listDocuments("recipient_registrations", 1000),
        listDocuments("card_designs", 1000),
        listDocuments("countries", 500),
        listDocuments("users", 500),
      ]);
      const designMap = new Map(designs.map((doc) => [doc.id, doc.data]));
      const countryMap = new Map(countries.map((doc) => [doc.id, doc.data]));
      const userMap = new Map(users.map((doc) => [doc.id, doc.data]));
      const registrationMap = new Map<string, Record<string, unknown>>();
      for (const registration of registrations) {
        const unitId = text(registration.data.inventory_unit_id);
        if (unitId && !registrationMap.has(unitId)) registrationMap.set(unitId, registration.data);
      }
      const result = units
        .filter((unit) => registered(unit.data.business_status))
        .sort((left, right) => text(right.data.registered_at).localeCompare(text(left.data.registered_at)))
        .slice(0, 12)
        .map((unit) => {
          const design = designMap.get(text(unit.data.card_design_id)) || {};
          const country = countryMap.get(text(design.country_id)) || {};
          const registration = registrationMap.get(unit.id) || {};
          const traveler = userMap.get(text(unit.data.traveler_user_id)) || {};
          return {
            id: unit.id,
            traveler_name: text(traveler.display_name || traveler.full_name || traveler.first_name, "Podróżnik"),
            recipient_name: text(registration.recipient_name) || null,
            recipient_message: text(registration.recipient_message || registration.message) || null,
            registered_at: text(unit.data.registered_at || registration.registered_at) || null,
            country_name: text(country.name_pl || country.name) || null,
            design_title: text(design.title) || null,
          };
        });
      return json(result);
    } catch (error) {
      console.error("[public community]", error);
      return json({ error: "community_gallery_unavailable" }, 503);
    }
  },
};
