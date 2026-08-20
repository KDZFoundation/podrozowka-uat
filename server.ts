import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function secureEquals(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

async function markOrderPaidInFirestore(orderNumber: string, paymentId: string, _amount: string) {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const { projectId, apiKey, firestoreDatabaseId } = config;
    if (!projectId || !firestoreDatabaseId) return;

    // Run structured query to find document by order_number
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents:runQuery?key=${apiKey}`;
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "order_number" },
            op: "EQUAL",
            value: { stringValue: orderNumber },
          },
        },
        limit: 1,
      },
    };

    const qRes = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryBody),
    });

    const qData = (await qRes.json()) as Array<{ document?: { name: string } }>;
    if (Array.isArray(qData) && qData[0]?.document?.name) {
      const docPath = qData[0].document.name;
      const patchUrl = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=payment_status&updateMask.fieldPaths=status&updateMask.fieldPaths=hotpay_payment_id&updateMask.fieldPaths=paid_at&key=${apiKey}`;
      await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            payment_status: { stringValue: "paid" },
            status: { stringValue: "paid" },
            hotpay_payment_id: { stringValue: paymentId },
            paid_at: { stringValue: new Date().toISOString() },
          },
        }),
      });
      console.log(`[Firestore]: Zamówienie ${orderNumber} zostało zaktualizowane jako OPŁACONE (paid).`);
    }
  } catch (err) {
    console.error("[Firestore Webhook Update Error]:", err);
  }
}

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

  // Initialize HotPay Payment
  app.post("/api/payments/create-hotpay", async (req, res) => {
    try {
      const {
        items,
        shipping_cost_grosze = 0,
        pickup_point,
        shipping_address,
        invoice,
        payment_method = "online",
        customer_email = "",
        origin_url,
      } = req.body || {};

      const totalQty = Array.isArray(items)
        ? items.reduce((sum: number, it: { quantity?: number }) => sum + (Number(it?.quantity) || 0), 0)
        : 0;

      if (totalQty < 10 && items && items.length > 0) {
        return res.status(400).json({ error: "Minimalne zamówienie to 10 podróżówek" });
      }

      // Calculate total amount in PLN
      let calculatedTotal = (Number(shipping_cost_grosze) || 0) / 100;
      if (Array.isArray(items)) {
        calculatedTotal += items.reduce(
          (sum: number, it: { quantity?: number; unit_price?: number }) =>
            sum + (Number(it?.quantity) || 1) * (Number(it?.unit_price) || 1.2),
          0
        );
      }

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
      const amountStr = calculatedTotal.toFixed(2);
      const serviceName = `Podróżówka - zamówienie ${orderNumber}`;
      const clientOrigin = origin_url || req.headers.origin || `http://${req.headers.host}`;
      const returnUrl = `${clientOrigin}/checkout/potwierdzenie?order=${encodeURIComponent(orderNumber)}`;

      const hotpaySecret = process.env.HOTPAY_SECRET;
      const hotpayPassword = process.env.HOTPAY_NOTIFICATION_PASSWORD;

      if (payment_method === "cod") {
        return res.json({
          ok: true,
          payment_method: "cod",
          order_number: orderNumber,
          redirect_url: `${returnUrl}&cod=1`,
        });
      }

      // If HotPay credentials are fully configured, call the official HotPay API
      if (hotpaySecret && hotpayPassword) {
        const hashInput = `${hotpayPassword};${amountStr};${serviceName};${returnUrl};${orderNumber};${hotpaySecret}`;
        const hash = sha256Hex(hashInput);

        const formData = new URLSearchParams();
        formData.append("SEKRET", hotpaySecret);
        formData.append("KWOTA", amountStr);
        formData.append("NAZWA_USLUGI", serviceName);
        formData.append("ADRES_WWW", returnUrl);
        formData.append("ID_ZAMOWIENIA", orderNumber);
        formData.append("EMAIL", customer_email || "");
        formData.append("TYP", "INIT");
        formData.append("HASH", hash);

        try {
          const hotpayResponse = await fetch("https://platnosc.hotpay.pl/", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
          });

          const hotpayData = (await hotpayResponse.json().catch(() => null)) as {
            STATUS?: boolean;
            URL?: string;
            WIADOMOSC?: string;
          } | null;

          if (hotpayResponse.ok && hotpayData?.STATUS && hotpayData.URL) {
            return res.json({
              ok: true,
              order_number: orderNumber,
              payment_gateway: "hotpay",
              redirect_url: hotpayData.URL,
            });
          }

          console.warn("[HotPay INIT Response]:", hotpayData);
          // If HotPay returned an error (e.g. invalid service in test), provide informative feedback
          return res.status(502).json({
            error: hotpayData?.WIADOMOSC || "Błąd inicjalizacji płatności w bramce HotPay",
            details: hotpayData,
            order_number: orderNumber,
          });
        } catch (fetchError) {
          console.error("[HotPay Fetch Error]:", fetchError);
          return res.status(502).json({
            error: "Nie udało się połączyć z bramką HotPay",
            order_number: orderNumber,
          });
        }
      }

      // If credentials are not set yet, simulate graceful redirection to confirmation with warning
      console.warn("[HotPay]: Brak HOTPAY_SECRET lub HOTPAY_NOTIFICATION_PASSWORD w środowisku. Przekierowanie do potwierdzenia testowego.");
      return res.json({
        ok: true,
        order_number: orderNumber,
        payment_gateway: "hotpay",
        redirect_url: returnUrl,
        warning: "Brak skonfigurowanych kluczy HotPay w zmiennych środowiskowych.",
      });
    } catch (error) {
      console.error("[API payments/create-hotpay]:", error);
      res.status(500).json({ error: "Błąd serwera podczas tworzenia płatności" });
    }
  });

  // HotPay IPN Webhook
  app.post("/api/payments/hotpay-webhook", async (req, res) => {
    try {
      const body = req.body || {};
      const amount = String(body.KWOTA || "").trim();
      const paymentId = String(body.ID_PLATNOSCI || "").trim();
      const orderNumber = String(body.ID_ZAMOWIENIA || "").trim();
      const status = String(body.STATUS || "").trim();
      const secure = String(body.SECURE || "").trim();
      const secret = String(body.SEKRET || "").trim();
      const incomingHash = String(body.HASH || "").trim().toLowerCase();

      if (!amount || !paymentId || !orderNumber || !status || !secure || !secret || !incomingHash) {
        console.warn("[HotPay Webhook]: Brak wymaganych pól w notyfikacji.");
        return res.status(400).send("bad request");
      }

      const hotpaySecret = process.env.HOTPAY_SECRET || "";
      const hotpayPassword = process.env.HOTPAY_NOTIFICATION_PASSWORD || "";

      if (!hotpaySecret || !hotpayPassword) {
        console.error("[HotPay Webhook]: Brak skonfigurowanych kluczy HotPay na serwerze.");
        return res.status(503).send("gateway not configured");
      }

      if (!secureEquals(secret, hotpaySecret)) {
        console.error("[HotPay Webhook]: Niezgodny sekret usługi.", orderNumber);
        return res.status(400).send("invalid secret");
      }

      const expectedHash = sha256Hex(
        `${hotpayPassword};${amount};${paymentId};${orderNumber};${status};${secure};${secret}`
      ).toLowerCase();

      if (!secureEquals(expectedHash, incomingHash)) {
        console.error("[HotPay Webhook]: Niezgodny podpis HASH.", orderNumber);
        return res.status(400).send("invalid signature");
      }

      console.log(`[HotPay Webhook]: Otrzymano poprawne powiadomienie dla ${orderNumber}, status: ${status}, kwota: ${amount} PLN.`);

      if (status === "SUCCESS") {
        await markOrderPaidInFirestore(orderNumber, paymentId, amount);
      }

      // Return OK response to HotPay
      res.status(200).send("OK");
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
