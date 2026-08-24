import contact from "./routes/contact";
import health from "./routes/health";
import registerPostcard from "./routes/register-postcard";
import buyInpostShipment from "./routes/inpost/buy-shipment";
import createInpostShipment from "./routes/inpost/create-shipment";
import inpostGeowidgetConfig from "./routes/inpost/geowidget-config";
import inpostSettings from "./routes/inpost/settings";
import inpostWebhook from "./routes/inpost/webhook";
import inpostShipmentLabel from "./routes/inpost/label/shipment-label";
import orlenWidgetConfig from "./routes/orlen/widget-config";
import createHotpayPayment from "./routes/payments/create-hotpay";
import hotpayWebhook from "./routes/payments/hotpay-webhook";
import paymentStatus from "./routes/payments/status";
import publicCommunity from "./routes/public/community";
import publicDistribution from "./routes/public/distribution";
import publicStats from "./routes/public/stats";

type ApiHandler = { fetch: (request: Request) => Response | Promise<Response> };

// Kept outside api/ because Vercel treats every non-underscore API file as a
// separate function. scripts/build-vercel-router.mjs bundles this complete
// router into api/_router.cjs, leaving one catch-all function on Hobby.
const routes: Record<string, ApiHandler> = {
  contact,
  health,
  "register-postcard": registerPostcard,
  "inpost/buy-shipment": buyInpostShipment,
  "inpost/create-shipment": createInpostShipment,
  "inpost/geowidget-config": inpostGeowidgetConfig,
  "inpost/settings": inpostSettings,
  "inpost/webhook": inpostWebhook,
  "orlen/widget-config": orlenWidgetConfig,
  "payments/create-hotpay": createHotpayPayment,
  "payments/hotpay-webhook": hotpayWebhook,
  "payments/status": paymentStatus,
  "public/community": publicCommunity,
  "public/distribution": publicDistribution,
  "public/stats": publicStats,
};

const routePath = (request: Request) => new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");

const firstHeaderValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const requestBody = (body: unknown, contentType: string | null) => {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body;
  if (contentType?.includes("application/x-www-form-urlencoded") && typeof body === "object") {
    return new URLSearchParams(Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, String(value)])).toString();
  }
  return JSON.stringify(body);
};

export default async function handler(nodeRequest: {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}, nodeResponse: {
  status: (status: number) => { setHeader: (key: string, value: string) => void; end: (body?: Buffer) => void };
}) {
  const protocol = firstHeaderValue(nodeRequest.headers["x-forwarded-proto"]) || "https";
  const host = firstHeaderValue(nodeRequest.headers.host) || "localhost";
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeRequest.headers)) {
    const headerValue = firstHeaderValue(value);
    if (headerValue !== undefined) headers.set(key, headerValue);
  }

  const contentType = headers.get("content-type");
  const method = nodeRequest.method || "GET";
  const request = new Request(`${protocol}://${host}${nodeRequest.url || "/api"}`, {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : requestBody(nodeRequest.body, contentType),
  });

  const path = routePath(request);
  const apiHandler = path.startsWith("inpost/label/") ? inpostShipmentLabel : routes[path];
  if (!apiHandler) {
    const target = nodeResponse.status(404);
    target.setHeader("Content-Type", "application/json");
    target.end(Buffer.from(JSON.stringify({ error: "not_found" })));
    return;
  }

  try {
    const response = await apiHandler.fetch(request);
    const target = nodeResponse.status(response.status);
    response.headers.forEach((value, key) => target.setHeader(key, value));
    target.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("[api router error]", error);
    const target = nodeResponse.status(500);
    target.setHeader("Content-Type", "application/json");
    target.end(Buffer.from(JSON.stringify({ error: "internal_server_error" })));
  }
}
