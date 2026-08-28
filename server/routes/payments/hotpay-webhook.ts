import crypto from "node:crypto";
import { findOrdersByNumber, fromFirestoreFields, readDocument, updateDocumentIfCurrent } from "../../../api/_lib/gcp-firestore.js";
import { preparePaidOrderPod } from "../../../api/_lib/pod-order.js";
import { updateReservationStatus } from "../../../api/_lib/design-reservation.js";

const safeEquals = (left: string, right: string) => left.length === right.length && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const MAX_STATUS_TRANSITION_RETRIES = 3;

const uniqueOrderPath = async (orderNumber: string) => {
  const documentPaths = await findOrdersByNumber(orderNumber);
  if (documentPaths.length === 0) throw new Error("order_not_found");
  if (documentPaths.length > 1) throw new Error("ambiguous_order_number");
  return documentPaths[0];
};

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
      if (status.toUpperCase() === "SUCCESS") {
        const documentPath = await uniqueOrderPath(orderNumber);
        let confirmedOrder: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < MAX_STATUS_TRANSITION_RETRIES; attempt += 1) {
          const orderId = documentPath.split("/").pop();
          if (!orderId) return new Response("order not found", { status: 404 });
          const orderDocument = await readDocument("orders", orderId);
          const order = fromFirestoreFields(orderDocument.fields) as Record<string, unknown>;
          if (!matchesHotpayOrderPayment({
            notifiedAmount: amount,
            notifiedCurrency: incomingCurrency,
            expectedAmountGrosze: order.total_amount_grosze,
            orderCurrency: order.currency,
            configuredCurrency,
          })) {
            return new Response("payment amount or currency mismatch", { status: 400 });
          }

          const paymentStatus = String(order.payment_status || "pending");
          if (["failed", "initialization_failed", "payment_review_required"].includes(paymentStatus)) {
            if (["failed", "initialization_failed"].includes(paymentStatus) && orderDocument.updateTime) {
              try {
                await updateDocumentIfCurrent(documentPath, {
                  payment_status: "payment_review_required",
                  status: "payment_review_required",
                  late_success_payment_id: paymentId,
                  payment_review_reason: "success_after_released_reservation",
                  updated_at: new Date().toISOString(),
                }, orderDocument.updateTime);
              } catch (error) {
                if (attempt === MAX_STATUS_TRANSITION_RETRIES - 1) throw error;
                continue;
              }
            }
            return new Response("OK", { status: 200 });
          }

          if (paymentStatus !== "paid") {
            if (!orderDocument.updateTime) throw new Error("order_version_missing");
            const paidAt = new Date().toISOString();
            try {
              await updateDocumentIfCurrent(documentPath, {
                payment_status: "paid",
                status: "paid",
                hotpay_payment_id: paymentId,
                paid_at: paidAt,
                updated_at: paidAt,
              }, orderDocument.updateTime);
            } catch (error) {
              if (attempt === MAX_STATUS_TRANSITION_RETRIES - 1) throw error;
              continue;
            }
          }
          confirmedOrder = order;
          break;
        }
        if (!confirmedOrder) throw new Error("payment_status_transition_failed");
        await updateReservationStatus(String(confirmedOrder.reservation_id || ""), "confirmed");
        await preparePaidOrderPod(documentPath, orderNumber);
      } else if (["FAILURE", "FAILED", "CANCEL", "CANCELED"].includes(status.toUpperCase())) {
        const documentPath = await uniqueOrderPath(orderNumber);
        for (let attempt = 0; attempt < MAX_STATUS_TRANSITION_RETRIES; attempt += 1) {
          const orderId = documentPath.split("/").pop() || "";
          const orderDocument = await readDocument("orders", orderId);
          const order = fromFirestoreFields(orderDocument.fields) as Record<string, unknown>;
          const paymentStatus = String(order.payment_status || "pending");
          // A late failure must never downgrade a successfully paid order.
          if (["paid", "payment_review_required", "failed"].includes(paymentStatus)) break;
          if (!orderDocument.updateTime) throw new Error("order_version_missing");
          try {
            await updateDocumentIfCurrent(documentPath, {
              payment_status: "failed",
              status: "payment_failed",
              updated_at: new Date().toISOString(),
            }, orderDocument.updateTime);
            await updateReservationStatus(String(order.reservation_id || ""), "released");
            break;
          } catch (error) {
            if (attempt === MAX_STATUS_TRANSITION_RETRIES - 1) throw error;
          }
        }
      }
      return new Response("OK", { status: 200 });
    } catch (error) {
      if (error instanceof Error && error.message === "order_not_found") return new Response("order not found", { status: 404 });
      if (error instanceof Error && error.message === "ambiguous_order_number") return new Response("ambiguous order number", { status: 409 });
      return new Response("internal server error", { status: 500 });
    }
  },
};
