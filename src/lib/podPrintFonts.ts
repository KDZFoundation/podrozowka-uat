import { POD_FONT_REGISTRY } from "./podFontRegistry.generated";
import type { PodPrintManifest, PodPrintRenderInput } from "./podPrintManifest";

export type PodFontRegistryEntry = (typeof POD_FONT_REGISTRY)[number];
export type PodFontCollection = PodFontRegistryEntry["collection"];

const BRAND_TEXT = "PODRÓŻÓWKA ODWRÓCONA POCZTÓWKA fot. by @";
const COLLECTION_ORDER: readonly PodFontCollection[] = [
  "body",
  "arabic",
  "armenian",
  "hebrew",
  "khmer",
  "lao",
  "ethiopic",
  "thai",
  "georgian",
  "tifinagh",
  "japanese",
  "korean",
  "cantonese",
  "simplified-chinese",
  "traditional-chinese",
];

type CodePointRange = readonly [number, number];
const parsedRanges = new Map<string, CodePointRange[]>();

const parseUnicodeRange = (value: string): CodePointRange[] => {
  const cached = parsedRanges.get(value);
  if (cached) return cached;
  const ranges = value.split(",").map((raw) => {
    const token = raw.trim().replace(/^U\+/i, "").toLowerCase();
    if (token.includes("?")) {
      return [Number.parseInt(token.replaceAll("?", "0"), 16), Number.parseInt(token.replaceAll("?", "f"), 16)] as const;
    }
    const [start, end = start] = token.split("-");
    return [Number.parseInt(start, 16), Number.parseInt(end, 16)] as const;
  });
  parsedRanges.set(value, ranges);
  return ranges;
};

const covers = (entry: PodFontRegistryEntry, codePoint: number) => (
  parseUnicodeRange(entry.unicode_range).some(([start, end]) => codePoint >= start && codePoint <= end)
);

const codePoints = (value: string) => [...value].map((character) => character.codePointAt(0)!).filter((value, index, all) => (
  value >= 0x20 && value !== 0x7f && all.indexOf(value) === index
));

const normalizeLanguage = (value: string | null) => value?.trim().toLowerCase().replaceAll("_", "-") || "";

const cjkCollectionForLanguage = (language: string): PodFontCollection | null => {
  if (language === "ja" || language.startsWith("ja-")) return "japanese";
  if (language === "ko" || language.startsWith("ko-")) return "korean";
  if (language === "yue" || language.startsWith("yue-") || language === "zh-hk" || language.startsWith("zh-yue")) return "cantonese";
  if (language === "zh-tw" || language === "zh-hant" || language.startsWith("zh-hant-")) return "traditional-chinese";
  if (language === "zh" || language === "zh-cn" || language === "zh-sg" || language === "zh-hans" || language.startsWith("zh-hans-")) return "simplified-chinese";
  return null;
};

export interface PodPrintFontContext {
  primary_language_code: string | null;
  secondary_language_code: string | null;
  render_input: PodPrintRenderInput;
}

const cjkCollectionForItem = (item: PodPrintFontContext): PodFontCollection | null => {
  const collections = [item.primary_language_code, item.secondary_language_code]
    .map(normalizeLanguage)
    .map(cjkCollectionForLanguage)
    .filter((value): value is PodFontCollection => Boolean(value));
  const unique = [...new Set(collections)];
  if (unique.length > 1) throw new Error(`pod_font_ambiguous_cjk_languages:${unique.join(",")}`);
  return unique[0] || null;
};

const collectionForCharacter = (character: string, cjk: PodFontCollection | null): PodFontCollection => {
  if (/\p{Script=Arabic}/u.test(character)) return "arabic";
  if (/\p{Script=Armenian}/u.test(character)) return "armenian";
  if (/\p{Script=Hebrew}/u.test(character)) return "hebrew";
  if (/\p{Script=Khmer}/u.test(character)) return "khmer";
  if (/\p{Script=Lao}/u.test(character)) return "lao";
  if (/\p{Script=Ethiopic}/u.test(character)) return "ethiopic";
  if (/\p{Script=Thai}/u.test(character)) return "thai";
  if (/\p{Script=Georgian}/u.test(character)) return "georgian";
  if (/\p{Script=Tifinagh}/u.test(character)) return "tifinagh";
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) return "japanese";
  if (/\p{Script=Hangul}/u.test(character)) return "korean";
  if (/\p{Script=Han}/u.test(character)) {
    if (!cjk) throw new Error(`pod_font_cjk_language_required:U+${character.codePointAt(0)!.toString(16).toUpperCase()}`);
    return cjk;
  }
  return "body";
};

const itemText = (item: PodPrintFontContext) => [
  BRAND_TEXT,
  item.render_input.front_text || "",
  item.render_input.back_qr_label || "",
  item.render_input.photo_author || "",
].join(" ");

const collectionsAndCodePointsForItem = (item: PodPrintFontContext) => {
  const cjk = cjkCollectionForItem(item);
  const grouped = new Map<PodFontCollection, Set<number>>();
  for (const character of itemText(item)) {
    const point = character.codePointAt(0)!;
    if (point < 0x20 || point === 0x7f) continue;
    const collection = collectionForCharacter(character, cjk);
    const values = grouped.get(collection) || new Set<number>();
    values.add(point);
    grouped.set(collection, values);
  }
  return grouped;
};

const selectCollectionEntries = (collection: PodFontCollection, points: Iterable<number>, required: boolean) => {
  const entries = POD_FONT_REGISTRY.filter((entry) => entry.collection === collection);
  const selected = new Map<string, PodFontRegistryEntry>();
  for (const point of points) {
    const matches = entries.filter((entry) => covers(entry, point));
    if (!matches.length && required) throw new Error(`pod_font_glyph_unavailable:${collection}:U+${point.toString(16).toUpperCase()}`);
    matches.forEach((entry) => selected.set(entry.key, entry));
  }
  return [...selected.values()];
};

export const selectPodPrintFontAssets = (manifest: PodPrintManifest): PodFontRegistryEntry[] => {
  const grouped = new Map<PodFontCollection, Set<number>>();
  const authorPoints = new Set<number>();
  for (const item of manifest.format_groups.flatMap((group) => group.items)) {
    for (const [collection, points] of collectionsAndCodePointsForItem(item)) {
      const target = grouped.get(collection) || new Set<number>();
      points.forEach((point) => target.add(point));
      grouped.set(collection, target);
    }
    codePoints(`fot. by @${item.render_input.photo_author || ""}`).forEach((point) => authorPoints.add(point));
  }
  const selected = new Map<string, PodFontRegistryEntry>();
  for (const collection of COLLECTION_ORDER) {
    const points = grouped.get(collection);
    if (!points) continue;
    selectCollectionEntries(collection, points, true).forEach((entry) => selected.set(entry.key, entry));
  }
  selectCollectionEntries("handwriting", authorPoints, false).forEach((entry) => selected.set(entry.key, entry));
  return [...selected.values()].sort((left, right) => left.key.localeCompare(right.key));
};

export const podPrintFontFamiliesForItem = (item: PodPrintFontContext) => {
  const grouped = collectionsAndCodePointsForItem(item);
  const families = COLLECTION_ORDER
    .filter((collection) => grouped.has(collection))
    .map((collection) => POD_FONT_REGISTRY.find((entry) => entry.collection === collection)?.family)
    .filter(Boolean) as string[];
  const body = families.map((family) => `"${family}"`).join(", ");
  const handwriting = [`"PodPatrickHandV2"`, ...families.map((family) => `"${family}"`)].join(", ");
  return { body, handwriting };
};
