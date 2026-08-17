// Issues a sales document (invoice or receipt) in 360 Księgowość / Merit Aktiva
// after an order has been paid. Never blocks the order flow: on any error we
// mark fiscal_document_status='failed' and return 200 so the webhook does not
// retry. Idempotent — if the order already has an issued document, we no-op.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { firminoRequest, getFirminoConfig, isFirminoSalesEnabled, readFirminoData } from "../_shared/firmino.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MERIT_API_ID = Deno.env.get("MERIT_API_ID") || "";
const MERIT_API_KEY = Deno.env.get("MERIT_API_KEY") || "";
const MERIT_RETAIL_CUSTOMER_NAME =
  Deno.env.get("MERIT_RETAIL_CUSTOMER_NAME") || "Klient detaliczny";
const MERIT_BASE = "https://program.360ksiegowosc.pl/api/v1";
const VAT_RATE = 23;

function meritTimestamp(d = new Date()): string {
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function ymd(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

async function hmacSha256Base64(key: string, data: string): Promise<string> {
  const keyBuf = new TextEncoder().encode(key);
  const dataBuf = new TextEncoder().encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBuf);
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function meritCall<T = unknown>(endpoint: string, body: unknown): Promise<T> {
  if (!MERIT_API_ID || !MERIT_API_KEY) {
    throw new Error("Merit credentials missing");
  }
  const bodyStr = JSON.stringify(body);
  const ts = meritTimestamp();
  const signature = await hmacSha256Base64(MERIT_API_KEY, MERIT_API_ID + ts + bodyStr);
  const qs = new URLSearchParams({
    ApiId: MERIT_API_ID,
    timestamp: ts,
    signature,
  }).toString();
  const url = `${MERIT_BASE}/${endpoint}?${qs}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyStr,
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`Merit ${endpoint} HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  try {
    return JSON.parse(txt) as T;
  } catch {
    return txt as unknown as T;
  }
}

interface Tax { Id: string; Code: string; TaxPct?: number }
let cachedTaxId: string | null = null;

async function getVatTaxId(): Promise<string> {
  if (cachedTaxId) return cachedTaxId;
  const taxes = await meritCall<Tax[]>("gettaxes", {});
  if (!Array.isArray(taxes)) throw new Error("gettaxes: unexpected response");
  const exact = taxes.find((t) => (t.Code || "").trim() === `${VAT_RATE}%`);
  const fallback = taxes.find(
    (t) =>
      typeof t.TaxPct === "number" &&
      t.TaxPct === VAT_RATE &&
      !/^(OO|ZW|EU|Import|Marża)/i.test(t.Code || ""),
  );
  const found = exact || fallback;
  if (!found) throw new Error(`No VAT ${VAT_RATE}% rate found in Merit`);
  cachedTaxId = found.Id;
  return cachedTaxId;
}

function grossToNet(gross: number): number {
  return Math.round((gross / (1 + VAT_RATE / 100)) * 100) / 100;
}

function firminoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function safeFirminoShortName(value: string, fallback: string): string {
  const normalized = value.replace(/[^\p{L}\p{N} ._-]+/gu, " ").trim();
  return (normalized || fallback).slice(0, 25);
}

function shippingLabel(method: string): string {
  const labels: Record<string, string> = {
    inpost: "Dostawa — InPost Paczkomat",
    inpost_courier: "Dostawa — InPost Kurier",
    orlen: "Dostawa — ORLEN Paczka",
    pocztex: "Dostawa — Pocztex",
    courier: "Dostawa — Kurier",
  };
  return labels[method] || "Dostawa";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  function jsonResp(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  // Gate 1: shared-secret header. Rejects any external caller.
  const expectedSecret = Deno.env.get("INTERNAL_FN_SECRET") || "";
  const providedSecret = req.headers.get("x-internal-secret") || "";
  const enc = new TextEncoder();
  const a = enc.encode(expectedSecret);
  const b = enc.encode(providedSecret);
  const ok = a.length === b.length && a.length > 0;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  if (diff !== 0 || !ok) {
    return jsonResp({ error: "unauthorized" }, 401);
  }

  let orderId: string | null = null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.order_id !== "string") {
      return jsonResp({ error: "invalid_body" }, 400);
    }
    orderId = body.order_id;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, user_id, order_number, total_amount, shipping_cost, shipping_method, shipping_name, shipping_address, shipping_city, shipping_postal_code, shipping_country, shipping_phone, customer_email, invoice_requested, company_name, company_nip, company_address, fiscal_document_status, payment_status",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      console.error("issue-fiscal-document: order not found", orderId, orderErr?.message);
      return jsonResp({ error: "order_not_found" }, 404);
    }

    // Idempotency
    if (order.fiscal_document_status === "issued" || order.fiscal_document_status === "issued_manual") {
      return jsonResp({ ok: true, skipped: "already_issued" });
    }

    // Gate 2: defense-in-depth. Independent of the secret gate — never issue
    // a fiscal document for an order that is not paid, even if the caller
    // presented a valid INTERNAL_FN_SECRET.
    if (order.payment_status !== "paid") {
      console.warn(
        `issue-fiscal-document: refused for order ${order.order_number} — payment_status=${order.payment_status}`,
      );
      return jsonResp(
        { error: "order_not_paid", payment_status: order.payment_status },
        409,
      );
    }

    // Catalog synchronization and issuing sales documents are separate gates.
    // Synchronising an article must never issue a document for an order.
    if (isFirminoSalesEnabled()) {
      // An external Firmino ID is the durable idempotency key. This also
      // protects against a timeout after Firmino created the document.
      if (order.fiscal_provider === "firmino" && order.fiscal_document_external_id) {
        return jsonResp({ ok: true, skipped: "firmino_document_already_created" });
      }
      await supabase.from("orders").update({
        fiscal_document_status: "pending",
        fiscal_document_error: null,
        fiscal_provider: "firmino",
      }).eq("id", orderId);

      const config = getFirminoConfig();
      const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(order.user_id);
      if (userErr) throw new Error(`Buyer lookup failed: ${userErr.message}`);
      const buyerEmail = order.customer_email || userData?.user?.email || "";
      const buyerName = (
        order.invoice_requested && order.company_name
          ? order.company_name
          : order.shipping_name || "Klient detaliczny"
      ).slice(0, 500);
      const customerShortName = safeFirminoShortName(buyerEmail || buyerName, `PDZ-${order.user_id.slice(0, 8)}`);

      const findCustomerResult = await firminoRequest<unknown>(config, "customers/find", {
        text: buyerEmail || customerShortName,
        size: 20,
      });
      const foundCustomers = readFirminoData<{ list?: Array<{ id?: number | string; email?: string; shortName?: string }> }>(findCustomerResult)?.list || [];
      const existingCustomer = foundCustomers.find((customer) =>
        (buyerEmail && customer.email?.toLowerCase() === buyerEmail.toLowerCase()) || customer.shortName === customerShortName,
      );
      let customerId = existingCustomer?.id ? Number(existingCustomer.id) : null;
      if (!customerId) {
        const createdCustomer = await firminoRequest<unknown>(config, "customers/add", {
          fullName: buyerName,
          shortName: customerShortName,
          locality: (order.shipping_city || "Polska").slice(0, 30),
          countryCode: /^[A-Za-z]{2}$/.test(order.shipping_country || "") ? order.shipping_country!.toUpperCase() : "PL",
          street: (order.shipping_address || "").slice(0, 120),
          postCode: (order.shipping_postal_code || "").slice(0, 30),
          post: (order.shipping_city || "").slice(0, 100),
          phone: (order.shipping_phone || "").slice(0, 50),
          email: buyerEmail || undefined,
        });
        const customer = readFirminoData<{ id?: number | string }>(createdCustomer);
        customerId = customer?.id ? Number(customer.id) : null;
      }
      if (!customerId || !Number.isFinite(customerId)) throw new Error("firmino_customer_id_missing");

      const { data: itemsRaw, error: itemsErr } = await supabase
        .from("order_items")
        .select("quantity, unit_price, secondary_language_name, card_designs(title, product_code, firmino_article_id)")
        .eq("order_id", orderId);
      if (itemsErr || !itemsRaw?.length) throw new Error(`Order items load failed: ${itemsErr?.message || "empty"}`);

      const items = (itemsRaw as Array<{
        quantity: number;
        unit_price: number;
        secondary_language_name: string | null;
        card_designs: { title: string | null; product_code: string; firmino_article_id: number | null } | null;
      }>).map((item) => ({
        name: `${item.card_designs?.title || "Podróżówka"}${item.secondary_language_name ? ` / ${item.secondary_language_name}` : ""} [${item.card_designs?.product_code || "PDZ"}]`.slice(0, 512),
        unit: "szt",
        vatRate: config.vatRate,
        price: Number(item.unit_price).toFixed(2),
        quantity: String(item.quantity),
        ...(item.card_designs?.firmino_article_id ? { idArticle: item.card_designs.firmino_article_id } : {}),
      }));
      if (Number(order.shipping_cost || 0) > 0) {
        items.push({
          name: shippingLabel(order.shipping_method),
          unit: "szt",
          vatRate: config.vatRate,
          price: Number(order.shipping_cost).toFixed(2),
          quantity: "1",
        });
      }

      const today = firminoDate();
      const createdDocument = await firminoRequest<unknown>(config, "sale-documents/add", {
        documentDate: today,
        saleDate: today,
        documentType: "fhan",
        priceType: "gross",
        customer: { id: customerId },
        items,
        payment: { method: "transfer", termDate: today },
        printNotes: `Zamówienie Podróżówka ${order.order_number}`,
      });
      const document = readFirminoData<{ id?: number | string; documentName?: string }>(createdDocument);
      const documentId = document?.id ? String(document.id) : "";
      if (!documentId) throw new Error("firmino_document_id_missing");

      // Persist before follow-up calls. If payment confirmation or e-mail
      // delivery times out, retrying must not create a second legal document.
      const { error: persistedDocumentError } = await supabase.from("orders").update({
        fiscal_document_status: "pending",
        fiscal_provider: "firmino",
        fiscal_document_external_id: documentId,
        fiscal_document_number: document.documentName || `Firmino-${documentId}`,
        fiscal_document_url: `/functions/v1/fiscal-document-pdf?order=${encodeURIComponent(order.order_number)}`,
        fiscal_document_issued_at: new Date().toISOString(),
        fiscal_document_error: null,
      }).eq("id", orderId);
      if (persistedDocumentError) throw new Error(`firmino_document_persist_failed:${persistedDocumentError.message}`);

      await firminoRequest(config, `sale-documents/payoff/${documentId}`);
      if (buyerEmail) {
        try {
          await firminoRequest(config, "sale-documents/mail", {
            idDocument: Number(documentId),
            mail: buyerEmail,
            title: `Podróżówka — rachunek ${document.documentName || order.order_number}`,
            content: "W załączniku przesyłamy rachunek za Twoje zamówienie Podróżówka.",
          });
        } catch (mailError) {
          // The issued, paid document is authoritative. A temporary delivery
          // failure must not turn it into a failed document or create a duplicate on retry.
          console.warn("Firmino document mail failed:", (mailError as Error).message);
        }
      }

      await supabase.from("orders").update({
        fiscal_document_status: "issued",
        fiscal_document_error: null,
      }).eq("id", orderId);
      return jsonResp({ ok: true, provider: "firmino", document_id: documentId, document_no: document.documentName || null });
    }

    // Kill-switch: in DEV/UAT skip Merit entirely. Only PROD sets FISCAL_ENABLED="true".
    if (Deno.env.get("FISCAL_ENABLED") !== "true") {
      console.log(
        `[issue-fiscal-document] FISCAL_ENABLED != 'true' — skipping Merit call for order ${order.order_number}`,
      );
      await supabase
        .from("orders")
        .update({
          fiscal_document_status: "skipped_test_mode",
          fiscal_document_number: `TEST-${order.order_number}`,
          fiscal_document_issued_at: new Date().toISOString(),
          fiscal_document_error: null,
        })
        .eq("id", orderId);
      return jsonResp({ ok: true, skipped: "test_mode" });
    }

    // Mark pending
    await supabase
      .from("orders")
      .update({ fiscal_document_status: "pending", fiscal_document_error: null })
      .eq("id", orderId);

    // Order lines
    const { data: itemsRaw, error: itemsErr } = await supabase
      .from("order_items")
      .select("quantity, unit_price, total_price, card_designs(title)")
      .eq("order_id", orderId);
    if (itemsErr || !itemsRaw || itemsRaw.length === 0) {
      throw new Error(`Order items load failed: ${itemsErr?.message || "empty"}`);
    }

    // Recipient email
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(order.user_id);
    if (userErr) throw new Error(`Buyer lookup failed: ${userErr.message}`);
    const buyerEmail = userData?.user?.email || "";

    const taxId = await getVatTaxId();

    // Build invoice rows (net prices per unit)
    type Row = { Description: string; Quantity: number; Price: number; TaxId: string };
    const rows: Row[] = [];
    let runningGross = 0;
    for (const it of itemsRaw as Array<{
      quantity: number;
      unit_price: number;
      total_price: number;
      card_designs: { title: string } | null;
    }>) {
      const netUnit = grossToNet(Number(it.unit_price));
      rows.push({
        Description: (it.card_designs?.title || "Podróżówka").slice(0, 200),
        Quantity: it.quantity,
        Price: netUnit,
        TaxId: taxId,
      });
      runningGross += Math.round(netUnit * (1 + VAT_RATE / 100) * 100) / 100 * it.quantity;
    }

    const shippingGross = Number(order.shipping_cost || 0);
    if (shippingGross > 0) {
      const shippingNet = grossToNet(shippingGross);
      rows.push({
        Description: "Dostawa (InPost Paczkomaty)",
        Quantity: 1,
        Price: shippingNet,
        TaxId: taxId,
      });
      runningGross += Math.round(shippingNet * (1 + VAT_RATE / 100) * 100) / 100;
    }

    // Correct rounding drift against total_amount (adjust last row)
    const target = Math.round(Number(order.total_amount) * 100) / 100;
    const drift = Math.round((target - runningGross) * 100) / 100;
    if (Math.abs(drift) >= 0.01 && rows.length > 0) {
      const last = rows[rows.length - 1];
      const adjustedNetTotal =
        Math.round((last.Price * last.Quantity + drift / (1 + VAT_RATE / 100)) * 100) / 100;
      last.Price = Math.round((adjustedNetTotal / last.Quantity) * 100) / 100;
    }

    const customer = order.invoice_requested
      ? {
          Name: (order.company_name || "").slice(0, 200),
          RegNo: order.company_nip || "",
          Address: (order.company_address || "").slice(0, 500),
          NotTDCustomer: false,
          EmailAddress: buyerEmail || null,
        }
      : {
          Name: MERIT_RETAIL_CUSTOMER_NAME,
          NotTDCustomer: true,
          EmailAddress: buyerEmail || null,
        };

    const today = ymd();
    const invoicePayload = {
      Customer: customer,
      DocumentDate: today,
      TransactionDate: today,
      DueDate: today,
      InvoiceNo: order.order_number,
      CurrencyCode: "PLN",
      InvoiceRow: rows,
    };

    const created = await meritCall<{ InvoiceId: string; InvoiceNo?: string }>(
      "sendinvoice",
      invoicePayload,
    );
    const invoiceId = created?.InvoiceId;
    const invoiceNo = created?.InvoiceNo || order.order_number;
    if (!invoiceId) throw new Error("Merit did not return InvoiceId");

    // Best-effort email delivery (does not fail the whole operation)
    if (buyerEmail) {
      try {
        await meritCall("sendinvoicebyemail", {
          InvoiceId: invoiceId,
          ToEmail: buyerEmail,
          Subject: `Podróżówka – dokument sprzedaży ${invoiceNo}`,
          Message: "W załączniku dokument sprzedaży. Dziękujemy za zamówienie w Podróżówce.",
        });
      } catch (e) {
        console.warn("sendinvoicebyemail failed:", (e as Error).message);
      }
    }

    await supabase
      .from("orders")
      .update({
        fiscal_document_status: "issued",
        fiscal_provider: "merit",
        fiscal_document_external_id: invoiceId,
        fiscal_document_number: invoiceNo,
        fiscal_document_url: `/functions/v1/fiscal-document-pdf?order=${encodeURIComponent(order.order_number)}`,
        fiscal_document_issued_at: new Date().toISOString(),
        fiscal_document_error: null,
      })
      .eq("id", orderId);

    return jsonResp({ ok: true, invoice_id: invoiceId, invoice_no: invoiceNo });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("issue-fiscal-document error:", msg);
    if (orderId) {
      await supabase
        .from("orders")
        .update({
          fiscal_document_status: "failed",
          fiscal_document_error: msg.slice(0, 500),
        })
        .eq("id", orderId);
    }
    // Always 200 so the caller does not retry — retry is a manual admin action.
    return jsonResp({ ok: false, error: msg.slice(0, 500) });
  }
});
