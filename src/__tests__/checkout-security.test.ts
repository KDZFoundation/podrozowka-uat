import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  readDocument: vi.fn(), writeDocument: vi.fn(), updateDocument: vi.fn(), queryDocuments: vi.fn(),
  token: vi.fn(), reserve: vi.fn(), release: vi.fn(),
}));
vi.mock("../../api/_lib/gcp-firestore.js", () => ({ ...mocks, fromFirestoreFields: (fields: unknown) => fields }));
vi.mock("../../server/auth/require-admin.js", () => ({ verifyFirebaseIdToken: mocks.token }));
vi.mock("../../api/_lib/design-reservation.js", () => ({
  releaseExpiredReservations: mocks.release, reserveDesignAvailability: mocks.reserve, updateReservationStatus: vi.fn(),
}));
import handler from "../../server/routes/payments/create-hotpay";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "../lib/podImposition";

const body = {
  items: [{ card_design_id: "design", quantity: 8, primary_language_code: "pl" }],
  payment_method: "cod", shipping_method: "inpost_locker",
  pickup_point: { code: "WAW01", name: "Punkt", city: "Warszawa", address: "Testowa 1" },
};
const request = (patch = {}, authorized = true) => new Request("https://untrusted.test/api/payments/create-hotpay", {
  method: "POST", headers: authorized ? { Authorization: "Bearer valid" } : {},
  body: JSON.stringify({ ...body, ...patch }),
});
describe("checkout trust boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SALES_ENABLED", "true");
    vi.stubEnv("VITE_COMING_SOON", "false");
    vi.stubEnv("CHECKOUT_RETURN_ORIGIN", "https://shop.example.test");
    mocks.token.mockResolvedValue({ sub: "verified-user", email: "verified@example.test" });
    mocks.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "feature_flags") return { fields: { is_enabled: true } };
      if (collection === "card_designs") return { fields: { active: true, country_id: "pl", price_grosze: 499,
        print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id } };
      throw new Error("not_found");
    });
    mocks.queryDocuments.mockResolvedValue([{ data: { language_code: "pl" } }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "false"])("blocks sales before reads or writes when SALES_ENABLED=%s", async value => {
    vi.stubEnv("SALES_ENABLED", value);
    expect((await handler.fetch(request())).status).toBe(503);
    expect(mocks.readDocument).not.toHaveBeenCalled();
    expect(mocks.writeDocument).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("keeps the coming-soon backend closed even if sales is enabled", async () => {
    vi.stubEnv("VITE_COMING_SOON", "true");
    expect((await handler.fetch(request())).status).toBe(503);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("requires a verified customer token", async () => {
    expect((await handler.fetch(request({}, false))).status).toBe(401);
    mocks.token.mockResolvedValue(null);
    expect((await handler.fetch(request())).status).toBe(401);
    expect(mocks.readDocument).not.toHaveBeenCalled();
  });
  it("ignores forged identity, shipping price, status and return origin", async () => {
    expect((await handler.fetch(request({ user_id: "victim", customer_email: "attacker@example.test",
      shipping_cost_grosze: 0, origin_url: "https://evil.test", payment_status: "paid" }))).status).toBe(200);
    expect(mocks.writeDocument).toHaveBeenCalledWith("orders", expect.any(String), expect.objectContaining({
      user_id: "verified-user", customer_email: "verified@example.test", shipping_cost_grosze: 1699,
      total_amount_grosze: 5691, payment_status: "pending", return_url: expect.stringMatching(/^https:\/\/shop\.example\.test\/checkout\//),
    }));
  });
  it("rejects disabled shipping and COD before stock reservations", async () => {
    mocks.readDocument.mockResolvedValue({ fields: { is_enabled: false } });
    expect((await handler.fetch(request())).status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.writeDocument).not.toHaveBeenCalled();
  });
  it("accepts ORLEN recipient without a courier street address", async () => {
    expect((await handler.fetch(request({ shipping_method: "orlen_paczka",
      shipping_address: { name: "Jan Testowy", phone: "500600700", street: "", postal_code: "", city: "" },
    }))).status).toBe(200);
  });
  it("requires COD to be enabled even when its carrier is enabled", async () => {
    mocks.readDocument.mockImplementation(async (_collection: string, key: string) => ({ fields: { is_enabled: key !== "cod_payment_enabled" } }));
    expect((await handler.fetch(request())).status).toBe(400);
    expect(mocks.writeDocument).not.toHaveBeenCalled();
  });
  it("does not reserve stock or write orders when online payment is unconfigured", async () => {
    vi.stubEnv("HOTPAY_SECRET", "");
    vi.stubEnv("HOTPAY_NOTIFICATION_PASSWORD", "");
    expect((await handler.fetch(request({ payment_method: "online" }))).status).toBe(503);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.writeDocument).not.toHaveBeenCalled();
  });
  it("requires a complete address for courier delivery", async () => {
    expect((await handler.fetch(request({ shipping_method: "inpost_courier",
      shipping_address: { name: "Jan Testowy", phone: "500600700" },
    }))).status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it.each([{ shipping_method: "unknown" }, { payment_method: "free" }, { pickup_point: null },
    { items: [{ card_design_id: "design", quantity: 8.5 }] }, { items: [{ card_design_id: "design", quantity: -8 }] }])(
    "rejects malformed checkout %j", async patch => {
      expect((await handler.fetch(request(patch))).status).toBe(400);
      expect(mocks.readDocument).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
    });
});
