import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrlenPaczkaLabel, splitStreetAddress } from "./orlen-paczka";

describe("ORLEN Paczka SOAP client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.ORLEN_PACZKA_ENV = "sandbox";
    process.env.ORLEN_PACZKA_PARTNER_ID = "PWRTR81674";
    process.env.ORLEN_PACZKA_PARTNER_KEY = "secret-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates a single sandbox shipment and decodes the returned PDF label", async () => {
    const pdf = Buffer.from("%PDF-1.4\nlabel");
    const carrierFetch = vi.fn().mockResolvedValue(new Response(`<?xml version="1.0"?><soap:Envelope><soap:Body><GenerateLabelBusinessPackResponse><GenerateLabelBusinessPackResult><Err>000</Err><PackCode_RUCH>2100123123123</PackCode_RUCH><DestinationCode>XX-142450-00-00</DestinationCode></GenerateLabelBusinessPackResult><LabelData>${pdf.toString("base64")}</LabelData></GenerateLabelBusinessPackResponse></soap:Body></soap:Envelope>`, { status: 200 }));
    globalThis.fetch = carrierFetch;

    const label = await createOrlenPaczkaLabel({
      destinationCode: "XX-142450-00-00",
      boxSize: "S",
      packValueGrosze: 5391,
      recipient: { firstName: "Jan", lastName: "Nowak", email: "jan@example.test", phone: "+48 500 000 000" },
      sender: { name: "Podróżówka Sp. z o.o.", email: "kontakt@example.test", phone: "501 002 003", street: "Krakowska 21/4", city: "Milanówek", postCode: "05-822" },
      reference: "ORD-TEST-1",
    });

    expect(carrierFetch).toHaveBeenCalledWith("https://api-test.orlenpaczka.pl/WebServicePwR/WebServicePwR.asmx", expect.objectContaining({ method: "POST" }));
    const [, request] = carrierFetch.mock.calls[0];
    expect(String(request.body)).toContain("<PartnerKey>secret-key</PartnerKey>");
    expect(String(request.body)).toContain("<DestinationCode>XX-142450-00-00</DestinationCode>");
    expect(label.trackingNumber).toBe("2100123123123");
    expect(Array.from(label.bytes)).toEqual(Array.from(pdf));
  });

  it("rejects a carrier response without a valid PDF label", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("<Err>000</Err><PackCode_RUCH>2100123123123</PackCode_RUCH><LabelData>bm90LWEtcGRm</LabelData>", { status: 200 }));
    await expect(createOrlenPaczkaLabel({
      destinationCode: "XX-142450-00-00", boxSize: "S", packValueGrosze: 1,
      recipient: { firstName: "Jan", lastName: "Nowak", email: "jan@example.test", phone: "500000000" },
      sender: { name: "Firma", email: "kontakt@example.test", phone: "501002003", street: "Krakowska 21", city: "Milanówek", postCode: "05-822" }, reference: "ORD-TEST-2",
    })).rejects.toThrow("orlen_paczka_label_invalid");
  });

  it("splits a Polish street address without losing the apartment number", () => {
    expect(splitStreetAddress("Krakowska 21 / 4")).toEqual({ streetName: "Krakowska", buildingNumber: "21", flatNumber: "4" });
  });
});
