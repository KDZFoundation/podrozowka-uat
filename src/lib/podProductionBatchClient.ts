import { auth } from "@/integrations/firebase/config";
import { backendApiUrl } from "@/lib/backendApi";
import {
  reconstructAndVerifyPodProductionBatch,
  type FrozenPodProductionBatch,
  type PodProductionBatchChunk,
  type PodProductionBatchHeader,
} from "@/lib/podProductionBatchPersistence";

export interface PodProductionBatchSelectionRequest {
  print_manifest_id: string;
  asset_set_id: string;
}

const request = async <T,>(token: string, body: Record<string, unknown>) => {
  const response = await fetch(backendApiUrl("/api/pod/production-batch"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok || !result) throw new Error(result?.error || "pod_batch_request_failed");
  return result;
};

export const createOrLoadPodProductionBatch = async (
  selections: readonly PodProductionBatchSelectionRequest[],
): Promise<FrozenPodProductionBatch> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Do utworzenia batcha POD wymagane jest konto administratora.");
  const created = await request<{ header: PodProductionBatchHeader }>(token, { operation: "create", selections });
  if (created.header.state !== "FROZEN") throw new Error("pod_batch_not_frozen");
  const chunks: PodProductionBatchChunk[] = [];
  for (let chunkIndex = 0; chunkIndex < created.header.chunk_count; chunkIndex += 1) {
    const result = await request<{ chunk: PodProductionBatchChunk }>(token, {
      operation: "get_chunk",
      batch_id: created.header.id,
      chunk_index: chunkIndex,
    });
    chunks.push(result.chunk);
  }
  return reconstructAndVerifyPodProductionBatch(created.header, chunks);
};
