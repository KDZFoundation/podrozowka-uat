import { json, preflight } from "../_lib/http.js";

export default {
  fetch: (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    return json({
      token: process.env.INPOST_GEOWIDGET_TOKEN || null,
      environment: (process.env.INPOST_SHIPX_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox",
    });
  },
};
