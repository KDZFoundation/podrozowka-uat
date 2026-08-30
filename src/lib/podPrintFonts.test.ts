import { describe, expect, it } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "./podImposition";
import { buildPodPrintManifest, type PodPrintManifestSourceItem, type PodPrintRenderInput } from "./podPrintManifest";
import { podPrintFontFamiliesForItem, selectPodPrintFontAssets } from "./podPrintFonts";
import { POD_FONT_REGISTRY } from "./podFontRegistry.generated";

const renderInput = (frontText: string): PodPrintRenderInput => ({
  qr_url: "https://pod.example.test/r/token",
  front_text: frontText,
  back_qr_label: "Zeskanuj kod QR",
  image_front_url: "https://pod.example.test/photo.webp",
  image_version: "v1",
  photo_author: "Jan Kowalski",
  crop_settings: null,
  country_iso2: "PL",
  country_flag_url: null,
});

const source = (
  id: string,
  text: string,
  primaryLanguageCode: string | null,
  secondaryLanguageCode: string | null = null,
): PodPrintManifestSourceItem => ({
  id,
  print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
  format_source: "inventory_unit",
  batch_order_index: 0,
  sequence_index: Number(id.replace(/\D/g, "")) || 0,
  pod_job_id: "job-1",
  inventory_unit_id: `unit-${id}`,
  card_design_id: "design-1",
  source_order_id: "order-1",
  primary_language_code: primaryLanguageCode,
  secondary_language_code: secondaryLanguageCode,
  render_input: renderInput(text),
  render_input_sha256: "a".repeat(64),
});

const manifest = (...items: PodPrintManifestSourceItem[]) => buildPodPrintManifest(items, [CURRENT_POSTCARD_PRINT_FORMAT]);
const collections = (...items: PodPrintManifestSourceItem[]) => new Set(selectPodPrintFontAssets(manifest(...items)).map((font) => font.collection));

describe("deterministic POD font selection", () => {
  it("pins every registry entry to Fontsource 5.3.0 and an exact SHA-256", () => {
    expect(POD_FONT_REGISTRY).toHaveLength(609);
    expect(new Set(POD_FONT_REGISTRY.map((font) => font.key)).size).toBe(POD_FONT_REGISTRY.length);
    for (const font of POD_FONT_REGISTRY) {
      expect(font.source_url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource(?:-variable)?\//);
      expect(font.source_url).toContain("@5.3.0/files/");
      expect(font.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(font.unicode_range).toMatch(/^U\+/i);
    }
  });

  it("uses the base family for Latin, Greek and Cyrillic and preserves handwriting", () => {
    const selected = collections(source("1", "Dziękuję / Ευχαριστώ / Дякую", "pl"));
    expect(selected).toContain("body");
    expect(selected).toContain("handwriting");
    expect(selected).not.toContain("japanese");
  });

  it.each([
    ["ar", "مرحبا", "arabic"],
    ["hy", "Բարեւ", "armenian"],
    ["he", "שלום", "hebrew"],
    ["km", "សួស្តី", "khmer"],
    ["lo", "ສະບາຍດີ", "lao"],
    ["am", "ሰላም", "ethiopic"],
    ["th", "สวัสดี", "thai"],
    ["ka", "გამარჯობა", "georgian"],
    ["tzm", "ⵜⴰⵎⴰⵣⵉⵖⵜ", "tifinagh"],
  ])("selects %s coverage from pinned subsets", (language, text, expectedCollection) => {
    expect(collections(source("1", text, language))).toContain(expectedCollection);
  });

  it.each([
    ["ja", "ありがとう", "japanese"],
    ["ko", "안녕하세요", "korean"],
    ["yue", "多謝", "cantonese"],
    ["zh-hant", "多謝", "traditional-chinese"],
    ["zh", "谢谢", "simplified-chinese"],
  ])("binds Han variants to the selected language %s", (language, text, expectedCollection) => {
    const selected = collections(source("1", text, language));
    expect(selected).toContain(expectedCollection);
    expect([...selected].filter((value) => ["japanese", "korean", "cantonese", "traditional-chinese", "simplified-chinese"].includes(value))).toEqual([expectedCollection]);
  });

  it("rejects Han text without an unambiguous language", () => {
    expect(() => collections(source("1", "多謝", null))).toThrow("pod_font_cjk_language_required");
    expect(() => collections(source("1", "多謝", "ja", "yue"))).toThrow("pod_font_ambiguous_cjk_languages");
  });

  it("returns a stable registry selection regardless of manifest input order", () => {
    const left = manifest(source("1", "مرحبا", "ar"), { ...source("2", "ありがとう", "ja"), batch_order_index: 1 });
    const right = manifest({ ...source("2", "ありがとう", "ja"), batch_order_index: 1 }, source("1", "مرحبا", "ar"));
    expect(selectPodPrintFontAssets(left).map((font) => font.key)).toEqual(selectPodPrintFontAssets(right).map((font) => font.key));
  });

  it("returns an explicit family chain for the renderer", () => {
    const item = manifest(source("1", "مرحبا", "ar")).format_groups[0].items[0];
    expect(podPrintFontFamiliesForItem(item)).toEqual({
      body: '"PodNotoSansV2", "PodNotoSansArabicV2"',
      handwriting: '"PodPatrickHandV2", "PodNotoSansV2", "PodNotoSansArabicV2"',
    });
  });
});
