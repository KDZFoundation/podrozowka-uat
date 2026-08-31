import { describe, expect, it } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "./podImposition";
import { getPodPrintFormat, hashPodPrintFormat, POD_PRINT_FORMATS, resolveRegisteredPodPrintFormat } from "./podPrintFormats";

describe("POD print format registry", () => {
  it("returns only reviewed server formats and rejects unknown identifiers", async () => {
    expect(POD_PRINT_FORMATS.map((format) => format.print_format_id)).toEqual([CURRENT_POSTCARD_PRINT_FORMAT.print_format_id]);
    expect(getPodPrintFormat(CURRENT_POSTCARD_PRINT_FORMAT.print_format_id)).toEqual(CURRENT_POSTCARD_PRINT_FORMAT);
    expect(await hashPodPrintFormat(getPodPrintFormat(CURRENT_POSTCARD_PRINT_FORMAT.print_format_id))).toMatch(/^[0-9a-f]{64}$/);
    expect(() => getPodPrintFormat("client-controlled-format")).toThrow("unknown_print_format_id:client-controlled-format");
  });

  it("requires an explicit reviewed format before creating new production units", () => {
    expect(resolveRegisteredPodPrintFormat(CURRENT_POSTCARD_PRINT_FORMAT.print_format_id)).toEqual(CURRENT_POSTCARD_PRINT_FORMAT);
    expect(() => resolveRegisteredPodPrintFormat(null)).toThrow("print_format_id_required");
    expect(() => resolveRegisteredPodPrintFormat("unknown-format")).toThrow("unknown_print_format_id:unknown-format");
  });
});
