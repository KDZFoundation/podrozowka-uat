import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  findOrdersByNumber: vi.fn(),
  fromFirestoreFields: vi.fn(),
  readDocument: vi.fn(),
  updateDocument: vi.fn(),
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
    firestore.readDocument.mockResolvedValue({ fields: { mocked: true } });
    firestore.fromFirestoreFields.mockReturnValue({
      total_amount_grosze: 6389,
      currency: "PLN",
      reservation_id: "reservation-1",
    });
    firestore.updateDocument.mockResolvedValue({});
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
    expect(firestore.updateDocument).toHaveBeenCalledWith("orders/order-1", expect.objectContaining({
      payment_status: "paid",
      status: "paid",
      hotpay_payment_id: "HP-123",
    }));
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
    expect(firestore.updateDocument).not.toHaveBeenCalled();
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
    expect(firestore.updateDocument).toHaveBeenCalledWith("orders/order-1", expect.objectContaining({
      payment_status: "failed",
      status: "payment_failed",
    }));
    expect(reservations.updateReservationStatus).toHaveBeenCalledWith("reservation-1", "released");
    expect(pod.preparePaidOrderPod).not.toHaveBeenCalled();
  });
});
