import { describe, expect, it } from "vitest";
import { podLanguageTemplateKey } from "@/lib/generatePodPrintPdf";

describe("POD print language template key", () => {
  it("normalizes language-code case and whitespace", () => {
    expect(podLanguageTemplateKey("country-1", " PL ")).toBe("country-1:pl");
    expect(podLanguageTemplateKey("country-1", "en-US")).toBe("country-1:en-us");
  });
});
