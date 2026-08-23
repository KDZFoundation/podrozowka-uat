import { describe, expect, it } from "vitest";
import { normalizeOrder, uniqueOrders } from "@/integrations/firebase/services/firestoreService";

describe("Firestore orders", () => {
  it("normalizes backend grosze fields for the frontend", () => {
    const order = normalizeOrder("order-1", {
      order_number: "ORD-1",
      user_id: "firebase-user",
      status: "paid",
      payment_method: "hotpay",
      payment_status: "paid",
      total_amount_grosze: 6389,
      shipping_cost_grosze: 1399,
      created_at: "2026-08-23T12:00:00.000Z",
      items: [{ card_design_id: "design-1", title: "Podróżówka", quantity: 10, unit_price_grosze: 499, total_price_grosze: 4990 }],
    });

    expect(order.total_amount_pln).toBe(63.89);
    expect(order.shipping_cost_pln).toBe(13.99);
    expect(order.items[0].unit_price_pln).toBe(4.99);
    expect(order.items[0].total_price_pln).toBe(49.9);
  });

  it("keeps the paid copy when historical duplicate orders exist", () => {
    const pending = normalizeOrder("pending-copy", { order_number: "ORD-1", payment_status: "pending", created_at: "2026-08-23T12:01:00.000Z" });
    const paid = normalizeOrder("paid-copy", { order_number: "ORD-1", payment_status: "paid", status: "paid", created_at: "2026-08-23T12:00:00.000Z" });

    expect(uniqueOrders([pending, paid])).toEqual([paid]);
  });
});
