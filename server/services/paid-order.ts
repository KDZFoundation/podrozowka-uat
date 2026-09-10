/** Explicit payment state wins over legacy fulfillment state. */
export const isPaidOrder = (order: Record<string, unknown>) => {
  const payment = typeof order.payment_status === "string" ? order.payment_status.trim().toLowerCase() : "";
  const legacy = typeof order.status === "string" ? order.status.trim().toLowerCase() : "";
  return payment ? ["paid", "completed"].includes(payment) : legacy === "paid";
};
