import { describe, expect, it } from "vitest";
import { WORLD_LANGUAGES } from "@/data/languages";
import { WORLD_COUNTRIES } from "@/data/worldCountries";

describe("katalog języków i krajów", () => {
  it("zawiera unikalne kody języków oraz wpis Tamazight w alfabecie tifinagh", () => {
    const codes = WORLD_LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);

    for (const code of ["sr", "km", "lb", "lo", "bs", "uk", "az", "ru", "mk", "he", "am", "om", "kk", "ko", "uz"]) {
      expect(codes).toContain(code);
    }

    const tamazight = WORLD_LANGUAGES.find((language) => language.code === "tzm");
    expect(tamazight?.name_native).toContain("ⵜ");
    expect(`${tamazight?.default_front_thank_you} ${tamazight?.default_back_qr_label}`).toMatch(/[ⴰ-ⵯ]/u);
  });

  it("zawiera osobne pozycje dla Szkocji i Walii", () => {
    expect(WORLD_COUNTRIES).toEqual(expect.arrayContaining([
      expect.objectContaining({ iso2: "GB-SCT", name_pl: "Szkocja" }),
      expect.objectContaining({ iso2: "GB-WLS", name_pl: "Walia" }),
    ]));
  });
});
