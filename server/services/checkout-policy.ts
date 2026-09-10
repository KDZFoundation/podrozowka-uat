import { z } from "zod";
import { fromFirestoreFields, readDocument } from "../../api/_lib/gcp-firestore.js";
import { getShippingCostGrosze } from "../../src/lib/constants.js";
import { verifyFirebaseIdToken } from "../auth/require-admin.js";

export class CheckoutPolicyError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

const text = (max: number) => z.string().trim().min(1).max(max);
const address = z.object({
  name: text(200), street: text(300), city: text(100),
  postal_code: z.string().regex(/^\d{2}-\d{3}$/),
  phone: z.string().transform(value => value.replace(/[\s()-]/g, "")).pipe(z.string().regex(/^\+?\d{9,15}$/)),
});
const recipient = address.pick({ name: true, phone: true }).extend({
  street: z.string().max(300).optional(), postal_code: z.string().max(20).optional(), city: z.string().max(100).optional(),
});
export const checkoutSchema = z.object({
  items: z.array(z.object({
    card_design_id: text(200).refine(value => !value.includes("/")),
    quantity: z.number().int().min(1).max(10000),
    primary_language_code: z.string().max(30).optional(),
    secondary_language_code: z.string().max(30).optional(),
  })).min(1).max(100),
  payment_method: z.enum(["online", "cod"]),
  shipping_method: z.enum(["inpost_locker", "inpost_courier", "orlen_paczka", "pocztex_point", "pocztex_courier"]),
  pickup_point: z.object({ name: text(200), address: text(300), city: text(100), code: text(100) }).nullable().optional(),
  shipping_address: recipient.nullable().optional(),
  invoice: z.discriminatedUnion("requested", [
    z.object({ requested: z.literal(false) }),
    z.object({ requested: z.literal(true), company_name: text(200), company_nip: z.string().regex(/^\d{10}$/), company_address: text(500) }),
  ]).default({ requested: false }),
  idempotency_key: z.string().optional(),
}).superRefine((body, context) => {
  const courier = body.shipping_method.endsWith("courier");
  if (courier ? !body.shipping_address : !body.pickup_point) {
    context.addIssue({ code: "custom", message: "missing_delivery_details" });
  }
  if (courier && !address.safeParse(body.shipping_address).success) {
    context.addIssue({ code: "custom", message: "invalid_courier_address" });
  }
  if (body.shipping_method === "orlen_paczka" && !body.shipping_address) {
    context.addIssue({ code: "custom", message: "missing_recipient" });
  }
});

export async function checkoutIdentity(request: Request) {
  // Explicit opt-in: a hidden storefront must not leave a writable checkout API.
  if (process.env.SALES_ENABLED !== "true" || process.env.VITE_COMING_SOON === "true") {
    throw new CheckoutPolicyError("sales_not_enabled", 503);
  }
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new CheckoutPolicyError("customer_authentication_required", 401);
  let claims;
  try { claims = await verifyFirebaseIdToken(token); }
  catch { throw new CheckoutPolicyError("customer_verification_unavailable", 503); }
  if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128
    || typeof claims.email !== "string" || !z.email().safeParse(claims.email).success) {
    throw new CheckoutPolicyError("invalid_customer_token", 401);
  }
  return { userId: claims.sub, customerEmail: claims.email };
}

export async function checkoutDelivery(body: z.infer<typeof checkoutSchema>) {
  const flag = body.shipping_method.startsWith("inpost") ? "inpost_shipping_enabled"
    : body.shipping_method === "orlen_paczka" ? "orlen_paczka_enabled" : "pocztex_shipping_enabled";
  for (const key of body.payment_method === "cod" ? [flag, "cod_payment_enabled"] : [flag]) {
    let document;
    try { document = await readDocument("feature_flags", key); }
    catch { throw new CheckoutPolicyError("checkout_configuration_unavailable", 503); }
    if (fromFirestoreFields(document.fields).is_enabled !== true) {
      throw new CheckoutPolicyError("checkout_method_disabled", 400);
    }
  }
  let origin: URL;
  try { origin = new URL(process.env.CHECKOUT_RETURN_ORIGIN || process.env.FRONTEND_ORIGIN || ""); }
  catch { throw new CheckoutPolicyError("checkout_origin_not_configured", 503); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new CheckoutPolicyError("checkout_origin_not_configured", 503);
  }
  return { shippingCostGrosze: getShippingCostGrosze(body.payment_method), origin: origin.origin };
}
