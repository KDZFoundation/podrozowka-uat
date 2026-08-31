import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT, POD_IMPOSITION_ALGORITHM } from "./podImposition";
import { POD_CUT_STACK_PROFILE_VERSION, planPodProductionBatch, type PodProductionBatchSourceItem } from "./podProductionBatch";
import { hashPodPrintRenderInput, type PodPrintRenderInput } from "./podPrintManifest";

vi.mock("jspdf", () => ({
  jsPDF: class {
    addPage = vi.fn();
    addImage = vi.fn();
  },
}));
vi.mock("@/integrations/firebase/config", () => ({
  auth: { currentUser: { getIdToken: vi.fn(async () => "admin-token") } },
}));
vi.mock("@/lib/backendApi", () => ({ backendApiUrl: (value: string) => value }));
vi.mock("@/lib/podPdfMetadata", () => ({
  applyDeterministicPodPdfMetadata: vi.fn(),
  podPdfBytes: vi.fn(() => new TextEncoder().encode("%PDF-1.7\ncanonical-batch")),
}));
vi.mock("@/lib/generatePodPrintPdf", () => ({
  drawPodCropMarks: vi.fn(),
  renderPodPostcardSide: vi.fn(async () => "data:image/png;base64,AA=="),
}));

import { generatePodProductionBatchGroupPdf } from "./generatePodProductionBatchPdf";

const renderInput: PodPrintRenderInput = {
  qr_url: "https://assets.test/qr.png",
  front_text: "Dziękuję",
  back_qr_label: "Zeskanuj kod",
  image_front_url: "https://assets.test/photo.jpg",
  image_version: "1",
  photo_author: null,
  crop_settings: null,
  country_iso2: "GR",
  country_flag_url: "https://assets.test/flag.png",
};

const source: PodProductionBatchSourceItem = {
  pod_job_id: "pod-1",
  print_job_id: "job-1",
  print_job_item_id: "item-1",
  inventory_unit_id: "unit-1",
  source_order_id: "order-1",
  card_design_id: "design-1",
  print_manifest_id: `pm-${"a".repeat(64)}`,
  print_manifest_sha256: "b".repeat(64),
  print_manifest_state: "frozen",
  asset_set_id: `pas-${"c".repeat(64)}`,
  asset_set_sha256: "d".repeat(64),
  asset_set_state: "frozen",
  render_profile_version: "pod-render-profile-v1",
  render_profile_sha256: "e".repeat(64),
  render_input_sha256: "",
  print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
  algorithm_version: POD_IMPOSITION_ALGORITHM,
  cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
  sequence_index: 0,
  batch_order_index: 0,
  primary_language_code: "pl",
  secondary_language_code: null,
};

describe("production batch PDF direct-storage boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:batch-pdf") });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("regenerates deterministically, verifies an existing immutable artifact and never downloads it through Vercel", async () => {
    const hashedSource = { ...source, render_input_sha256: await hashPodPrintRenderInput(renderInput) };
    const manifest = await planPodProductionBatch([hashedSource], [CURRENT_POSTCARD_PRINT_FORMAT]);
    const response = (body: object) => new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ artifact_id: "pba-test", existing: true, upload_url: null }))
      .mockResolvedValueOnce(response({ artifact_id: "pba-test", created: false }));
    const loadSources = vi.fn(async () => ({
      renderInputs: new Map([["item-1", renderInput]]),
      assetsBySetId: new Map([[source.asset_set_id, {
        header: {
          id: source.asset_set_id,
          asset_set_sha256: source.asset_set_sha256,
          render_profile_version: source.render_profile_version,
          render_profile_sha256: source.render_profile_sha256,
        },
        items: [],
        urlFor: () => "blob:asset",
        fontFamiliesFor: () => [],
      }]]),
      dispose: vi.fn(),
    }));

    const result = await generatePodProductionBatchGroupPdf(manifest, 0, loadSources);

    expect(result.reprinted).toBe(true);
    expect(result.downloadUrl).toBe("blob:batch-pdf");
    expect(loadSources).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("operation=initiate_upload");
    expect(String(fetchMock.mock.calls[1][0])).toContain("operation=finalize_upload");
  });
});
