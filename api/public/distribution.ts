import { listDocuments } from "../_lib/gcp-firestore.js";
import { json, preflight } from "../_lib/http.js";

const text = (value: unknown) => typeof value === "string" ? value : "";

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    try {
      const [units, designs, countries] = await Promise.all([
        listDocuments("inventory_units", 1000),
        listDocuments("card_designs", 1000),
        listDocuments("countries", 500),
      ]);
      const designMap = new Map(designs.map((doc) => [doc.id, doc.data]));
      const countryMap = new Map(countries.map((doc) => [doc.id, doc.data]));
      const counts: Record<string, number> = {};
      for (const unit of units) {
        if (!["registered", "active"].includes(text(unit.data.business_status).toLowerCase())) continue;
        const design = designMap.get(text(unit.data.card_design_id));
        const country = countryMap.get(text(design?.country_id));
        const name = text(country?.name_pl || country?.name);
        if (name) counts[name] = (counts[name] || 0) + 1;
      }
      return json(Object.entries(counts).map(([country, count]) => ({ country, count })));
    } catch (error) {
      console.error("[public distribution]", error);
      return json({ error: "distribution_unavailable" }, 503);
    }
  },
};
