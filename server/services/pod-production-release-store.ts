import {
  commitWrites,
  createDocumentWrite,
  fromFirestoreFields,
  readDocument,
  updateDocumentWrite,
} from "../../api/_lib/gcp-firestore.js";
import type { PodProductionRelease, PodProductionReleaseEvent } from "../../src/lib/podProductionRelease.js";

export interface VersionedPodProductionRelease { data: PodProductionRelease; updateTime: string }

const read = async <T>(collection: string, id: string): Promise<{ data: T; updateTime?: string } | null> => {
  try {
    const document = await readDocument(collection, id);
    return document.fields ? { data: fromFirestoreFields(document.fields) as unknown as T, updateTime: document.updateTime } : null;
  } catch (error) {
    if (String(error).includes("firestore_404")) return null;
    throw error;
  }
};

export interface PodProductionReleaseStore {
  readRelease(id: string): Promise<VersionedPodProductionRelease | null>;
  readEvent(id: string): Promise<PodProductionReleaseEvent | null>;
  createRelease(release: PodProductionRelease, event: PodProductionReleaseEvent): Promise<void>;
  transition(release: PodProductionRelease, updateTime: string, event: PodProductionReleaseEvent): Promise<void>;
}

export const gcpPodProductionReleaseStore: PodProductionReleaseStore = {
  readRelease: async (id) => {
    const value = await read<PodProductionRelease>("pod_production_releases", id);
    return value?.updateTime ? { data: value.data, updateTime: value.updateTime } : null;
  },
  readEvent: async (id) => (await read<PodProductionReleaseEvent>("pod_production_release_events", id))?.data || null,
  createRelease: async (release, event) => commitWrites([
    createDocumentWrite(`pod_production_releases/${release.id}`, release),
    createDocumentWrite(`pod_production_release_events/${event.id}`, event),
  ]).then(() => undefined),
  transition: async (release, updateTime, event) => commitWrites([
    updateDocumentWrite(`pod_production_releases/${release.id}`, release, updateTime),
    createDocumentWrite(`pod_production_release_events/${event.id}`, event),
  ]).then(() => undefined),
};
