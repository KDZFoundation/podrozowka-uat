import { expect, it } from "vitest";
import { isPaidOrder } from "../../server/services/paid-order";

it.each([
  [{ payment_status: "paid", status: "new" }, true],
  [{ payment_status: "pending", status: "paid" }, false],
  [{ payment_status: "refunded", status: "completed" }, false],
  [{ status: "paid" }, true],
  [{ status: "completed" }, false],
  [{ payment_method: "cod", payment_status: "pending" }, false],
])("uses the same explicit payment semantics for stats and ranking: %j", (order, paid) => {
  expect(isPaidOrder(order)).toBe(paid);
});
