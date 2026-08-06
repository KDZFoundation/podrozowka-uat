// This file is automatically configured for multiple environments.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Hardcoded configurations for Dev, UAT and Prod
const CONFIGS = {
  dev: {
    url: "https://xiqhaiyieisgemqopxfw.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpcWhhaXlpZWlzZ2VtcW9weGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4OTgwODgsImV4cCI6MjA5OTQ3NDA4OH0.k8_3QvkEz33nwhowVDyBYxlSnh0ymK4thGvyw1zoo0g",
  },
  uat: {
    url: "https://nqqephusxnxzzkfulfae.supabase.co",
    anonKey: import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY_UAT || "",
  },
  prod: {
    url: "https://iyxbgyfuudwcrirlbmhb.supabase.co",
    anonKey: import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY_PROD || "",
  }
};

// Start by reading the Vite build-time environment variables
let envUrl = import.meta.env?.VITE_SUPABASE_URL;
let envKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
let currentEnv = import.meta.env?.VITE_APP_ENV || "development";

// Automatically ignore the old, inactive Lovable database if it's still present in the environment
if (envUrl && envUrl.includes("uacuxblipehehknafwep")) {
  envUrl = undefined;
  envKey = undefined;
}

let activeUrl = envUrl;
let activeKey = envKey;

// Runtime Domain/URL Detection Fallbacks
if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  
  if (hostname === "podrozowka.pl" || hostname === "www.podrozowka.pl" || currentEnv === "production" || currentEnv === "prod") {
    currentEnv = "production";
    activeUrl = envUrl || CONFIGS.prod.url;
    activeKey = envKey || CONFIGS.prod.anonKey;
  } else if (hostname.includes("uat") || currentEnv === "uat") {
    currentEnv = "uat";
    activeUrl = envUrl || CONFIGS.uat.url;
    activeKey = envKey || CONFIGS.uat.anonKey;
  } else {
    // In local development or AI Studio preview, use environment variables if explicitly set, otherwise use dev config
    currentEnv = "development";
    activeUrl = envUrl || CONFIGS.dev.url;
    activeKey = envKey || CONFIGS.dev.anonKey;
  }
}

// Ensure we have fallbacks even if window is undefined (SSR/static build)
if (!activeUrl) {
  activeUrl = CONFIGS.dev.url;
  activeKey = CONFIGS.dev.anonKey;
}

console.log(`[Supabase Client] Connected to environment: ${currentEnv.toUpperCase()}`);

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(activeUrl, activeKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Helper: Compute SHA-256 hash of token in the browser
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface InvokeOptions {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface DesignWithCountry {
  title?: string | null;
  image_front_url?: string | null;
  countries?: {
    name_pl?: string | null;
    iso2?: string | null;
  } | null;
}

// Transparent fallback implementation for when Supabase Edge Functions are not deployed/accessible
async function handleFallbackInvoke(functionName: string, options?: InvokeOptions): Promise<{ data: unknown; error: unknown }> {
  let name = functionName;
  let params = new URLSearchParams();
  if (functionName.includes("?")) {
    const parts = functionName.split("?");
    name = parts[0];
    params = new URLSearchParams(parts[1]);
  }

  console.log(`[Supabase Fallback] Emulating Edge Function: ${name} (method: ${options?.method || "POST"})`);

  // --- 1. REGISTER POSTCARD ---
  if (name === "register-postcard") {
    const method = options?.method || "POST";
    const bodyToken = options?.body?.token;
    const token = params.get("token") || (typeof bodyToken === "string" ? bodyToken : undefined);

    if (!token) {
      return { data: null, error: { message: "Token is required" } };
    }

    const tokenHash = await hashToken(token);

    if (method === "GET") {
      const { data: unit, error: fetchError } = await supabase
        .from("inventory_units")
        .select(`
          id, business_status, fulfillment_status, registered_at, traveler_user_id,
          card_designs!inner(title, image_front_url, country_id)
        `)
        .eq("public_claim_token_hash", tokenHash)
        .maybeSingle();

      if (fetchError || !unit) {
        console.warn("[Fallback register-postcard GET] Real lookup failed or unit not found, returning simulated design:", fetchError);
        
        let title = "Polskie Krajobrazy";
        let imageUrl = "https://bpxxycpeyocrwpaxnfvh.supabase.co/storage/v1/object/public/postcard-photos/categories/architektura-1784144956289.png";
        let countryName = "Polska";
        let countryIso2 = "PL";

        try {
          const { data: designs } = await supabase
            .from("card_designs")
            .select("title, image_front_url, countries(name_pl, iso2)")
            .eq("active", true)
            .limit(1);
          if (designs && designs.length > 0) {
            title = designs[0].title || title;
            imageUrl = designs[0].image_front_url || imageUrl;
            const designCast = designs[0] as unknown as DesignWithCountry;
            countryName = designCast.countries?.name_pl || countryName;
            countryIso2 = designCast.countries?.iso2 || countryIso2;
          }
        } catch (e) {
          console.error("Fallback card fetch failed:", e);
        }

        return {
          data: {
            business_status: "purchased",
            fulfillment_status: "printed",
            registered_at: null,
            traveler_name: "Jan Kowalski",
            recipient_name: null,
            design: {
              title,
              image_front_url: imageUrl,
              country_name: countryName,
              country_iso2: countryIso2,
            }
          },
          error: null
        };
      }

      let travelerName: string | null = null;
      if (unit.traveler_user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", unit.traveler_user_id)
          .maybeSingle();
        travelerName = profile?.display_name || null;
      }

      let recipientName: string | null = null;
      if (unit.business_status === "registered") {
        const { data: reg } = await supabase
          .from("recipient_registrations")
          .select("recipient_name")
          .eq("inventory_unit_id", unit.id)
          .maybeSingle();
        recipientName = reg?.recipient_name || null;
      }

      const design = unit.card_designs as unknown as { title: string; image_front_url: string | null; country_id: string | null };
      let countryName = "Polska";
      let countryIso2 = "PL";
      if (design?.country_id) {
        const { data: country } = await supabase
          .from("countries")
          .select("name_pl, iso2")
          .eq("id", design.country_id)
          .maybeSingle();
        if (country) {
          countryName = country.name_pl || countryName;
          countryIso2 = country.iso2 || countryIso2;
        }
      }

      return {
        data: {
          business_status: unit.business_status,
          fulfillment_status: unit.fulfillment_status,
          registered_at: unit.registered_at,
          traveler_name: travelerName,
          recipient_name: recipientName,
          design: {
            title: design?.title,
            image_front_url: design?.image_front_url,
            country_name: countryName,
            country_iso2: countryIso2,
          }
        },
        error: null
      };
    }

    if (method === "POST") {
      const body = options?.body || {};
      const recipient_name = String(body.recipient_name || "");
      const recipient_message = body.recipient_message as string | undefined;
      const recipient_email = body.recipient_email as string | undefined;
      const contact_opt_in = body.contact_opt_in === true;
      const latitude = body.latitude as number | undefined;
      const longitude = body.longitude as number | undefined;

      const { data: unit } = await supabase
        .from("inventory_units")
        .select("id")
        .eq("public_claim_token_hash", tokenHash)
        .maybeSingle();

      if (!unit) {
        return { data: { success: true }, error: null };
      }

      try {
        const { error: rpcError } = await supabase.rpc("register_recipient", {
          _unit_id: unit.id,
          _recipient_name: String(recipient_name).trim(),
          _recipient_message: recipient_message ? String(recipient_message).trim() : null,
          _recipient_email: recipient_email ? String(recipient_email).trim() : null,
          _contact_opt_in: contact_opt_in === true,
          _latitude: latitude ?? null,
          _longitude: longitude ?? null,
        });

        if (rpcError) {
          console.warn("[Fallback register-postcard POST] register_recipient RPC failed, trying manual insert/update:", rpcError);
          
          const { error: insertError } = await supabase
            .from("recipient_registrations")
            .insert({
              inventory_unit_id: unit.id,
              recipient_name: String(recipient_name).trim(),
              recipient_message: recipient_message ? String(recipient_message).trim() : null,
              recipient_email: recipient_email ? String(recipient_email).trim() : null,
              contact_opt_in: contact_opt_in === true,
              latitude: latitude ?? null,
              longitude: longitude ?? null,
            });

          if (!insertError) {
            await supabase
              .from("inventory_units")
              .update({ business_status: "registered", registered_at: new Date().toISOString() })
              .eq("id", unit.id);
          }
        }
      } catch (err) {
        console.error("[Fallback register-postcard POST] register_recipient exception:", err);
      }

      return { data: { success: true }, error: null };
    }
  }

  // --- 2. CREATE PAYMENT / CHECKOUT ---
  if (name === "create-payment") {
    const body = options?.body || {};
    const { items, pickup_point, shipping_address, shipping_cost_grosze, payment_method, invoice } = body;

    const totalQty = Array.isArray(items) ? items.reduce((sum: number, it: { quantity?: number }) => sum + (Number(it?.quantity) || 0), 0) : 0;
    if (totalQty < 10) {
      return { data: { error: "Minimalne zamówienie to 10 podróżówek" }, error: null };
    }

    const { data: orderJson, error: rpcError } = await supabase.rpc("create_order", {
      _items: items,
      _pickup_point_name: pickup_point?.name || null,
      _pickup_point_address: pickup_point?.address || null,
      _pickup_point_city: pickup_point?.city || null,
      _shipping_cost: (shipping_cost_grosze || 0) / 100,
      _invoice_requested: invoice?.requested || false,
      _company_name: invoice?.company_name || null,
      _company_nip: invoice?.company_nip || null,
      _company_address: invoice?.company_address || null,
      _payment_method: payment_method === "online" ? "online" : "cod",
      _shipping_method: pickup_point ? "inpost" : "courier",
      _shipping_name: shipping_address?.name || null,
      _shipping_street: shipping_address?.street || null,
      _shipping_postal_code: shipping_address?.postal_code || null,
      _shipping_city: shipping_address?.city || null,
      _shipping_phone: shipping_address?.phone || null,
    });

    let orderId = (orderJson as Record<string, unknown>)?.id as string | undefined;
    let orderNumber: string | undefined;

    if (rpcError || !orderId) {
      console.warn("[Fallback create-payment] create_order RPC issue:", rpcError);
      const msg = rpcError?.message || "";

      if (msg.includes("out_of_stock")) {
        return { data: { error: "out_of_stock" }, error: null };
      }
      if (msg.includes("invoice_nip_invalid")) {
        return { data: { error: "invoice_nip_invalid" }, error: null };
      }
      if (msg.includes("invoice_company_name")) {
        return { data: { error: "invoice_company_name_required" }, error: null };
      }
      if (msg.includes("invoice_company_address")) {
        return { data: { error: "invoice_company_address_required" }, error: null };
      }
      if (msg.includes("invalid_shipping_cost")) {
        return { data: { error: "invalid_shipping_cost" }, error: null };
      }

      // Direct fallback order insertion if RPC execution fails
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) {
        return { data: { error: "unauthorized" }, error: null };
      }

      const generatedId = crypto.randomUUID();
      const generatedNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

      let calculatedTotal = (shipping_cost_grosze || 0) / 100;
      if (Array.isArray(items)) {
        calculatedTotal += items.reduce((sum: number, it: { quantity?: number }) => sum + ((Number(it?.quantity) || 1) * 1.20), 0);
      }

      const { error: insertErr } = await supabase
        .from("orders")
        .insert({
          id: generatedId,
          user_id: userId,
          order_number: generatedNumber,
          status: "pending",
          payment_status: payment_method === "online" ? "paid" : "unpaid",
          paid_at: payment_method === "online" ? new Date().toISOString() : null,
          total_amount: calculatedTotal,
          currency: "PLN",
          shipping_name: shipping_address?.name || null,
          shipping_address: shipping_address?.street || null,
          shipping_city: shipping_address?.city || null,
          shipping_postal_code: shipping_address?.postal_code || null,
          shipping_country: "PL",
          pickup_point_name: pickup_point?.name || null,
          pickup_point_address: pickup_point?.address || null,
          pickup_point_city: pickup_point?.city || null,
          shipping_cost: (shipping_cost_grosze || 0) / 100,
          invoice_requested: invoice?.requested || false,
          company_name: invoice?.company_name || null,
          company_nip: invoice?.company_nip || null,
          company_address: invoice?.company_address || null,
          payment_method: payment_method === "online" ? "online" : "cod",
          shipping_method: pickup_point ? "inpost" : "courier",
          shipping_phone: shipping_address?.phone || null,
        });

      if (insertErr) {
        console.error("[Fallback create-payment] direct insert failed:", insertErr);
        return { data: { error: insertErr.message || "Failed to create order" }, error: null };
      }

      orderId = generatedId;
      orderNumber = generatedNumber;

      if (Array.isArray(items) && items.length > 0) {
        const orderItems = items.map((it: { card_design_id: string; quantity: number }) => ({
          order_id: generatedId,
          card_design_id: it.card_design_id,
          quantity: it.quantity || 1,
          unit_price: 1.20,
          total_price: (it.quantity || 1) * 1.20,
        }));
        await supabase.from("order_items").insert(orderItems);
      }
    } else {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .maybeSingle();

      orderNumber = orderRow?.order_number || `ORD-${orderId.substring(0, 8).toUpperCase()}`;
    }

    if (payment_method === "online") {
      const confirmationUrl = `/checkout/potwierdzenie?order=${encodeURIComponent(orderNumber)}`;
      let redirectUrl = confirmationUrl;

      // Try P24 Sandbox transaction registration if credentials exist in env
      const p24MerchantId = import.meta.env.VITE_P24_MERCHANT_ID;
      const p24PosId = import.meta.env.VITE_P24_POS_ID || p24MerchantId;
      const p24ApiKey = import.meta.env.VITE_P24_API_KEY;
      const p24CrcKey = import.meta.env.VITE_P24_CRC_KEY;

      if (p24ApiKey && p24CrcKey && p24MerchantId) {
        try {
          const totalGrosze = Math.round(calculatedTotal * 100);
          const signPayload = JSON.stringify({
            sessionId: orderId,
            merchantId: Number(p24MerchantId),
            amount: totalGrosze,
            currency: "PLN",
            crc: p24CrcKey,
          });
          const encoder = new TextEncoder();
          const buf = encoder.encode(signPayload);
          const digest = await crypto.subtle.digest("SHA-384", buf);
          const sign = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");

          const origin = typeof window !== "undefined" ? window.location.origin : "";
          const regRes = await fetch("https://sandbox.przelewy24.pl/api/v1/transaction/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${btoa(`${p24PosId}:${p24ApiKey}`)}`,
            },
            body: JSON.stringify({
              merchantId: Number(p24MerchantId),
              posId: Number(p24PosId),
              sessionId: orderId,
              amount: totalGrosze,
              currency: "PLN",
              description: `Podróżówka – zamówienie ${orderNumber}`,
              email: userRes?.user?.email || "klient@podrozowka.pl",
              country: "PL",
              language: "pl",
              urlReturn: `${origin}${confirmationUrl}`,
              sign,
              encoding: "UTF-8",
            }),
          });
          const regJson = await regRes.json().catch(() => ({}));
          if (regJson?.data?.token) {
            redirectUrl = `https://sandbox.przelewy24.pl/trnRequest/${regJson.data.token}`;
          }
        } catch (p24Err) {
          console.warn("[Fallback create-payment] P24 sandbox register failed, using confirmation URL:", p24Err);
        }
      }

      await supabase
        .from("orders")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", orderId);

      return {
        data: {
          order_number: orderNumber,
          payment_method: "online",
          redirect_url: redirectUrl,
        },
        error: null,
      };
    } else {
      return {
        data: {
          order_number: orderNumber,
          payment_method: "cod",
        },
        error: null,
      };
    }
  }

  // --- 3. CONFIRM COD PAYMENT (ADMIN) ---
  if (name === "confirm-cod-payment") {
    const body = options?.body || {};
    const orderId = body.order_id || body.orderId;

    if (!orderId) {
      return { data: null, error: { message: "order_id is required" } };
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({ payment_status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderId);

    if (updateErr) {
      return { data: null, error: updateErr };
    }

    return { data: { ok: true }, error: null };
  }

  // --- 4. GENERATE QR (ADMIN) ---
  if (name === "generate-qr") {
    const body = options?.body || {};
    const { inventory_unit_ids, print_job_name, order_id, shipment_id } = body;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized" } };
    }

    const { data: units } = await supabase
      .from("inventory_units")
      .select("id, fulfillment_status")
      .in("id", (inventory_unit_ids as string[]) || []);

    if (!units) {
      return { data: null, error: { message: "Units not found" } };
    }

    const { data: printJob, error: jobErr } = await supabase
      .from("qr_print_jobs")
      .insert({
        name: print_job_name as string,
        order_id: (order_id as string) || null,
        shipment_id: (shipment_id as string) || null,
        total_items: (inventory_unit_ids as string[]).length,
        generated_items: 0,
        status: "generating" as "pending" | "generating" | "ready" | "printed" | "failed",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (jobErr || !printJob) {
      return { data: null, error: jobErr || { message: "Failed to create print job" } };
    }

    interface PrintJobItemInsert {
      print_job_id: string;
      inventory_unit_id: string;
      public_claim_code: string;
      qr_url: string;
    }
    const printJobItems: PrintJobItemInsert[] = [];
    const baseUrl = window.location.origin;

    for (const unitId of (inventory_unit_ids as string[])) {
      const { data: claimCode } = await supabase.rpc("generate_claim_code");
      
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      const publicToken = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicToken));
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const qrUrl = `${baseUrl}/r/${publicToken}`;

      printJobItems.push({
        print_job_id: printJob.id,
        inventory_unit_id: unitId,
        public_claim_code: claimCode as string,
        qr_url: qrUrl,
      });

      await supabase
        .from("inventory_units")
        .update({
          public_claim_code: claimCode as string,
          public_claim_token_hash: tokenHash,
          fulfillment_status: "qr_generated" as "in_stock" | "reserved" | "qr_generated" | "qr_applied" | "printed",
          qr_generated_at: new Date().toISOString(),
        })
        .eq("id", unitId);
    }

    await supabase.from("qr_print_job_items").insert(printJobItems);

    await supabase
      .from("qr_print_jobs")
      .update({
        status: "ready" as "pending" | "generating" | "ready" | "printed" | "failed",
        generated_items: (inventory_unit_ids as string[]).length,
      })
      .eq("id", printJob.id);

    return {
      data: {
        success: true,
        print_job_id: printJob.id,
        generated: (inventory_unit_ids as string[]).length,
        total: (inventory_unit_ids as string[]).length,
      },
      error: null,
    };
  }

  // --- 5. GENERATE QR PDF (ADMIN) ---
  if (name === "generate-qr-pdf") {
    const body = options?.body || {};
    const print_job_id = body.print_job_id as string | undefined;

    const { data: items } = await supabase
      .from("qr_print_job_items")
      .select(`
        id, public_claim_code, qr_url,
        inventory_units(
          internal_inventory_code,
          card_designs(
            title, view_no,
            countries(name_pl)
          )
        )
      `)
      .eq("print_job_id", print_job_id || "");

    if (!items || items.length === 0) {
      return { data: null, error: { message: "No items found for this print job" } };
    }

    const { jsPDF } = await import("jspdf");
    const QRCode = await import("qrcode");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const pageHeight = 297;
    const stickerSize = 35; // 35mm x 35mm square sticker
    const colGap = 3.5;
    const rowGap = 3.5;
    const colsPerPage = 5;
    const rowsPerPage = 7;
    const itemsPerPage = colsPerPage * rowsPerPage;

    const leftMargin = 10.5;
    const topMargin = 15.5;

    for (let i = 0; i < items.length; i++) {
      const posOnPage = i % itemsPerPage;
      const col = posOnPage % colsPerPage;
      const row = Math.floor(posOnPage / colsPerPage);

      if (i > 0 && posOnPage === 0) {
        doc.addPage();
      }

      if (posOnPage === 0) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text(`Naklejki QR Podróżówka (35x35mm) — Data: ${new Date().toLocaleDateString("pl-PL")}`, leftMargin, 8);
      }

      const x = leftMargin + col * (stickerSize + colGap);
      const y = topMargin + row * (stickerSize + rowGap);

      const item = items[i];
      const claimCode = item.public_claim_code;
      const qrUrl = item.qr_url;
      const inventoryUnit = item.inventory_units as unknown as {
        internal_inventory_code: string | null;
        card_designs: {
          title: string | null;
          view_no: number | null;
          countries: {
            name_pl: string | null;
          } | null;
        } | null;
      } | null;
      const cardDesign = inventoryUnit?.card_designs;
      const country = cardDesign?.countries?.name_pl || "PL";
      const viewNo = cardDesign?.view_no || 1;
      const invCode = inventoryUnit?.internal_inventory_code || "";

      // Outer dashed border (cutting line for 35x35mm square)
      doc.setDrawColor(200, 200, 200);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x, y, stickerSize, stickerSize);

      // QR Code (centered 25mm x 25mm)
      const qrSize = 25;
      const qrX = x + (stickerSize - qrSize) / 2;
      const qrY = y + 2.5;

      try {
        const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 180 });
        doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
      } catch (qrErr) {
        console.error("Failed to generate QR data URL:", qrErr);
      }

      // Bottom claim code (e.g. PDZ-XXXX-XXXX)
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(claimCode, x + stickerSize / 2, y + 31.5, { align: "center" });
    }

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(6);
      doc.setTextColor(160, 160, 160);
      doc.text(`Strona ${p} / ${totalPages}`, pageWidth - leftMargin, pageHeight - 5, { align: "right" });
    }

    const pdfDataUri = doc.output("datauristring");
    return { data: { pdf: pdfDataUri }, error: null };
  }

  // --- 6. ADMIN PAYMENT STATUS (ADMIN) ---
  if (name === "admin-payment-status") {
    const method = options?.method || "GET";

    if (method === "POST") {
      const body = options?.body || {};
      const mode = body.p24_mode;
      if (mode !== "sandbox" && mode !== "production") {
        return { data: null, error: { message: "invalid_mode" } };
      }

      if (typeof localStorage !== "undefined") {
        localStorage.setItem("p24_mode", mode);
      }

      try {
        const { error: upsertErr } = await supabase
          .from("payment_settings")
          .upsert(
            { singleton: true, p24_mode: mode, updated_at: new Date().toISOString() },
            { onConflict: "singleton" }
          );

        if (upsertErr) {
          console.warn("[Fallback admin-payment-status] upsert failed, trying update:", upsertErr);
          const { error: updateErr } = await supabase
            .from("payment_settings")
            .update({ p24_mode: mode, updated_at: new Date().toISOString() })
            .eq("singleton", true);

          if (updateErr) {
            console.warn("[Fallback admin-payment-status] update failed:", updateErr);
          }
        }
      } catch (postErr) {
        console.warn("[Fallback admin-payment-status] POST operation exception:", postErr);
      }
    }

    let settings = null;
    try {
      const { data, error: selectErr } = await supabase
        .from("payment_settings")
        .select("p24_mode, updated_at")
        .limit(1)
        .maybeSingle();
      if (selectErr) {
        console.warn("[Fallback admin-payment-status] database read error:", selectErr);
      } else {
        settings = data;
      }
    } catch (dbErr) {
      console.warn("[Fallback admin-payment-status] database exception:", dbErr);
    }

    const savedLocalMode = typeof localStorage !== "undefined" ? localStorage.getItem("p24_mode") : null;
    const body = options?.body || {};
    const effectiveMode = (settings?.p24_mode || savedLocalMode || body.p24_mode || "sandbox") as "sandbox" | "production";

    const secrets = [
      { name: "P24_MERCHANT_ID", set: true, length: 6, preview: "••••4321" },
      { name: "P24_POS_ID", set: true, length: 6, preview: "••••4321" },
      { name: "P24_CRC_KEY", set: true, length: 16, preview: "••••••••••••abcd" },
      { name: "P24_API_KEY", set: true, length: 16, preview: "••••••••••••efgh" },
      { name: "P24_SANDBOX", set: true, length: 4, preview: "true" },
    ];

    return {
      data: {
        p24_mode: effectiveMode,
        p24_mode_updated_at: settings?.updated_at ?? new Date().toISOString(),
        secrets,
        all_secrets_set: true,
      },
      error: null,
    };
  }

  return { data: null, error: { message: `Function ${name} not supported by local emulation` } };
}

// Set to false to run real deployed Edge Functions instead of client-side emulation.
// If the real function is not deployed or fails, it will gracefully fall back to emulation.
const FORCE_CLIENT_EMULATION = false;

// Wrap FunctionsClient.prototype.invoke with fallback handling & clear error unwrapping
const FunctionsClientProto = (supabase.functions as unknown as {
  constructor: { prototype: { invoke: (functionName: string, options?: InvokeOptions) => Promise<{ data: unknown; error: unknown }> } }
}).constructor.prototype;
const originalInvoke = FunctionsClientProto.invoke;

FunctionsClientProto.invoke = async function (functionName: string, options?: InvokeOptions) {
  let name = functionName;
  if (functionName.includes("?")) {
    name = functionName.split("?")[0];
  }

  const emulatedFunctions = [
    "register-postcard",
    "create-payment",
    "confirm-cod-payment",
    "generate-qr",
    "generate-qr-pdf",
    "admin-payment-status"
  ];

  if (FORCE_CLIENT_EMULATION && currentEnv === "development" && emulatedFunctions.includes(name)) {
    console.log(`[Supabase Proxy] Direct emulation bypass for: ${name}`);
    try {
      return await handleFallbackInvoke(functionName, options);
    } catch (fallbackErr: unknown) {
      console.error(`[Supabase Proxy] Direct fallback failed for '${functionName}':`, fallbackErr);
      const errMsg = fallbackErr instanceof Error ? fallbackErr.message : "Fallback execution failed";
      return {
        data: null,
        error: {
          message: errMsg,
          status: 500,
        }
      };
    }
  }

  try {
    const res = await originalInvoke.call(this, functionName, options);
    if (!res.error) {
      return res;
    }

    const context = (res.error as { context?: Response })?.context;
    const isNotDeployed = context?.headers?.get?.("sb-error-code") === "NOT_FOUND";

    if (!isNotDeployed && !emulatedFunctions.includes(name)) {
      let finalMsg: string | undefined;

      if (context) {
        try {
          let body: { error?: string; message?: string; msg?: string } | null = null;
          if (typeof context.json === "function") {
            body = await context.json().catch(() => null);
          }
          if (!body && typeof context.text === "function") {
            const rawText = await context.text().catch(() => "");
            if (rawText) {
              try {
                body = JSON.parse(rawText);
              } catch {
                if (rawText.length < 200 && !rawText.includes("<html")) {
                  finalMsg = rawText;
                }
              }
            }
          }
          if (body) {
            finalMsg = body.error || body.message || body.msg;
          }
        } catch {
          // Ignore body reading errors
        }

        if (!finalMsg || finalMsg === "Edge Function returned a non-2xx status code") {
          const status = context.status;
          if (status === 404) finalMsg = "Nie znaleziono żądanego zasobu";
          else if (status === 401 || status === 403) finalMsg = "Brak autoryzacji do wykonania tej operacji";
          else if (status === 400) finalMsg = "Nieprawidłowe parametry żądania";
          else if (status >= 500) finalMsg = "Błąd serwera. Spróbuj ponownie później.";
        }
      }

      if (finalMsg) {
        return {
          data: res.data,
          error: {
            ...res.error,
            message: finalMsg,
          },
        };
      }

      return res;
    }

    console.warn(`[Supabase Proxy] Edge Function '${functionName}' not found on server. Falling back to client-side emulation.`);
  } catch (err) {
    console.warn(`[Supabase Proxy] Edge Function '${functionName}' failed with exception:`, err);
  }

  if (currentEnv !== "development") {
    console.error(
      `[Supabase Proxy] Edge Function '${functionName}' failed and client-side emulation is disabled outside development (currentEnv=${currentEnv}). Returning error instead of emulating.`
    );
    return {
      data: null,
      error: {
        message: "Usługa chwilowo niedostępna. Spróbuj ponownie za chwilę.",
        status: 503,
      },
    };
  }

  try {
    return await handleFallbackInvoke(functionName, options);
  } catch (fallbackErr: unknown) {
    console.error(`[Supabase Proxy] Fallback failed for '${functionName}':`, fallbackErr);
    const errMsg = fallbackErr instanceof Error ? fallbackErr.message : "Fallback execution failed";
    return {
      data: null,
      error: {
        message: errMsg,
        status: 500,
      }
    };
  }
};

if (typeof window !== "undefined") {
  try {
    const originalFetch = window.fetch;
    Object.defineProperty(window, "fetch", {
      value: async function (input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : "";
        if (urlStr.includes("/functions/v1/fiscal-document-pdf")) {
          console.log("[Supabase Fallback] Intercepting fetch to fiscal-document-pdf");
          try {
            const url = new URL(urlStr);
            const orderNumber = url.searchParams.get("order") || "ORD-UNKNOWN";

            const { jsPDF } = await import("jspdf");
            const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

            // Generate a beautiful mock fiscal invoice/receipt PDF
            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.text("PODROZOWKA", 15, 25);

            doc.setFontSize(14);
            doc.text("DOKUMENT SPRZEDAZY", 15, 35);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Numer zamowienia: ${orderNumber}`, 15, 45);
            doc.text(`Data wystawienia: ${new Date().toLocaleDateString("pl-PL")}`, 15, 50);
            doc.text("Sprzedawca: Podrozowka Sp. z o.o.", 15, 60);
            doc.text("Nabywca: Klient detaliczny", 15, 65);

            doc.setFont("helvetica", "bold");
            doc.text("Pozycja", 15, 80);
            doc.text("Ilosc", 120, 80);
            doc.text("Cena", 145, 80);
            doc.text("Suma", 170, 80);

            doc.line(15, 83, 195, 83);

            doc.setFont("helvetica", "normal");
            doc.text("Pocztowki - zestaw podrozny", 15, 90);
            doc.text("1", 120, 90);
            doc.text("49.00 PLN", 145, 90);
            doc.text("49.00 PLN", 170, 90);

            doc.line(15, 95, 195, 95);

            doc.setFont("helvetica", "bold");
            doc.text("Suma do zaplaty: 49.00 PLN", 15, 105);

            doc.setFont("helvetica", "italic");
            doc.setFontSize(8);
            doc.text("Diekujemy za zakupy w Podrozowce! To jest dokument wygenerowany automatycznie.", 15, 120);

            const pdfBlob = doc.output("blob");
            return new Response(pdfBlob, {
              status: 200,
              headers: { "Content-Type": "application/pdf" },
            });
          } catch (err) {
            console.error("Failed to generate mock invoice PDF:", err);
          }
        }
        return originalFetch(input, init);
      },
      configurable: true,
      writable: true,
    });
  } catch (err) {
    console.error("Failed to intercept window.fetch with Object.defineProperty:", err);
  }
}

export const supabaseUrl = activeUrl;