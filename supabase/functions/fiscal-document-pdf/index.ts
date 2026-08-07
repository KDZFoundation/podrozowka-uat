// Proxy to Merit `getinvoicepdf`. Returns the PDF stream to the buyer or an
// admin. Never exposes MERIT_API_KEY to the client.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MERIT_API_ID = Deno.env.get("MERIT_API_ID") || "";
const MERIT_API_KEY = Deno.env.get("MERIT_API_KEY") || "";
const MERIT_BASE = "https://program.360ksiegowosc.pl/api/v1";

function meritTimestamp(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

async function hmacSha256Base64(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  function textResp(msg: string, status: number) {
    return new Response(msg, { status, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return textResp("method not allowed", 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return textResp("unauthorized", 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) return textResp("unauthorized", 401);
    const uid = user.id;

    const url = new URL(req.url);
    const orderNumber = url.searchParams.get("order");
    if (!orderNumber) return textResp("missing order", 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, user_id, fiscal_document_external_id, fiscal_document_status, fiscal_document_number")
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (orderErr || !order) return textResp("not found", 404);

    if (order.user_id !== uid) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return textResp("forbidden", 403);
    }

    if (order.fiscal_document_status !== "issued" || !order.fiscal_document_external_id) {
      return textResp("document not available", 404);
    }

    if (!MERIT_API_ID || !MERIT_API_KEY) return textResp("merit not configured", 500);

    const body = JSON.stringify({ Id: order.fiscal_document_external_id });
    const ts = meritTimestamp();
    const signature = await hmacSha256Base64(MERIT_API_KEY, MERIT_API_ID + ts + body);
    const qs = new URLSearchParams({ ApiId: MERIT_API_ID, timestamp: ts, signature });
    const res = await fetch(`${MERIT_BASE}/getinvoicepdf?${qs.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const txt = await res.text();
    if (!res.ok) {
      console.error("getinvoicepdf failed", res.status, txt.slice(0, 300));
      return textResp("upstream error", 502);
    }

    // Merit returns { PdfContent: "<base64>" }
    let pdfB64: string | null = null;
    try {
      const parsed = JSON.parse(txt);
      pdfB64 = parsed?.PdfContent || parsed?.Pdf || parsed?.pdfContent || null;
    } catch {
      pdfB64 = null;
    }
    if (!pdfB64) return textResp("empty pdf", 502);

    const bin = atob(pdfB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const filename = (order.fiscal_document_number || orderNumber).replace(/[^A-Za-z0-9._-]/g, "_");
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    console.error("fiscal-document-pdf error:", (e as Error).message);
    return textResp("error", 500);
  }
});
