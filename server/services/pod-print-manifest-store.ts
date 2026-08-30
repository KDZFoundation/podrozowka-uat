import {
  commitWrites,
  createDocumentWrite,
  fromFirestoreFields,
  readDocument,
  updateDocumentWrite,
} from "../../api/_lib/gcp-firestore.js";
import type {
  PodPrintManifestChunk,
  PodPrintManifestHeader,
  PodPrintManifestStore,
  VersionedDocument,
} from "../../src/lib/podPrintManifestPersistence.js";

const read = async <T>(collection: string, id: string): Promise<VersionedDocument<T> | null> => {
  try {
    const document = await readDocument(collection, id);
    if (!document.fields || !document.updateTime) return null;
    return { data: fromFirestoreFields(document.fields) as T, updateTime: document.updateTime };
  } catch (error) {
    if (String(error).includes("firestore_404")) return null;
    throw error;
  }
};

export const gcpPodPrintManifestStore: PodPrintManifestStore = {
  readHeader: (id) => read<PodPrintManifestHeader>("pod_print_manifests", id),
  createHeader: async (id, data) => {
    await commitWrites([createDocumentWrite(`pod_print_manifests/${id}`, data)]);
  },
  readChunk: (id) => read<PodPrintManifestChunk>("pod_print_manifest_chunks", id),
  createChunk: async (id, data) => {
    await commitWrites([createDocumentWrite(`pod_print_manifest_chunks/${id}`, data)]);
  },
  freezeHeader: async (id, data, updateTime) => {
    await commitWrites([updateDocumentWrite(`pod_print_manifests/${id}`, data, updateTime)]);
  },
};
