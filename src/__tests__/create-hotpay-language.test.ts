import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  fromFirestoreFields: vi.fn(),
  queryDocuments: vi.fn(),
  readDocument: vi.fn(),
  writeDocument: vi.fn(),
}));
const reservations = vi.hoisted(() => ({
  releaseExpiredReservations: vi.fn(),
  reserveDesignAvailability: vi.fn(),
  updateReservationStatus: vi.fn(),
}));

vi.mock("../../api/_lib/gcp-firestore.js", () => firestore);
vi.mock("../../api/_lib/design-reservation.js", () => reservations);

import createHotpay from "../../server/routes/payments/create-hotpay";

const requestFor = (item: Record<string, unknown>) => new Request("https://example.test/api/payments/create-hotpay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    items: [{ card_design_id: "design-es", quantity: 10, ...item }],
    payment_method: "cod",
  }),
});

describe("HotPay checkout language validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.readDocument.mockResolvedValue({ fields: {
      active: true,
      country_id: "country-es",
      language_code: "es",
      price_grosze: 499,
    } });
    firestore.fromFirestoreFields.mockImplementation((fields) => fields);
    firestore.queryDocuments.mockResolvedValue([
      { data: { language_code: "es" } },
      { data: { language_code: "ca" } },
    ]);
    firestore.writeDocument.mockResolvedValue({});
    reservations.releaseExpiredReservations.mockResolvedValue(undefined);
    reservations.reserveDesignAvailability.mockResolvedValue(null);
    reservations.updateReservationStatus.mockResolvedValue(undefined);
  });

  it("stores the traveler-selected language instead of the design default", async () => {
    const response = await createHotpay.fetch(requestFor({ primary_language_code: "CA", secondary_language_code: "es" }));

    expect(response.status).toBe(200);
    expect(firestore.writeDocument).toHaveBeenCalledWith("orders", expect.any(String), expect.objectContaining({
      items: [expect.objectContaining({
        language_code: "ca",
        primary_language_code: "ca",
        secondary_language_code: "es",
      })],
    }));
  });

  it("rejects a checkout item with no selected primary language", async () => {
    const response = await createHotpay.fetch(requestFor({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "missing_primary_language" });
    expect(firestore.writeDocument).not.toHaveBeenCalled();
  });
});
