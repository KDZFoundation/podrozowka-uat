import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("../../server/auth/require-admin.js", () => auth);

import createShipment from "../../server/routes/inpost/create-shipment";

describe("InPost shipment HTTP integration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INPOST_SHIPX_ENV = "sandbox";
    process.env.INPOST_SHIPX_ORGANIZATION_ID = "organization-123";
    process.env.INPOST_SHIPX_TOKEN = "shipx-token";
    auth.requireAdmin.mockResolvedValue(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a sanitized locker shipment to the sandbox ShipX API only after admin authorization", async () => {
    const shipxFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "shipment-123",
      status: "confirmed",
      tracking_number: "INPOST123",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    globalThis.fetch = shipxFetch;

    const response = await createShipment.fetch(new Request("https://example.test/api/inpost/create-shipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer verified-admin-token" },
      body: JSON.stringify({
        receiver_point: "KRA010",
        order_number: "ORD-TEST-1",
        customer_email: "customer@example.test",
        customer_phone: "+48 500 000 000",
        size: "medium",
      }),
    }));

    expect(auth.requireAdmin).toHaveBeenCalledOnce();
    expect(shipxFetch).toHaveBeenCalledWith(
      "https://sandbox-api-shipx-pl.easypack24.net/v1/organizations/organization-123/shipments",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer shipx-token" }) }),
    );
    const [, request] = shipxFetch.mock.calls[0];
    expect(JSON.parse(String(request.body))).toMatchObject({
      service: "inpost_locker_standard",
      parcels: { template: "medium" },
      custom_attributes: { target_point: "KRA010" },
      reference: "ORD-TEST-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      shipment: expect.objectContaining({ inpost_shipment_id: "shipment-123", tracking_number: "INPOST123" }),
    }));
  });

  it("does not call ShipX when the server-side admin guard rejects the request", async () => {
    auth.requireAdmin.mockResolvedValue(new Response(JSON.stringify({ error: "admin_access_required" }), { status: 403 }));
    const shipxFetch = vi.fn();
    globalThis.fetch = shipxFetch;

    const response = await createShipment.fetch(new Request("https://example.test/api/inpost/create-shipment", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(403);
    expect(shipxFetch).not.toHaveBeenCalled();
  });
});
