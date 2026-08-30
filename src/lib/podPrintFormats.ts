import { CURRENT_POSTCARD_PRINT_FORMAT, planPodImposition, type PodPrintFormatConfig } from "./podImposition";
import { canonicalJson, sha256Utf8 } from "./podPrintManifest";

export const POD_PRINT_FORMAT_REGISTRY_VERSION = "pod-print-formats-v1" as const;

// Only formats already defined in the repository belong here. Adding geometry
// requires a reviewed registry version and a physical proof, not client input.
export const POD_PRINT_FORMATS: readonly PodPrintFormatConfig[] = [CURRENT_POSTCARD_PRINT_FORMAT];

const registry = new Map(POD_PRINT_FORMATS.map((format) => [format.print_format_id, format]));

export const getPodPrintFormat = (printFormatId: string): PodPrintFormatConfig => {
  const format = registry.get(printFormatId);
  if (!format) throw new Error(`unknown_print_format_id:${printFormatId}`);
  planPodImposition([], [format]);
  return structuredClone(format);
};

export const hashPodPrintFormat = (format: PodPrintFormatConfig) => sha256Utf8(canonicalJson(format));

export const resolveRegisteredPodPrintFormat = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) throw new Error("print_format_id_required");
  return getPodPrintFormat(value.trim());
};
