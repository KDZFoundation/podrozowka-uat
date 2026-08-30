import { commitWrites, createDocumentWrite, fromFirestoreFields, readDocument } from "../../api/_lib/gcp-firestore.js";
import type {
  PodProductionBatchArtifactDocument,
  PodProductionBatchArtifactStore,
} from "../../src/lib/podProductionBatchArtifact.js";

export const gcpPodProductionBatchArtifactStore: PodProductionBatchArtifactStore = {
  read: async (id) => {
    try {
      const document = await readDocument("pod_production_batch_artifacts", id);
      return document.fields
        ? fromFirestoreFields(document.fields) as unknown as PodProductionBatchArtifactDocument
        : null;
    } catch (error) {
      if (String(error).includes("firestore_404")) return null;
      throw error;
    }
  },
  createOnly: async (id, document) => {
    await commitWrites([createDocumentWrite(`pod_production_batch_artifacts/${id}`, document)]);
  },
};
