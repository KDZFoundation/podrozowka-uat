// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluatePodProductionReadiness } from "../../server/services/pod-production-readiness";

describe("POD production readiness", () => {
  it("reports every required configuration value and blocks a missing frozen batch", async () => {
    const report = await evaluatePodProductionReadiness({
      batchId: "batch-missing",
      releaseId: "release-missing",
      batchStore: {
        readHeader: async () => null,
        readChunk: async () => null,
        createChunk: async () => undefined,
        readMembership: async () => null,
        reserveBatch: async () => undefined,
        freezeBatch: async () => undefined,
      },
      artifactStore: { read: async () => null, createOnly: async () => undefined },
      assetSetStore: {
        readHeader: async () => null,
        createHeader: async () => undefined,
        readItem: async () => null,
        createItem: async () => undefined,
        readChunk: async () => null,
        createChunk: async () => undefined,
        freezeHeader: async () => undefined,
      },
      proofStore: {
        readArtifact: async () => null,
        createArtifact: async () => undefined,
        readApproval: async () => null,
        createApproval: async () => undefined,
      },
      releaseStore: {
        readRelease: async () => null,
        readEvent: async () => null,
        createRelease: async () => undefined,
        transition: async () => undefined,
      },
      storage: {
        createOnly: async () => { throw new Error("must_not_upload"); },
        readMetadata: async () => { throw new Error("must_not_read"); },
        download: async () => { throw new Error("must_not_download"); },
      },
      env: {},
    });
    expect(report.status).toBe("BLOCKED");
    expect(report.checks).toContainEqual({ code: "batch:frozen", ok: false, detail: "missing_or_not_frozen" });
    expect(report.checks.filter((check) => check.code.startsWith("configuration:")).every((check) => !check.ok)).toBe(true);
  });

  it("accepts the pinned Fontsource host without mutable font URL or hash environment pairs", async () => {
    const report = await evaluatePodProductionReadiness({
      batchId: "batch-missing",
      releaseId: "release-missing",
      batchStore: { readHeader: async () => null } as never,
      artifactStore: {} as never,
      assetSetStore: {} as never,
      proofStore: {} as never,
      releaseStore: { readRelease: async () => null } as never,
      storage: {} as never,
      env: {
        POD_PRINT_ARTIFACT_BUCKET: "pod.example.test",
        POD_PRINT_ASSET_ALLOWED_HOSTS: "pod.example.test,flagcdn.com",
        POD_PRINT_FONT_ALLOWED_HOSTS: "cdn.jsdelivr.net",
        POD_PRINT_TEMPLATE_FRONT_SHA256: "a".repeat(64),
        POD_PRINT_TEMPLATE_BACK_SHA256: "b".repeat(64),
      },
    });
    expect(report.checks.filter((check) => check.code.startsWith("configuration:")).every((check) => check.ok)).toBe(true);
  });
});
