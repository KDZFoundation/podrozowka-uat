import { commitWrites, createDocumentWrite, fromFirestoreFields, readDocument } from "../../api/_lib/gcp-firestore.js";
import type {
  PodProductionProofApprovalEvent,
  PodProductionProofArtifact,
  PodProductionProofStore,
} from "../../src/lib/podProductionProof.js";

const read = async <T>(collection: string, id: string): Promise<T | null> => {
  try {
    const document = await readDocument(collection, id);
    return document.fields ? fromFirestoreFields(document.fields) as unknown as T : null;
  } catch (error) {
    if (String(error).includes("firestore_404")) return null;
    throw error;
  }
};

export const gcpPodProductionProofStore: PodProductionProofStore = {
  readArtifact: (id) => read<PodProductionProofArtifact>("pod_production_proof_artifacts", id),
  createArtifact: async (id, artifact) => {
    await commitWrites([createDocumentWrite(`pod_production_proof_artifacts/${id}`, artifact)]);
  },
  readApproval: (id) => read<PodProductionProofApprovalEvent>("pod_production_proof_approval_events", id),
  createApproval: async (id, event) => {
    await commitWrites([createDocumentWrite(`pod_production_proof_approval_events/${id}`, event)]);
  },
};
