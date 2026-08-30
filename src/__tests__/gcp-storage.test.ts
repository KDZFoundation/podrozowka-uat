// @vitest-environment node
import { describe, expect, it } from "vitest";
import { gcsCreateOnlyUploadUrl } from "../../api/_lib/gcp-storage";
import { createDocumentWrite } from "../../api/_lib/gcp-firestore";

describe("GCS POD artifact preconditions", () => {
  it("always constructs an object insert URL with ifGenerationMatch=0", () => {
    const url = new URL(gcsCreateOnlyUploadUrl("private pod bucket"));
    expect(url.searchParams.get("uploadType")).toBe("multipart");
    expect(url.searchParams.get("ifGenerationMatch")).toBe("0");
    expect(url.pathname).toContain("private%20pod%20bucket");
  });

  it("constructs artifact Firestore writes with an exists=false precondition", () => {
    const write = createDocumentWrite("pod_print_artifacts/pa-test", { immutable: true, status: "ready" });
    expect(write.currentDocument).toEqual({ exists: false });
    expect(write.update.name).toContain("/documents/pod_print_artifacts/pa-test");
  });
});
