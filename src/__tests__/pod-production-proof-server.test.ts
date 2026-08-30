// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPodProductionProofHandler } from "../../server/routes/pod/production-proof";
import type { PodProductionProofStore } from "../lib/podProductionProof";
import type { PodPrintArtifactStorage } from "../lib/podPrintArtifact";

const request = (body: Record<string, unknown>) => new Request("https://api.example.test/api/pod/production-proof", {
  method: "POST",
  headers: { Authorization: "Bearer e30.eyJzdWIiOiJhZG1pbiJ9.signature", "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const unusedStore: PodProductionProofStore = {
  readArtifact: async () => null,
  createArtifact: async () => undefined,
  readApproval: async () => null,
  createApproval: async () => undefined,
};

const unusedStorage: PodPrintArtifactStorage = {
  createOnly: async () => { throw new Error("must_not_upload"); },
  readMetadata: async () => { throw new Error("must_not_read"); },
  download: async () => { throw new Error("must_not_download"); },
};

describe("POD production proof endpoint", () => {
  it("rejects inactive administrators before any proof work", async () => {
    const handler = createPodProductionProofHandler({
      authorize: async () => Response.json({ error: "admin_access_required" }, { status: 403 }),
      store: unusedStore,
      storage: unusedStorage,
      now: () => "2026-08-30T10:00:00.000Z",
    });
    const response = await handler.fetch(request({ operation: "create", print_format_id: "postcard-148x105-v1" }));
    expect(response.status).toBe(403);
  });

  it("never creates an approval without explicit physical confirmation and comment", async () => {
    const handler = createPodProductionProofHandler({
      authorize: async () => null,
      store: unusedStore,
      storage: unusedStorage,
      now: () => "2026-08-30T10:00:00.000Z",
    });
    const response = await handler.fetch(request({ operation: "approve", artifact_id: "proof-a", idempotency_key: "retry-a" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "pod_proof_manual_confirmation_required" });
  });
});
