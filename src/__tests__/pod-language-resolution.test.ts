import { describe, expect, it } from "vitest";
import { resolvePodLanguages } from "../../api/_lib/pod-order";

describe("POD language resolution", () => {
  const templates = [
    { language_code: "es", is_primary: true },
    { language_code: "ca", is_primary: false },
  ];

  it("preserves the traveler-selected primary and secondary languages", () => {
    expect(resolvePodLanguages(
      { primary_language_code: "CA", secondary_language_code: "es" },
      { language_code: "es" },
      templates,
    )).toEqual({ primaryLanguageCode: "ca", secondaryLanguageCode: "es" });
  });

  it("uses a valid design language instead of an unconditional Polish fallback", () => {
    expect(resolvePodLanguages(
      {},
      { language_code: "ES" },
      templates,
    )).toEqual({ primaryLanguageCode: "es", secondaryLanguageCode: null });
  });

  it("stops POD generation when the country has no language template", () => {
    expect(() => resolvePodLanguages({}, { language_code: "ja" }, [])).toThrow("missing_language_template_for_design");
  });
});
