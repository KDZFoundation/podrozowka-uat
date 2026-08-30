import type { jsPDF } from "jspdf";

export const POD_PDF_RENDERER_VERSION = "pod-browser-jspdf-html2canvas-v2-multiscript";
export const POD_PDF_CREATION_DATE = "D:20000101000000+00'00'";

type JsPdfWithStringCreationDate = jsPDF & { setCreationDate(date: string): jsPDF };

export const deterministicPdfFileId = (manifestSha256: string) => {
  if (!/^[0-9a-f]{64}$/i.test(manifestSha256)) throw new Error("pod_artifact_manifest_hash_invalid");
  return manifestSha256.slice(0, 32).toUpperCase();
};

export const applyDeterministicPodPdfMetadata = (
  document: jsPDF,
  input: { manifestSha256: string; documentNumber: string; rendererVersion?: string },
) => {
  (document as JsPdfWithStringCreationDate).setCreationDate(POD_PDF_CREATION_DATE);
  document.setFileId(deterministicPdfFileId(input.manifestSha256));
  document.setProperties({
    title: `${input.documentNumber} - SRA3`,
    subject: "Arkusze impozycyjne SRA3, druk dwustronny, flip on short edge",
    author: "Podróżówka",
    creator: input.rendererVersion || POD_PDF_RENDERER_VERSION,
    keywords: `manifest-sha256:${input.manifestSha256}`,
  });
};

export const podPdfBytes = (document: jsPDF) => new Uint8Array(document.output("arraybuffer"));
