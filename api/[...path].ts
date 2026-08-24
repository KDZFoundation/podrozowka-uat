type ApiHandler = { fetch: (request: Request) => Response | Promise<Response> };
type RouteLoader = () => Promise<{ default: ApiHandler }>;

// Do not load every integration when the function starts.  In particular,
// /api/health must remain available even if Firestore or a carrier SDK has a
// configuration problem.  Vercel still sees only this one function.
const routes: Record<string, RouteLoader> = {
  contact: () => import("../server/routes/contact"),
  health: () => import("../server/routes/health"),
  "register-postcard": () => import("../server/routes/register-postcard"),
  "inpost/buy-shipment": () => import("../server/routes/inpost/buy-shipment"),
  "inpost/create-shipment": () => import("../server/routes/inpost/create-shipment"),
  "inpost/geowidget-config": () => import("../server/routes/inpost/geowidget-config"),
  "inpost/settings": () => import("../server/routes/inpost/settings"),
  "inpost/webhook": () => import("../server/routes/inpost/webhook"),
  "orlen/widget-config": () => import("../server/routes/orlen/widget-config"),
  "payments/create-hotpay": () => import("../server/routes/payments/create-hotpay"),
  "payments/hotpay-webhook": () => import("../server/routes/payments/hotpay-webhook"),
  "payments/status": () => import("../server/routes/payments/status"),
  "public/community": () => import("../server/routes/public/community"),
  "public/distribution": () => import("../server/routes/public/distribution"),
  "public/stats": () => import("../server/routes/public/stats"),
};

const inpostLabelRoute: RouteLoader = () => import("../server/routes/inpost/label/shipment-label");

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
  const loadHandler = path.startsWith("inpost/label/") ? inpostLabelRoute : routes[path];
  if (!loadHandler) {
    const target = nodeResponse.status(404);
    target.setHeader("Content-Type", "application/json");
    target.end(Buffer.from(JSON.stringify({ error: "not_found" })));
    return;
  }

  try {
    const { default: apiHandler } = await loadHandler();
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
