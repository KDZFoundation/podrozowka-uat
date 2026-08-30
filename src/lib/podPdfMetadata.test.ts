import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { applyDeterministicPodPdfMetadata, deterministicPdfFileId, podPdfBytes, POD_PDF_CREATION_DATE, POD_PDF_RENDERER_VERSION } from "./podPdfMetadata";
import { sha256Bytes } from "./podPrintArtifact";

const manifestSha256 = "0123456789abcdef".repeat(4);

const renderControlledPdf = () => {
  const pdf = new jsPDF({ compress: true, putOnlyUsedFonts: true });
  applyDeterministicPodPdfMetadata(pdf, { manifestSha256, documentNumber: "POD-TEST-1" });
  pdf.text("controlled POD test", 20, 20);
  return podPdfBytes(pdf);
};

describe("deterministic POD PDF metadata", () => {
  it("derives a stable jsPDF file ID from the frozen manifest hash", () => {
    expect(deterministicPdfFileId(manifestSha256)).toBe("0123456789ABCDEF0123456789ABCDEF");
    expect(POD_PDF_CREATION_DATE).toBe("D:20000101000000+00'00'");
    expect(POD_PDF_RENDERER_VERSION).toBe("pod-browser-jspdf-html2canvas-v2-multiscript");
  });

  it("produces identical bytes and SHA-256 in one controlled environment", async () => {
    const first = renderControlledPdf();
    const second = renderControlledPdf();
    expect(first).toEqual(second);
    expect(await sha256Bytes(first)).toBe(await sha256Bytes(second));
  });

  it("does not include the current time and includes fixed properties", () => {
    const content = new TextDecoder("latin1").decode(renderControlledPdf());
    expect(content).toContain("D:20000101000000");
    expect(content).toContain("pod-browser-jspdf-html2canvas-v2-multiscript");
    expect(content).toContain("manifest-sha256:0123456789abcdef");
    expect(content).not.toContain(String(new Date().getUTCFullYear()));
  });
});
