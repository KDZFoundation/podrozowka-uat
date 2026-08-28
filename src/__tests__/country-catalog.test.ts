import { describe, expect, it } from "vitest";
import { sortCountriesByName, uniqueCountriesByIso } from "@/lib/countryCatalog";

describe("katalog krajów", () => {
  it("pokazuje jeden kraj dla powielonego kodu i preferuje dokument o ID ISO", () => {
    const countries = uniqueCountriesByIso([
      { id: "legacy-poland", iso2: "pl", name_pl: "Polska" },
      { id: "PL", iso2: "PL", name_pl: "Polska" },
      { id: "DE", iso2: "DE", name_pl: "Niemcy" },
    ]);

    expect(countries).toEqual([
      expect.objectContaining({ id: "PL", iso2: "PL" }),
      expect.objectContaining({ id: "DE", iso2: "DE" }),
    ]);
  });

  it("sortuje kraje po polskiej nazwie", () => {
    expect(sortCountriesByName([
      { id: "PL", name_pl: "Polska" },
      { id: "DE", name_pl: "Niemcy" },
      { id: "AL", name_pl: "Albania" },
    ]).map((country) => country.name_pl)).toEqual(["Albania", "Niemcy", "Polska"]);
  });
});
