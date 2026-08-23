export const SHIPPING_COST_GROSZE = 1399;
export const COD_SHIPPING_COST_GROSZE = 1699;

export type PaymentMethod = "online" | "cod";
export type ShippingMethod =
  | "inpost_locker"
  | "inpost_courier"
  | "orlen_paczka"
  | "pocztex_courier"
  | "pocztex_point";

export type PickupProvider = "inpost" | "orlen" | "pocztex";

export const pickupProviderForMethod = (method: ShippingMethod): PickupProvider | null => ({
  inpost_locker: "inpost" as const,
  orlen_paczka: "orlen" as const,
  pocztex_point: "pocztex" as const,
  inpost_courier: null,
  pocztex_courier: null,
})[method];

export const isPickupShippingMethod = (method: ShippingMethod) => pickupProviderForMethod(method) !== null;
export const isCourierShippingMethod = (method: ShippingMethod) => !isPickupShippingMethod(method);

export const shippingMethodLabel = (method: ShippingMethod | string) => ({
  inpost_locker: "InPost Paczkomat 24/7",
  inpost_courier: "InPost Kurier",
  orlen_paczka: "ORLEN Paczka",
  pocztex_courier: "Pocztex Kurier",
  pocztex_point: "Pocztex Punkt",
  // Labels for historical orders.
  inpost: "InPost Paczkomat 24/7",
  courier: "Kurier",
  orlen: "ORLEN Paczka",
  pocztex: "Pocztex Punkt",
}[method] ?? method);

export const getShippingCostGrosze = (method: PaymentMethod): number =>
  method === "cod" ? COD_SHIPPING_COST_GROSZE : SHIPPING_COST_GROSZE;

export interface CourierAddress {
  name: string;
  street: string;
  postal_code: string;
  city: string;
  phone: string;
}

export const emptyCourierAddress = (): CourierAddress => ({
  name: "",
  street: "",
  postal_code: "",
  city: "",
  phone: "",
});

const POSTAL_CODE_RE = /^[0-9]{2}-[0-9]{3}$/;
const PHONE_RE = /^[+0-9]{9,15}$/;

export const validateCourierAddress = (
  addr: CourierAddress,
): Partial<Record<keyof CourierAddress, string>> => {
  const e: Partial<Record<keyof CourierAddress, string>> = {};
  if (addr.name.trim().length === 0) e.name = "Podaj imię i nazwisko odbiorcy.";
  else if (addr.name.length > 200) e.name = "Maksymalnie 200 znaków.";
  if (addr.street.trim().length === 0) e.street = "Podaj ulicę i numer.";
  else if (addr.street.length > 300) e.street = "Maksymalnie 300 znaków.";
  if (addr.postal_code.trim().length === 0) e.postal_code = "Podaj kod pocztowy.";
  else if (!POSTAL_CODE_RE.test(addr.postal_code.trim())) e.postal_code = "Format: 00-000.";
  if (addr.city.trim().length === 0) e.city = "Podaj miejscowość.";
  else if (addr.city.length > 100) e.city = "Maksymalnie 100 znaków.";
  const phoneClean = addr.phone.replace(/[^0-9+]/g, "");
  if (phoneClean.length === 0) e.phone = "Podaj numer telefonu.";
  else if (!PHONE_RE.test(phoneClean)) e.phone = "Nieprawidłowy numer telefonu.";
  return e;
};

export const isCourierAddressValid = (addr: CourierAddress) =>
  Object.keys(validateCourierAddress(addr)).length === 0;

export interface ThankYouPhrase {
  lang: string;
  phrase: string;
  pronunciation: string;
}

export interface GreetingsPhrase {
  lang: string;
  phrase: string;
  pronunciation: string;
}

export const thankYouPhrases: ThankYouPhrase[] = [
  { lang: "Chiński", phrase: "谢谢", pronunciation: "Xièxiè" },
  { lang: "Japoński", phrase: "ありがとう", pronunciation: "Arigatō" },
  { lang: "Koreański", phrase: "감사합니다", pronunciation: "Gamsahamnida" },
  { lang: "Tajski", phrase: "ขอบคุณ", pronunciation: "Khob khun" },
  { lang: "Arabski", phrase: "شكراً", pronunciation: "Shukran" },
  { lang: "Hindi", phrase: "धन्यवाद", pronunciation: "Dhanyavaad" },
  { lang: "Rosyjski", phrase: "Спасибо", pronunciation: "Spasibo" },
  { lang: "Niemiecki", phrase: "Danke", pronunciation: "Danke" },
  { lang: "Francuski", phrase: "Merci", pronunciation: "Mersi" },
  { lang: "Hiszpański", phrase: "Gracias", pronunciation: "Grasias" },
  { lang: "Włoski", phrase: "Grazie", pronunciation: "Gracie" },
  { lang: "Portugalski", phrase: "Obrigado", pronunciation: "Obrigadu" },
  { lang: "Holenderski", phrase: "Dank u", pronunciation: "Dank ü" },
  { lang: "Szwedzki", phrase: "Tack", pronunciation: "Tak" },
  { lang: "Norweski", phrase: "Takk", pronunciation: "Tak" },
  { lang: "Angielski", phrase: "Thank you", pronunciation: "Thank you" },
];

export const greetingsPhrases: GreetingsPhrase[] = [
  { lang: "Chiński", phrase: "来自波兰的问候", pronunciation: "Láizì bōlán de wènhòu" },
  { lang: "Japoński", phrase: "ポーランドからのご挨拶", pronunciation: "Pōrando kara no go-aisatsu" },
  { lang: "Koreański", phrase: "폴란드에서 인사드립니다", pronunciation: "Pollandeu-eseo insadeurimnida" },
  { lang: "Niemiecki", phrase: "Grüße aus Polen", pronunciation: "Grüsse aus Polen" },
  { lang: "Francuski", phrase: "Salutations de Pologne", pronunciation: "Salütasion de Poloñ" },
  { lang: "Hiszpański", phrase: "Saludos desde Polonia", pronunciation: "Saludos desde Polonia" },
];
