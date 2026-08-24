import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";

import hotpayWebhookHandler from "./api/payments/hotpay-webhook";
import registerPostcardHandler from "./api/register-postcard";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // --- API Routes ---

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // QR registration uses short-lived local Application Default Credentials in
  // development and Vercel Workload Identity in deployed environments.
  app.all("/api/register-postcard", async (req, res) => {
    try {
      const requestUrl = `http://localhost:${PORT}${req.originalUrl}`;
      const response = await registerPostcardHandler.fetch(new Request(requestUrl, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: ["POST", "PUT", "PATCH"].includes(req.method) ? JSON.stringify(req.body || {}) : undefined,
      }));
      const body = await response.text();
      res.status(response.status);
      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      res.send(body);
    } catch (e) {
      console.error("[server.ts /api/register-postcard error]:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // Payment configuration status
  app.get("/api/payments/status", (_req, res) => {
    const hotpaySecret = process.env.HOTPAY_SECRET;
    const hotpayPassword = process.env.HOTPAY_NOTIFICATION_PASSWORD;
    const isConfigured = Boolean(hotpaySecret && hotpayPassword);

    res.json({
      gateway: "hotpay",
      hotpay: {
        configured: isConfigured,
        secret_set: Boolean(hotpaySecret),
        notification_password_set: Boolean(hotpayPassword),
        secret_preview: hotpaySecret ? `${hotpaySecret.slice(0, 3)}••••` : null,
      },
    });
  });

  // The browser is local, but orders and payment credentials live in the UAT
  // backend. The previous local endpoint initialized HotPay without storing an
  // order in Firestore, so the return page could not find ORD-… afterwards.
  app.post("/api/payments/create-hotpay", async (req, res) => {
    const backendBaseUrl = (process.env.PAYMENT_BACKEND_API_URL || "https://podrozowka-uat-one.vercel.app").replace(/\/$/, "");
    try {
      const response = await fetch(`${backendBaseUrl}/api/payments/create-hotpay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {}),
      });
      const body = await response.text();
      res.status(response.status);
      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      res.send(body);
    } catch (error) {
      console.error("[API payments/create-hotpay proxy error]:", error);
      res.status(502).json({ error: "payment_backend_unavailable" });
    }
  });

  // HotPay IPN Webhook
  app.post("/api/payments/hotpay-webhook", async (req, res) => {
    try {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(req.body || {})) form.set(key, String(value));
      const webhookRequest = new Request(`http://${req.headers.host || "localhost"}${req.originalUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const webhookResponse = await hotpayWebhookHandler.fetch(webhookRequest);
      res.status(webhookResponse.status).send(await webhookResponse.text());
    } catch (error) {
      console.error("[HotPay Webhook Error]:", error);
      res.status(500).send("internal server error");
    }
  });

  // --- InPost ShipX & Geowidget API Routes ---

  function getInpostConfig() {
    const organizationId = process.env.INPOST_SHIPX_ORGANIZATION_ID || process.env.INPOST_ORGANIZATION_ID || "";
    const apiToken = process.env.INPOST_SHIPX_TOKEN || process.env.INPOST_API_TOKEN || "";
    const geowidgetToken = process.env.INPOST_GEOWIDGET_TOKEN || process.env.VITE_INPOST_GEOWIDGET_TOKEN || "";
    const env = (process.env.INPOST_SHIPX_ENV || process.env.INPOST_ENV || "sandbox").toLowerCase();
    const isProduction = env === "production";
    const baseUrl = isProduction
      ? "https://api-shipx-pl.easypack24.net/v1"
      : "https://sandbox-api-shipx-pl.easypack24.net/v1";

    return {
      organizationId,
      apiToken,
      geowidgetToken,
      environment: (isProduction ? "production" : "sandbox") as "production" | "sandbox",
      baseUrl,
    };
  }

  // Geowidget config for frontend checkout
  app.get("/api/inpost/geowidget-config", (_req, res) => {
    const cfg = getInpostConfig();
    res.json({
      token: cfg.geowidgetToken || null,
      environment: cfg.environment,
    });
  });

  // Admin InPost settings status
  app.get("/api/inpost/settings", (_req, res) => {
    const cfg = getInpostConfig();
    res.json({
      environment: cfg.environment,
      updated_at: new Date().toISOString(),
      organization: {
        set: Boolean(cfg.organizationId),
        preview: cfg.organizationId ? `••••${cfg.organizationId.slice(-4)}` : "",
      },
      api_token: {
        set: Boolean(cfg.apiToken),
        preview: cfg.apiToken ? `••••${cfg.apiToken.slice(-4)}` : "",
      },
      geowidget_token: {
        set: Boolean(cfg.geowidgetToken),
        preview: cfg.geowidgetToken ? `••••${cfg.geowidgetToken.slice(-4)}` : "",
      },
    });
  });

  // Create InPost Shipment via ShipX
  app.post("/api/inpost/create-shipment", async (req, res) => {
    try {
      const cfg = getInpostConfig();
      if (!cfg.organizationId || !cfg.apiToken) {
        return res.status(400).json({
          error: "Brak skonfigurowanych danych InPost ShipX (ID organizacji lub token API).",
        });
      }

      const { order_id, size = "small", receiver_point, receiver_address, customer_email, customer_phone, order_number } = req.body || {};

      const templates: Record<string, string> = {
        A: "small",
        B: "medium",
        C: "large",
        small: "small",
        medium: "medium",
        large: "large",
      };
      const template = templates[size] || "small";

      const isLocker = Boolean(receiver_point || !receiver_address);
      const targetPoint = receiver_point || "KRA010"; // default fallback for test

      const payload: Record<string, unknown> = {
        receiver: {
          first_name: "Klient",
          last_name: "Podróżówka",
          email: customer_email || "klient@podrozowka.pl",
          phone: (customer_phone || "500000000").replace(/\D/g, "").slice(-9),
          ...(isLocker
            ? {}
            : {
                address: {
                  street: receiver_address?.street || "Główna 1",
                  building_number: receiver_address?.building_number || "1",
                  city: receiver_address?.city || "Warszawa",
                  post_code: (receiver_address?.postal_code || "00-001").replace(/[^\d-]/g, ""),
                  country_code: "PL",
                },
              }),
        },
        parcels: {
          template,
        },
        service: isLocker ? "inpost_locker_standard" : "inpost_courier_standard",
        reference: order_number || order_id || `ORD-${Date.now()}`,
        ...(isLocker ? { custom_attributes: { target_point: targetPoint } } : {}),
      };

      const shipxUrl = `${cfg.baseUrl}/organizations/${cfg.organizationId}/shipments`;
      const response = await fetch(shipxUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as {
        id?: number | string;
        status?: string;
        tracking_number?: string;
        error?: string;
        message?: string;
        details?: unknown;
      } | null;

      if (!response.ok || !data?.id) {
        console.error("[InPost ShipX Create Error]:", data);
        return res.status(response.status || 500).json({
          error: data?.message || data?.error || "Błąd rejestracji przesyłki w InPost ShipX",
          details: data?.details || data,
        });
      }

      res.json({
        success: true,
        shipment: {
          inpost_shipment_id: String(data.id),
          inpost_status: data.status || "created",
          tracking_number: data.tracking_number || null,
        },
        shipx_response: data,
      });
    } catch (error) {
      console.error("[API InPost create-shipment error]:", error);
      res.status(500).json({ error: "Błąd serwera podczas tworzenia przesyłki InPost" });
    }
  });

  // Buy / Dispatch InPost Shipment
  app.post("/api/inpost/buy-shipment", async (req, res) => {
    try {
      const cfg = getInpostConfig();
      if (!cfg.apiToken) {
        return res.status(400).json({ error: "Brak tokenu InPost ShipX." });
      }

      const { shipment_id } = req.body || {};
      if (!shipment_id) {
        return res.status(400).json({ error: "Wymagane ID przesyłki (shipment_id)." });
      }

      const buyUrl = `${cfg.baseUrl}/shipments/${encodeURIComponent(shipment_id)}/buy`;
      const response = await fetch(buyUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json({
          error: (data as { message?: string })?.message || "Błąd zakupu przesyłki w InPost ShipX",
        });
      }

      res.json({
        success: true,
        message: "Przesyłka została zakupiona i przygotowana do nadania.",
        data,
      });
    } catch (error) {
      console.error("[API InPost buy-shipment error]:", error);
      res.status(500).json({ error: "Błąd serwera podczas zakupu przesyłki InPost" });
    }
  });

  // Download PDF Label from InPost
  app.get("/api/inpost/label/:shipmentId", async (req, res) => {
    try {
      const cfg = getInpostConfig();
      if (!cfg.apiToken) {
        return res.status(400).json({ error: "Brak tokenu InPost ShipX." });
      }

      const { shipmentId } = req.params;
      const labelUrl = `${cfg.baseUrl}/shipments/${encodeURIComponent(shipmentId)}/label?format=pdf&type=normal`;

      const response = await fetch(labelUrl, {
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: "Etykieta nie jest jeszcze gotowa w InPost ShipX (wymagane opłacenie/potwierdzenie przesyłki).",
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="inpost-${shipmentId}.pdf"`);

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("[API InPost get-label error]:", error);
      res.status(500).json({ error: "Błąd podczas pobierania etykiety InPost" });
    }
  });

  // InPost ShipX Status Webhook
  app.post("/api/inpost/webhook", async (req, res) => {
    try {
      const body = req.body || {};
      const cfg = getInpostConfig();
      const expectedOrg = cfg.organizationId;

      if (expectedOrg && body.organization_id && String(body.organization_id) !== expectedOrg) {
        return res.status(403).json({ error: "Nieprawidłowa organizacja ShipX" });
      }

      const remoteId = body.payload?.shipment_id ?? body.shipment_id;
      const event = String(body.event || "shipment_status_changed");
      const trackingNumber = body.payload?.tracking_number ?? body.tracking_number ?? null;

      console.log(`[InPost Webhook]: Zdarzenie ${event} dla przesyłki ${remoteId}, tracking: ${trackingNumber}`);

      res.status(200).json({ received: true, event, remoteId });
    } catch (error) {
      console.error("[InPost Webhook Error]:", error);
      res.status(500).json({ error: "Błąd serwera podczas przetwarzania webhooka InPost" });
    }
  });

  // --- Vite Dev Middleware or Static Production Serving ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Podróżówka running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
