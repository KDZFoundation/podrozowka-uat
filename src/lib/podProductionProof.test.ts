// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "./podImposition";
import { buildPodProductionProofManifest, hashPodProductionProofManifest, renderPodProductionProofPdf } from "./podProductionProof";

describe("numbered POD physical proof", () => {
  it("is deterministic, contains no customer source data and exposes cut-stack order", async () => {
    const first = await buildPodProductionProofManifest(CURRENT_POSTCARD_PRINT_FORMAT);
    const second = await buildPodProductionProofManifest(CURRENT_POSTCARD_PRINT_FORMAT);
    expect(second).toEqual(first);
    expect(await hashPodProductionProofManifest(second)).toBe(await hashPodProductionProofManifest(first));
    expect(first.batch_manifest.groups[0].sheet_count).toBe(2);
    expect(first.expected_output_sequence.map((entry) => entry.proof_number)).toEqual(
      Array.from({ length: first.expected_output_sequence.length }, (_, index) => index + 1),
    );
    expect(JSON.stringify(first)).not.toContain("qr_url");
    expect(JSON.stringify(first)).not.toContain("recipient");
  });

  it("renders byte-identical numbered PDFs for one manifest", async () => {
    const manifest = await buildPodProductionProofManifest(CURRENT_POSTCARD_PRINT_FORMAT);
    const first = await renderPodProductionProofPdf(manifest);
    const second = await renderPodProductionProofPdf(manifest);
    expect(first.proofSha256).toBe(second.proofSha256);
    expect(first.bytes).toEqual(second.bytes);
    expect(new TextDecoder().decode(first.bytes.slice(0, 5))).toBe("%PDF-");
  });
});
