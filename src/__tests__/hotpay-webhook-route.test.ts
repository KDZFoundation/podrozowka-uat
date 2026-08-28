import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  findOrdersByNumber: vi.fn(),
  fromFirestoreFields: vi.fn(),
  readDocument: vi.fn(),
  updateDocumentIfCurrent: vi.fn(),
}));
const pod = vi.hoisted(() => ({ preparePaidOrderPod: vi.fn() }));
const reservations = vi.hoisted(() => ({ updateReservationStatus: vi.fn() }));

vi.mock("../../api/_lib/gcp-firestore.js", () => firestore);
vi.mock("../../api/_lib/pod-order.js", () => pod);
vi.mock("../../api/_lib/design-reservation.js", () => reservations);

import hotpayWebhook from "../../server/routes/payments/hotpay-webhook";

const notification = (overrides: Record<string, string> = {}) => {
  const values = {
    KWOTA: "63.89",
    ID_PLATNOSCI: "HP-123",
    ID_ZAMOWIENIA: "ORD-TEST-1",
    STATUS: "SUCCESS",
    SECURE: "secure-id",
    SEKRET: "hotpay-secret",
    ...overrides,
  };
  const hash = createHash("sha256")
    .update(`notification-password;${values.KWOTA};${values.ID_PLATNOSCI};${values.ID_ZAMOWIENIA};${values.STATUS};${values.SECURE};${values.SEKRET}`, "utf8")
    .digest("hex");
  return new URLSearchParams({ ...values, HASH: hash });
};

describe("HotPay webhook HTTP integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HOTPAY_SECRET = "hotpay-secret";
    process.env.HOTPAY_NOTIFICATION_PASSWORD = "notification-password";
    process.env.HOTPAY_CURRENCY = "PLN";
    firestore.findOrdersByNumber.mockResolvedValue(["orders/order-1"]);
    firestore.readDocument.mockResolvedValue({ fields: { mocked: true }, updateTime: "2026-08-28T12:00:00.000000Z" });
    firestore.fromFirestoreFields.mockReturnValue({
      total_amount_grosze: 6389,
      currency: "PLN",
      reservation_id: "reservation-1",
    });
    firestore.updateDocumentIfCurrent.mockResolvedValue({});
    pod.preparePaidOrderPod.mockResolvedValue(undefined);
    reservations.updateReservationStatus.mockResolvedValue(undefined);
  });

  it("marks the matching order paid, confirms its reservation and creates POD units", async () => {
    const response = await hotpayWebhook.fetch(new Request("https://example.test/api/payments/hotpay-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: notification().toString(),
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(firestore.updateDocumentIfCurrent).toHaveBeenCalledWith("orders/order-1", expect.objectContaining({
      payment_status: "paid",
      status: "paid",
      hotpay_payment_id: "HP-123",
    }), "2026-08-28T12:00:00.000000Z");
    expect(reservations.updateReservationStatus).toHaveBeenCalledWith("reservation-1", "confirmed");
    expect(pod.preparePaidOrderPod).toHaveBeenCalledWith("orders/order-1", "ORD-TEST-1");
  });

  it("rejects a validly signed callback when its amount differs from the order", async () => {
    const response = await hotpayWebhook.fetch(new Request("https://example.test/api/payments/hotpay-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: notification({ KWOTA: "62.89" }).toString(),
    }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("payment amount or currency mismatch");
    expect(firestore.updateDocumentIfCurrent).not.toHaveBeenCalled();
    expect(reservations.updateReservationStatus).not.toHaveBeenCalled();
    expect(pod.preparePaidOrderPod).not.toHaveBeenCalled();
  });

  it("releases the stock reservation after a rejected payment", async () => {
    const response = await hotpayWebhook.fetch(new Request("https://example.test/api/payments/hotpay-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: notification({ STATUS: "FAILURE" }).toString(),
    }));

    expect(response.status).toBe(200);
    expect(firestore.updateDocumentIfCurrent).toHaveBeenCalledWith("orders/order-1", expect.objectContaining({
      payment_status: "failed",
      status: "payment_failed",
    }), "2026-08-28T12:00:00.000000Z");
    expect(reservations.updateReservationStatus).toHaveBeenCalledWith("reservation-1", "released");
    expect(pod.preparePaidOrderPod).not.toHaveBeenCalled();
  });

  it("does not downgrade a paid order when a late FAILURE callback arrives", async () => {
    firestore.fromFirestoreFields.mockReturnValue({
      total_amount_grosze: 6389,
      currency: "PLN",
      reservation_id: "reservation-1",
      payment_status: "paid",
    });

    const response = await hotpayWebhook.fetch(new Request("https://example.test/api/payments/hotpay-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: notification({ STATUS: "FAILURE" }).toString(),
    }));

    expect(response.status).toBe(200);
    expect(firestore.updateDocumentIfCurrent).not.toHaveBeenCalled();
    expect(reservations.updateReservationStatus).not.toHaveBeenCalled();
  });

  it("marks a late SUCCESS after FAILURE for manual review without POD generation", async () => {
    firestore.fromFirestoreFields.mockReturnValue({
      total_amount_grosze: 6389,
      currency: "PLN",
      reservation_id: "reservation-1",
      payment_status: "failed",
    });

    const response = await hotpayWebhook.fetch(new Request("https://example.test/api/payments/hotpay-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: notification().toString(),
    }));

    expect(response.status).toBe(200);
    expect(firestore.updateDocumentIfCurrent).toHaveBeenCalledWith("orders/order-1", expect.objectContaining({
      payment_status: "payment_review_required",
      payment_review_reason: "success_after_released_reservation",
    }), "2026-08-28T12:00:00.000000Z");
    expect(reservations.updateReservationStatus).not.toHaveBeenCalled();
    expect(pod.preparePaidOrderPod).not.toHaveBeenCalled();
  });
});
