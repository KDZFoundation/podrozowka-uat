import { json, preflight } from "../../../api/_lib/http.js";

export default {
  fetch: (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const organization = process.env.INPOST_SHIPX_ORGANIZATION_ID || "";
    const token = process.env.INPOST_SHIPX_TOKEN || "";
    const geowidget = process.env.INPOST_GEOWIDGET_TOKEN || "";
    const mask = (value: string) => ({ set: Boolean(value), preview: value ? `••••${value.slice(-4)}` : "" });
    return json({
      environment: (process.env.INPOST_SHIPX_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox",
      updated_at: null,
      organization: mask(organization),
      api_token: mask(token),
      geowidget_token: mask(geowidget),
    });
  },
};
