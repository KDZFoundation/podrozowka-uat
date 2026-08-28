import crypto from "node:crypto";
import { findOrdersByNumber, fromFirestoreFields, readDocument, updateDocument } from "../../../api/_lib/gcp-firestore.js";
import { preparePaidOrderPod } from "../../../api/_lib/pod-order.js";
import { updateReservationStatus } from "../../../api/_lib/design-reservation.js";

const safeEquals = (left: string, right: string) => left.length === right.length && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

/** Converts a PLN value from HotPay without using floating point arithmetic. */
export const amountToGrosze = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  if (!Number.isSafeInteger(whole)) return null;
  return whole * 100 + Number((match[2] || "").padEnd(2, "0"));
};

export const matchesHotpayOrderPayment = ({
  notifiedAmount,
  notifiedCurrency,
  expectedAmountGrosze,
  orderCurrency,
  configuredCurrency,
}: {
  notifiedAmount: string;
  notifiedCurrency?: string;
  expectedAmountGrosze: unknown;
  orderCurrency: unknown;
  configuredCurrency: string;
}) => {
  const amountGrosze = amountToGrosze(notifiedAmount);
  const expectedCurrency = String(orderCurrency || "PLN").trim().toUpperCase();
  const settlementCurrency = configuredCurrency.trim().toUpperCase();
  const callbackCurrency = notifiedCurrency?.trim().toUpperCase();

  return amountGrosze !== null
    && Number.isSafeInteger(Number(expectedAmountGrosze))
    && amountGrosze === Number(expectedAmountGrosze)
    && expectedCurrency === settlementCurrency
    && (!callbackCurrency || callbackCurrency === expectedCurrency);
};

export const hotpayNotificationHash = ({
  password,
  amount,
  paymentId,
  orderNumber,
  status,
  secure,
  secret,
}: {
  password: string;
  amount: string;
  paymentId: string;
  orderNumber: string;
  status: string;
  secure: string;
  secret: string;
}) => sha256(`${password};${amount};${paymentId};${orderNumber};${status};${secure};${secret}`);

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    try {
      const form = await request.formData();
      const amount = String(form.get("KWOTA") || "");
      const paymentId = String(form.get("ID_PLATNOSCI") || "");
      const orderNumber = String(form.get("ID_ZAMOWIENIA") || "");
      const status = String(form.get("STATUS") || "");
      const secure = String(form.get("SECURE") || "");
      const incomingSecret = String(form.get("SEKRET") || "");
      const incomingHash = String(form.get("HASH") || "").toLowerCase();
      // HotPay's standard Pay-by-Link callback currently does not include a
      // currency field. Support it if supplied, and otherwise compare the
      // order currency with our explicit HotPay settlement-currency setting.
      const incomingCurrency = String(form.get("WALUTA") || form.get("CURRENCY") || "");
      const configuredSecret = process.env.HOTPAY_SECRET || "";
      const password = process.env.HOTPAY_NOTIFICATION_PASSWORD || "";
      const configuredCurrency = process.env.HOTPAY_CURRENCY || "PLN";
      if (!amount || !paymentId || !orderNumber || !status || !secure || !incomingSecret || !incomingHash || !configuredSecret || !password) return new Response("bad request", { status: 400 });
      if (!safeEquals(incomingSecret, configuredSecret)) return new Response("invalid secret", { status: 400 });
      const expected = hotpayNotificationHash({ password, amount, paymentId, orderNumber, status, secure, secret: incomingSecret });
      if (!safeEquals(expected, incomingHash)) return new Response("invalid signature", { status: 400 });
      if (status === "SUCCESS") {
        const documentPaths = await findOrdersByNumber(orderNumber);
        if (documentPaths.length === 0) return new Response("order not found", { status: 404 });
        const orderId = documentPaths[0].split("/").pop();
        if (!orderId) return new Response("order not found", { status: 404 });
        const orderDocument = await readDocument("orders", orderId);
        const order = fromFirestoreFields(orderDocument.fields);
        if (!matchesHotpayOrderPayment({
          notifiedAmount: amount,
          notifiedCurrency: incomingCurrency,
          expectedAmountGrosze: order.total_amount_grosze,
          orderCurrency: order.currency,
          configuredCurrency,
        })) {
          return new Response("payment amount or currency mismatch", { status: 400 });
        }
        const paidAt = new Date().toISOString();
        await Promise.all(documentPaths.map((documentPath) => updateDocument(documentPath, {
          payment_status: "paid",
          status: "paid",
          hotpay_payment_id: paymentId,
          paid_at: paidAt,
          updated_at: paidAt,
        })));
        await updateReservationStatus(String(order.reservation_id || ""), "confirmed");
        await preparePaidOrderPod(documentPaths[0], orderNumber);
      } else if (["FAILURE", "FAILED", "CANCEL", "CANCELED"].includes(status.toUpperCase())) {
        const documentPaths = await findOrdersByNumber(orderNumber);
        if (documentPaths.length) {
          const orderId = documentPaths[0].split("/").pop() || "";
          const orderDocument = await readDocument("orders", orderId);
          const order = fromFirestoreFields(orderDocument.fields);
          await Promise.all(documentPaths.map((documentPath) => updateDocument(documentPath, {
            payment_status: "failed",
            status: "payment_failed",
            updated_at: new Date().toISOString(),
          })));
          await updateReservationStatus(String((order as Record<string, unknown>).reservation_id || ""), "released");
        }
      }
      return new Response("OK", { status: 200 });
    } catch {
      return new Response("internal server error", { status: 500 });
    }
  },
};
