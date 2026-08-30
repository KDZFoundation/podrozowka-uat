import {
  commitWrites,
  createDocumentWrite,
  fromFirestoreFields,
  readDocument,
  updateDocumentWrite,
} from "../../api/_lib/gcp-firestore.js";
import type {
  PodPrintAssetSetChunk,
  PodPrintAssetSetHeader,
  PodPrintAssetSetItem,
  PodPrintAssetSetStore,
  VersionedAssetSetHeader,
} from "../../src/lib/podPrintAssetSet.js";

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

export const gcpPodPrintAssetSetStore: PodPrintAssetSetStore = {
  readHeader: async (id): Promise<VersionedAssetSetHeader | null> => {
    const result = await read<PodPrintAssetSetHeader>("pod_print_asset_sets", id);
    return result?.updateTime ? { data: result.data, updateTime: result.updateTime } : null;
  },
  createHeader: async (id, header) => {
    await commitWrites([createDocumentWrite(`pod_print_asset_sets/${id}`, header)]);
  },
  readItem: async (id) => (await read<PodPrintAssetSetItem>("pod_print_asset_set_items", id))?.data || null,
  createItem: async (id, item) => {
    await commitWrites([createDocumentWrite(`pod_print_asset_set_items/${id}`, item)]);
  },
  readChunk: async (id) => (await read<PodPrintAssetSetChunk>("pod_print_asset_set_chunks", id))?.data || null,
  createChunk: async (id, chunk) => {
    await commitWrites([createDocumentWrite(`pod_print_asset_set_chunks/${id}`, chunk)]);
  },
  freezeHeader: async (id, data, updateTime) => {
    await commitWrites([updateDocumentWrite(`pod_print_asset_sets/${id}`, data, updateTime)]);
  },
};
