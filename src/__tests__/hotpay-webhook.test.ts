import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { amountToGrosze, hotpayNotificationHash, matchesHotpayOrderPayment } from "../../server/routes/payments/hotpay-webhook";

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

  it("compares the notification amount with the order total in grosze", () => {
    expect(amountToGrosze("63.89")).toBe(6389);
    expect(amountToGrosze("63,8")).toBe(6380);
    expect(amountToGrosze("63.899")).toBeNull();

    expect(matchesHotpayOrderPayment({
      notifiedAmount: "63.89",
      expectedAmountGrosze: 6389,
      orderCurrency: "PLN",
      configuredCurrency: "PLN",
    })).toBe(true);
    expect(matchesHotpayOrderPayment({
      notifiedAmount: "62.89",
      expectedAmountGrosze: 6389,
      orderCurrency: "PLN",
      configuredCurrency: "PLN",
    })).toBe(false);
  });

  it("requires the order currency to match HotPay settlement currency", () => {
    const expected = {
      notifiedAmount: "63.89",
      expectedAmountGrosze: 6389,
      orderCurrency: "PLN",
      configuredCurrency: "PLN",
    };

    expect(matchesHotpayOrderPayment(expected)).toBe(true);
    expect(matchesHotpayOrderPayment({ ...expected, orderCurrency: "EUR" })).toBe(false);
    expect(matchesHotpayOrderPayment({ ...expected, notifiedCurrency: "EUR" })).toBe(false);
    expect(matchesHotpayOrderPayment({ ...expected, notifiedCurrency: "pln" })).toBe(true);
  });
});
