import { listDocuments } from "../../../api/_lib/gcp-firestore.js";
import { json, preflight } from "../../../api/_lib/http.js";
import { isPaidOrder } from "../../services/paid-order.js";

const asText = (value: unknown) => typeof value === "string" ? value : "";
const isRegistered = (value: unknown) => ["registered", "active"].includes(asText(value).toLowerCase());
const positiveInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};
const orderQuantity = (order: Record<string, unknown>) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((total, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return total;
    return total + positiveInteger((item as Record<string, unknown>).quantity);
  }, 0);
};
const customerKey = (order: Record<string, unknown>) => {
  const userId = asText(order.user_id).trim();
  if (userId) return `user:${userId}`;
  const email = asText(order.customer_email || order.guest_email || order.email).trim().toLowerCase();
  return email ? `email:${email}` : "";
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    try {
      const [orders, units, registrations, designs, countries] = await Promise.all([
        listDocuments("orders", 1000),
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
      // Commercial figures deliberately come from paid order lines, not from
      // inventory units. Inventory includes stock, historical test records and
      // production copies, so it cannot represent customer purchases.
      const paidOrders = orders.filter((order) => isPaidOrder(order.data));
      const customers = new Set(paidOrders.map((order) => customerKey(order.data)).filter(Boolean));
      const purchased = paidOrders.reduce((total, order) => total + orderQuantity(order.data), 0);
      return json({
        total_members: customers.size,
        total_countries: countriesReached.size,
        total_registered: Math.max(registeredUnits.length, registrations.length),
        total_purchased: purchased,
      });
    } catch (error) {
      console.error("[public stats]", error);
      return json({ error: "public_stats_unavailable" }, 503);
    }
  },
};
