import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT, POD_IMPOSITION_ALGORITHM } from "./podImposition";
import { POD_CUT_STACK_PROFILE_VERSION, planPodProductionBatch, type PodProductionBatchSourceItem } from "./podProductionBatch";

vi.mock("@/integrations/firebase/config", () => ({
  auth: { currentUser: { getIdToken: vi.fn(async () => "admin-token") } },
}));
vi.mock("@/lib/backendApi", () => ({ backendApiUrl: (value: string) => value }));
vi.mock("@/lib/generatePodPrintPdf", () => ({
  drawPodCropMarks: vi.fn(),
  renderPodPostcardSide: vi.fn(),
}));

import { generatePodProductionBatchGroupPdf } from "./generatePodProductionBatchPdf";

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
  render_input_sha256: "f".repeat(64),
  print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
  algorithm_version: POD_IMPOSITION_ALGORITHM,
  cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
  sequence_index: 0,
  batch_order_index: 0,
  primary_language_code: "pl",
  secondary_language_code: null,
};

describe("production batch PDF reprint boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:batch-pdf") });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("downloads an existing artifact before loading assets or rendering", async () => {
    const manifest = await planPodProductionBatch([source], [CURRENT_POSTCARD_PRINT_FORMAT]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      new TextEncoder().encode("%PDF-1.7\narchived").buffer,
      { status: 200, headers: { "Content-Type": "application/pdf" } },
    ));
    const loadSources = vi.fn();
    const result = await generatePodProductionBatchGroupPdf(manifest, 0, loadSources);
    expect(result.reprinted).toBe(true);
    expect(result.downloadUrl).toBe("blob:batch-pdf");
    expect(loadSources).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
