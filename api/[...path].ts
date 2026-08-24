import contact from "../server/routes/contact";
import health from "../server/routes/health";
import registerPostcard from "../server/routes/register-postcard";
import buyInpostShipment from "../server/routes/inpost/buy-shipment";
import createInpostShipment from "../server/routes/inpost/create-shipment";
import inpostGeowidgetConfig from "../server/routes/inpost/geowidget-config";
import inpostSettings from "../server/routes/inpost/settings";
import inpostWebhook from "../server/routes/inpost/webhook";
import inpostShipmentLabel from "../server/routes/inpost/label/shipment-label";
import orlenWidgetConfig from "../server/routes/orlen/widget-config";
import createHotpayPayment from "../server/routes/payments/create-hotpay";
import hotpayWebhook from "../server/routes/payments/hotpay-webhook";
import paymentStatus from "../server/routes/payments/status";
import publicCommunity from "../server/routes/public/community";
import publicDistribution from "../server/routes/public/distribution";
import publicStats from "../server/routes/public/stats";

type ApiHandler = { fetch: (request: Request) => Response | Promise<Response> };

// Vercel must see every dependency statically so it packages the complete
// router inside this single Serverless Function.  The route table still makes
// exactly one handler reachable for each request.
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

/**
 * Vercel Hobby counts each file in api/ as a Serverless Function. Keeping a
 * single catch-all entrypoint preserves all existing API URLs while leaving
 * the individual business handlers outside that directory.
 */
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
