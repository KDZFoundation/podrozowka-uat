import contactHandler from "../server/routes/contact";
import healthHandler from "../server/routes/health";
import registerPostcardHandler from "../server/routes/register-postcard";
import buyInpostShipmentHandler from "../server/routes/inpost/buy-shipment";
import createInpostShipmentHandler from "../server/routes/inpost/create-shipment";
import inpostGeowidgetConfigHandler from "../server/routes/inpost/geowidget-config";
import inpostSettingsHandler from "../server/routes/inpost/settings";
import inpostWebhookHandler from "../server/routes/inpost/webhook";
import inpostLabelHandler from "../server/routes/inpost/label/shipment-label";
import orlenWidgetConfigHandler from "../server/routes/orlen/widget-config";
import createHotpayHandler from "../server/routes/payments/create-hotpay";
import hotpayWebhookHandler from "../server/routes/payments/hotpay-webhook";
import paymentStatusHandler from "../server/routes/payments/status";
import publicCommunityHandler from "../server/routes/public/community";
import publicDistributionHandler from "../server/routes/public/distribution";
import publicStatsHandler from "../server/routes/public/stats";

type ApiHandler = { fetch: (request: Request) => Response | Promise<Response> };

const routes: Record<string, ApiHandler> = {
  contact: contactHandler,
  health: healthHandler,
  "register-postcard": registerPostcardHandler,
  "inpost/buy-shipment": buyInpostShipmentHandler,
  "inpost/create-shipment": createInpostShipmentHandler,
  "inpost/geowidget-config": inpostGeowidgetConfigHandler,
  "inpost/settings": inpostSettingsHandler,
  "inpost/webhook": inpostWebhookHandler,
  "orlen/widget-config": orlenWidgetConfigHandler,
  "payments/create-hotpay": createHotpayHandler,
  "payments/hotpay-webhook": hotpayWebhookHandler,
  "payments/status": paymentStatusHandler,
  "public/community": publicCommunityHandler,
  "public/distribution": publicDistributionHandler,
  "public/stats": publicStatsHandler,
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
  const apiHandler = path.startsWith("inpost/label/") ? inpostLabelHandler : routes[path];
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
