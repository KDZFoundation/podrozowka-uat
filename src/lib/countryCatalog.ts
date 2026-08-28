type CountryLike = {
  id: string;
  iso2?: string;
  name_pl?: string;
  name?: string;
};

export const normalizeCountryCode = (value?: string) => value?.trim().toUpperCase() || "";

/**
 * Starsze migracje mogły utworzyć dokument kraju z losowym ID, a import
 * słownika używa kodu ISO jako ID. W UI kraj jest jedną pozycją katalogową.
 */
export const uniqueCountriesByIso = <T extends CountryLike>(countries: T[]): T[] => {
  const unique = new Map<string, T>();

  for (const country of countries) {
    const key = normalizeCountryCode(country.iso2 || country.id);
    const current = unique.get(key);
    const isCanonical = country.id === key;
    const currentIsCanonical = current?.id === key;

    if (!current || (isCanonical && !currentIsCanonical)) {
      unique.set(key, country);
    }
  }

  return [...unique.values()];
};

export const sortCountriesByName = <T extends CountryLike>(countries: T[]): T[] =>
  [...countries].sort((left, right) =>
    (left.name_pl || left.name || "").localeCompare(right.name_pl || right.name || "", "pl", { sensitivity: "base" }),
  );
