import { describe, expect, it } from "vitest";
import buyShipment from "../../server/routes/inpost/buy-shipment";
import createShipment from "../../server/routes/inpost/create-shipment";
import shipmentLabel from "../../server/routes/inpost/label/shipment-label";

describe("InPost privileged endpoints", () => {
  it("rejects creating a shipment without a Firebase admin token", async () => {
    const response = await createShipment.fetch(new Request("https://example.test/api/inpost/create-shipment", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    }));
    expect(response.status).toBe(401);
  });

  it("rejects buying a shipment without a Firebase admin token", async () => {
    const response = await buyShipment.fetch(new Request("https://example.test/api/inpost/buy-shipment", {
      method: "POST",
      body: JSON.stringify({ shipment_id: "123" }),
      headers: { "Content-Type": "application/json" },
    }));
    expect(response.status).toBe(401);
  });

  it("rejects downloading a label without a Firebase admin token", async () => {
    const response = await shipmentLabel.fetch(new Request("https://example.test/api/inpost/label/123"));
    expect(response.status).toBe(401);
  });
});
