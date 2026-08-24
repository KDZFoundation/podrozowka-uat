import crypto from "node:crypto";
import { findOrdersByNumber, updateDocument } from "../../../api/_lib/gcp-firestore.js";
import { preparePaidOrderPod } from "../../../api/_lib/pod-order.js";

const safeEquals = (left: string, right: string) => left.length === right.length && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

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
      const configuredSecret = process.env.HOTPAY_SECRET || "";
      const password = process.env.HOTPAY_NOTIFICATION_PASSWORD || "";
      if (!amount || !paymentId || !orderNumber || !status || !secure || !incomingSecret || !incomingHash || !configuredSecret || !password) return new Response("bad request", { status: 400 });
      if (!safeEquals(incomingSecret, configuredSecret)) return new Response("invalid secret", { status: 400 });
      const expected = hotpayNotificationHash({ password, amount, paymentId, orderNumber, status, secure, secret: incomingSecret });
      if (!safeEquals(expected, incomingHash)) return new Response("invalid signature", { status: 400 });
      if (status === "SUCCESS") {
        const documentPaths = await findOrdersByNumber(orderNumber);
        if (documentPaths.length === 0) return new Response("order not found", { status: 404 });
        const paidAt = new Date().toISOString();
        await Promise.all(documentPaths.map((documentPath) => updateDocument(documentPath, {
          payment_status: "paid",
          status: "paid",
          hotpay_payment_id: paymentId,
          paid_at: paidAt,
          updated_at: paidAt,
        })));
        await preparePaidOrderPod(documentPaths[0], orderNumber);
      }
      return new Response("OK", { status: 200 });
    } catch {
      return new Response("internal server error", { status: 500 });
    }
  },
};
