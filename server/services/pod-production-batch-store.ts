import {
  commitWrites,
  createDocumentWrite,
  fromFirestoreFields,
  readDocument,
  updateDocumentWrite,
} from "../../api/_lib/gcp-firestore.js";
import type {
  PodProductionBatchChunk,
  PodProductionBatchHeader,
  PodProductionBatchMembership,
  PodProductionBatchStore,
  VersionedProductionBatchHeader,
} from "../../src/lib/podProductionBatchPersistence.js";

const read = async <T>(collection: string, id: string): Promise<{ data: T; updateTime?: string } | null> => {
  try {
    const document = await readDocument(collection, id);
    if (!document.fields) return null;
    return { data: fromFirestoreFields(document.fields) as unknown as T, updateTime: document.updateTime };
  } catch (error) {
    if (String(error).includes("firestore_404")) return null;
    throw error;
  }
};

export const gcpPodProductionBatchStore: PodProductionBatchStore = {
  readHeader: async (id): Promise<VersionedProductionBatchHeader | null> => {
    const result = await read<PodProductionBatchHeader>("pod_production_batches", id);
    return result?.updateTime ? { data: result.data, updateTime: result.updateTime } : null;
  },
  readChunk: async (id) => (await read<PodProductionBatchChunk>("pod_production_batch_chunks", id))?.data || null,
  createChunk: async (id, chunk) => {
    await commitWrites([createDocumentWrite(`pod_production_batch_chunks/${id}`, chunk)]);
  },
  readMembership: async (id) => (await read<PodProductionBatchMembership>("pod_production_batch_memberships", id))?.data || null,
  reserveBatch: async (header, memberships) => {
    await commitWrites([
      createDocumentWrite(`pod_production_batches/${header.id}`, header),
      ...memberships.map((membership) => createDocumentWrite(`pod_production_batch_memberships/${membership.id}`, membership)),
    ]);
  },
  freezeBatch: async (id, data, updateTime) => {
    await commitWrites([updateDocumentWrite(`pod_production_batches/${id}`, data, updateTime)]);
  },
};
