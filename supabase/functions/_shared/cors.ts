const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/podrozowka\.lovable\.app$/,
  /^https:\/\/podrozowka\.pl$/,
  /^https:\/\/www\.podrozowka\.pl$/,
  /^https:\/\/podrozowka-uat-one\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  // Private LAN ranges are used only for local development and QR tests on a phone.
  /^http:\/\/10(?:\.\d{1,3}){3}(:\d+)?$/,
  /^http:\/\/192\.168(?:\.\d{1,3}){2}(:\d+)?$/,
  /^http:\/\/172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}(:\d+)?$/,
  /^https:\/\/.*\.run\.app$/,
  /^https:\/\/.*\.lovable\.app$/,
];

export function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
}

export function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = isOriginAllowed(origin) ? origin : "https://podrozowka.lovable.app";
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Vary": "Origin",
  };
}
