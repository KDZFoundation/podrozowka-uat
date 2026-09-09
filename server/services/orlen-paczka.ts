export type OrlenPaczkaParcel = {
  destinationCode: string;
  boxSize: "S" | "M" | "L";
  packValueGrosze: number;
  recipient: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    streetName?: string;
    buildingNumber?: string;
    flatNumber?: string;
    city?: string;
    postCode?: string;
  };
  sender: {
    name: string;
    email: string;
    phone: string;
    street: string;
    city: string;
    postCode: string;
  };
  reference: string;
};

export type OrlenPaczkaLabel = {
  trackingNumber: string;
  destinationCode: string;
  bytes: Uint8Array;
};

const namespace = "https://91.242.220.103/WebServicePwR";

const xml = (value: string | number | boolean | undefined | null) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const tag = (name: string, value: string | number | boolean | undefined | null) => `<${name}>${xml(value)}</${name}>`;

const tagValue = (body: string, name: string) => {
  const match = body.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1]?.trim() || "";
};

const compactPhone = (value: string) => value.replace(/[^\d]/g, "").replace(/^48(?=\d{9}$)/, "");

export const splitPersonName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "—" };
};

export const splitStreetAddress = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.*?)[,\s]+(\d+[\w-]*)(?:\s*\/\s*(\d+[\w-]*))?$/u);
  if (!match) return { streetName: normalized, buildingNumber: "" };
  return { streetName: match[1].trim(), buildingNumber: match[2], flatNumber: match[3] || "" };
};

const endpoint = () => (process.env.ORLEN_PACZKA_ENV || "sandbox").toLowerCase() === "production"
  ? "https://api.orlenpaczka.pl/WebServicePwRProd/WebServicePwR.asmx"
  : "https://api-test.orlenpaczka.pl/WebServicePwR/WebServicePwR.asmx";

const credentials = () => {
  const partnerId = (process.env.ORLEN_PACZKA_PARTNER_ID || "").trim();
  const partnerKey = (process.env.ORLEN_PACZKA_PARTNER_KEY || "").trim();
  if (!partnerId || !partnerKey) throw new Error("orlen_paczka_not_configured");
  return { partnerId, partnerKey };
};

const responseError = (payload: string) => {
  const fault = tagValue(payload, "faultstring") || tagValue(payload, "ErrDes");
  const code = tagValue(payload, "Err");
  if (fault || (code && code !== "000")) {
    const safe = (fault || code).replace(/[\r\n<>]/g, " ").slice(0, 180);
    throw new Error(`orlen_paczka_rejected:${safe || "unknown"}`);
  }
};

/**
 * Creates one ORLEN Paczka shipment and receives its label in a single SOAP
 * operation. Repeating this operation would create another shipment, so the
 * caller must persist the returned PDF before exposing a download action.
 */
export const createOrlenPaczkaLabel = async (parcel: OrlenPaczkaParcel): Promise<OrlenPaczkaLabel> => {
  const { partnerId, partnerKey } = credentials();
  const senderName = splitPersonName(parcel.sender.name);
  const senderAddress = splitStreetAddress(parcel.sender.street);
  const phone = compactPhone(parcel.recipient.phone);
  const senderPhone = compactPhone(parcel.sender.phone);
  if (!parcel.destinationCode || !phone || !senderPhone || !parcel.recipient.email || !parcel.sender.email || !senderAddress.streetName || !senderAddress.buildingNumber || !parcel.sender.city || !parcel.sender.postCode) {
    throw new Error("orlen_paczka_shipment_data_incomplete");
  }

  const requestBody = [
    tag("PartnerID", partnerId), tag("PartnerKey", partnerKey),
    tag("PhoneNumber", phone), tag("DestinationCode", parcel.destinationCode), tag("AlternativeDestinationCode", ""),
    tag("BoxSize", parcel.boxSize), tag("PackValue", Math.max(0, Math.min(999999, Math.round(parcel.packValueGrosze)))),
    tag("CashOnDelivery", "N"), tag("AmountCashOnDelivery", ""), tag("Insurance", "false"),
    tag("EMail", parcel.recipient.email), tag("FirstName", parcel.recipient.firstName), tag("LastName", parcel.recipient.lastName), tag("CompanyName", ""),
    tag("StreetName", parcel.recipient.streetName || ""), tag("BuildingNumber", parcel.recipient.buildingNumber || ""), tag("FlatNumber", parcel.recipient.flatNumber || ""), tag("City", parcel.recipient.city || ""), tag("PostCode", parcel.recipient.postCode || ""),
    tag("SenderEMail", parcel.sender.email), tag("SenderFirstName", senderName.firstName), tag("SenderLastName", senderName.lastName), tag("SenderCompanyName", parcel.sender.name),
    tag("SenderStreetName", senderAddress.streetName), tag("SenderBuildingNumber", senderAddress.buildingNumber), tag("SenderFlatNumber", senderAddress.flatNumber || ""), tag("SenderCity", parcel.sender.city), tag("SenderPostCode", parcel.sender.postCode), tag("SenderPhoneNumber", senderPhone),
    tag("SenderOrders", parcel.reference.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 30)),
    tag("ReturnDestinationCode", ""), tag("ReturnEMail", ""), tag("ReturnFirstName", ""), tag("ReturnLastName", ""), tag("ReturnCompanyName", ""), tag("ReturnStreetName", ""), tag("ReturnBuildingNumber", ""), tag("ReturnFlatNumber", ""), tag("ReturnCity", ""), tag("ReturnPostCode", ""), tag("ReturnPhoneNumber", ""), tag("ReturnPack", ""), tag("TransferDescription", ""), tag("PrintAdress", "1"), tag("ReturnAvailable", ""), tag("ReturnQuantity", ""), tag("PrintType", "1"),
  ].join("");
  const soap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GenerateLabelBusinessPack xmlns="${namespace}">${requestBody}</GenerateLabelBusinessPack></soap:Body></soap:Envelope>`;
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${namespace}/GenerateLabelBusinessPack"` },
    body: soap,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.text();
  if (!response.ok) throw new Error(`orlen_paczka_http_${response.status}`);
  responseError(payload);
  const label = tagValue(payload, "LabelData").replace(/\s/g, "");
  if (!label) throw new Error("orlen_paczka_label_missing");
  const bytes = Uint8Array.from(Buffer.from(label, "base64"));
  if (bytes.byteLength < 5 || Buffer.from(bytes.slice(0, 5)).toString("ascii") !== "%PDF-") throw new Error("orlen_paczka_label_invalid");
  const trackingNumber = tagValue(payload, "PackCode_RUCH");
  if (!trackingNumber) throw new Error("orlen_paczka_tracking_missing");
  return { trackingNumber, destinationCode: tagValue(payload, "DestinationCode") || parcel.destinationCode, bytes };
};
