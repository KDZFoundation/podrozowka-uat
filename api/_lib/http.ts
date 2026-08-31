const allowedOrigin = process.env.FRONTEND_ORIGIN || "https://podrozowka.web.app";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": [
    "X-POD-Artifact-Id",
    "X-POD-Asset-SHA256",
    "X-POD-Batch-Artifact-Id",
    "X-POD-Batch-SHA256",
    "X-POD-PDF-SHA256",
    "X-POD-Proof-Artifact-Id",
    "X-POD-Proof-SHA256",
    "X-POD-Storage-Generation",
  ].join(", "),
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: corsHeaders,
  });

export const preflight = () => new Response(null, { status: 204, headers: corsHeaders });
