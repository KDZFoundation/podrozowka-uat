import { json, preflight } from "../../../api/_lib/http.js";

export default {
  fetch: (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const secret = process.env.HOTPAY_SECRET || "";
    const password = process.env.HOTPAY_NOTIFICATION_PASSWORD || "";
    const masked = (value: string) => ({ set: Boolean(value), length: value.length, preview: value ? `••••${value.slice(-4)}` : "" });
    return json({
      payment_gateway: "hotpay",
      p24_mode: "sandbox",
      updated_at: null,
      hotpay: { secrets: [{ name: "HOTPAY_SECRET", ...masked(secret) }, { name: "HOTPAY_NOTIFICATION_PASSWORD", ...masked(password) }], all_secrets_set: Boolean(secret && password) },
      p24: { secrets: [], all_secrets_set: false },
    });
  },
};
