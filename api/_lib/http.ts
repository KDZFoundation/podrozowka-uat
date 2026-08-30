const allowedOrigin = process.env.FRONTEND_ORIGIN || "https://podrozowka.web.app";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: corsHeaders,
  });

export const preflight = () => new Response(null, { status: 204, headers: corsHeaders });
