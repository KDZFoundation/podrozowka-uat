import { commitWrites, createDocumentWrite, fromFirestoreFields, readDocument } from "../../api/_lib/gcp-firestore.js";
import type { PodPrintArtifactDocument, PodPrintArtifactStore } from "../../src/lib/podPrintArtifact.js";

export const gcpPodPrintArtifactStore: PodPrintArtifactStore = {
  read: async (id) => {
    try {
      const document = await readDocument("pod_print_artifacts", id);
      return document.fields ? fromFirestoreFields(document.fields) as unknown as PodPrintArtifactDocument : null;
    } catch (error) {
      if (String(error).includes("firestore_404")) return null;
      throw error;
    }
  },
  createOnly: async (id, document) => {
    await commitWrites([createDocumentWrite(`pod_print_artifacts/${id}`, document)]);
  },
};
