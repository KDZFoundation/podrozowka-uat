// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createPodProductionBatchHandler } from "../../server/routes/pod/production-batch";
import { createPodProductionBatchArtifactHandler } from "../../server/routes/pod/production-batch-artifact";

const forbidden = Response.json({ error: "admin_access_required" }, { status: 403 });

describe("POD production batch authorization", () => {
  it("rejects batch creation before reading source or batch documents", async () => {
    const readManifest = vi.fn();
    const readBatch = vi.fn();
    const handler = createPodProductionBatchHandler({
      authorize: async () => forbidden,
      manifestStore: {
        readHeader: readManifest,
        createHeader: vi.fn(),
        readChunk: vi.fn(),
        createChunk: vi.fn(),
        freezeHeader: vi.fn(),
      },
      assetSetStore: {
        readHeader: vi.fn(),
        createHeader: vi.fn(),
        readItem: vi.fn(),
        createItem: vi.fn(),
        readChunk: vi.fn(),
        createChunk: vi.fn(),
        freezeHeader: vi.fn(),
      },
      batchStore: {
        readHeader: readBatch,
        readChunk: vi.fn(),
        createChunk: vi.fn(),
        readMembership: vi.fn(),
        reserveBatch: vi.fn(),
        freezeBatch: vi.fn(),
      },
      now: () => "2026-08-30T00:00:00.000Z",
    });
    const response = await handler.fetch(new Request("https://api.test/api/pod/production-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections: [] }),
    }));
    expect(response.status).toBe(403);
    expect(readManifest).not.toHaveBeenCalled();
    expect(readBatch).not.toHaveBeenCalled();
  });

  it("rejects artifact access before reading Firestore or Storage", async () => {
    const readArtifact = vi.fn();
    const readStorage = vi.fn();
    const handler = createPodProductionBatchArtifactHandler({
      authorize: async () => forbidden,
      batchStore: {
        readHeader: vi.fn(),
        readChunk: vi.fn(),
        createChunk: vi.fn(),
        readMembership: vi.fn(),
        reserveBatch: vi.fn(),
        freezeBatch: vi.fn(),
      },
      artifactStore: { read: readArtifact, createOnly: vi.fn() },
      storage: { createOnly: vi.fn(), readMetadata: readStorage, download: vi.fn() },
      now: () => "2026-08-30T00:00:00.000Z",
    });
    const response = await handler.fetch(new Request("https://api.test/api/pod/production-batch-artifact?artifact_id=test"));
    expect(response.status).toBe(403);
    expect(readArtifact).not.toHaveBeenCalled();
    expect(readStorage).not.toHaveBeenCalled();
  });
});
