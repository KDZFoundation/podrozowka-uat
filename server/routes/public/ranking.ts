import { listDocuments } from "../../../api/_lib/gcp-firestore.js";
import { json, preflight } from "../../../api/_lib/http.js";

type Data = Record<string, unknown>;

const text = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const paid = (order: Data) => ["paid", "completed"].includes(text(order.payment_status || order.status).toLowerCase());
const registered = (unit: Data) => ["registered", "active"].includes(text(unit.business_status).toLowerCase());
const orderQuantity = (order: Data) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((total, item) => total + number((item as Data).quantity), 0);
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    try {
      const [users, orders, units, designs, countries] = await Promise.all([
        listDocuments("users", 500),
        listDocuments("orders", 1000),
        listDocuments("inventory_units", 1000),
        listDocuments("card_designs", 1000),
        listDocuments("countries", 500),
      ]);
      const purchasesByUser = new Map<string, number>();
      for (const order of orders) {
        const userId = text(order.data.user_id);
        if (!userId || !paid(order.data)) continue;
        purchasesByUser.set(userId, (purchasesByUser.get(userId) || 0) + orderQuantity(order.data));
      }
      const countryByDesign = new Map(designs.map((design) => [design.id, text(design.data.country_id)]));
      const countryData = new Map(countries.map((country) => [country.id, country.data]));
      const countriesByUser = new Map<string, Map<string, { iso2: string; name_pl: string }>>();
      const registrationsByUser = new Map<string, number>();
      for (const unit of units) {
        const userId = text(unit.data.traveler_user_id);
        if (!userId || !registered(unit.data)) continue;
        registrationsByUser.set(userId, (registrationsByUser.get(userId) || 0) + 1);
        const countryId = countryByDesign.get(text(unit.data.card_design_id));
        const country = countryId ? countryData.get(countryId) : undefined;
        if (!countryId || !country) continue;
        const userCountries = countriesByUser.get(userId) || new Map<string, { iso2: string; name_pl: string }>();
        userCountries.set(countryId, {
          iso2: text(country.iso2, countryId),
          name_pl: text(country.name_pl || country.name, countryId),
        });
        countriesByUser.set(userId, userCountries);
      }
      const result = users
        .map((user) => {
          const points = Math.max(number(user.data.gamification_points), number(user.data.total_points));
          const purchased = Math.max(
            number(user.data.postcards_purchased),
            number(user.data.postcards_sent_count),
            purchasesByUser.get(user.id) || 0,
          );
          const registrations = Math.max(number(user.data.postcards_registered_count), registrationsByUser.get(user.id) || 0);
          return {
            user_id: user.id,
            display_name: text(user.data.display_name || user.data.full_name || user.data.first_name, "Podróżnik"),
            avatar_url: text(user.data.avatar_url) || null,
            total_points: points,
            current_rank: text(user.data.current_tier || user.data.current_rank, "Zwiadowca"),
            unitCount: purchased,
            regCount: registrations,
            countries: [...(countriesByUser.get(user.id)?.values() || [])],
          };
        })
        .filter((user) => user.total_points > 0 || user.unitCount > 0 || user.regCount > 0)
        .sort((left, right) => right.total_points - left.total_points || right.regCount - left.regCount || right.unitCount - left.unitCount || left.display_name.localeCompare(right.display_name, "pl"))
        .slice(0, 10);
      return json(result);
    } catch (error) {
      console.error("[public ranking]", error);
      return json({ error: "public_ranking_unavailable" }, 503);
    }
  },
};
