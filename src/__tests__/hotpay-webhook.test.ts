import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hotpayNotificationHash } from "../../api/payments/hotpay-webhook";

describe("HotPay webhook signature", () => {
  it("includes SECURE and service secret as separate values", () => {
    const values = {
      password: "notification-password",
      amount: "63.89",
      paymentId: "payment-123",
      orderNumber: "ORD-123",
      status: "SUCCESS",
      secure: "secure-transaction-id",
      secret: "service-secret",
    };
    const expected = createHash("sha256")
      .update("notification-password;63.89;payment-123;ORD-123;SUCCESS;secure-transaction-id;service-secret", "utf8")
      .digest("hex");

    expect(values.secure).not.toBe(values.secret);
    expect(hotpayNotificationHash(values)).toBe(expected);
  });
});
