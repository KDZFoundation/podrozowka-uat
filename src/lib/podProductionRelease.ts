import { canonicalJson, sha256Utf8 } from "./podPrintManifest";

export const POD_PRODUCTION_RELEASE_VERSION = 1 as const;
export type PodProductionReleaseStatus = "DRAFT" | "READY" | "RELEASED_TO_PRINTER" | "CANCELLED";
export type PodProductionReleaseEventType = "CREATED" | "MARKED_READY" | "RELEASED_TO_PRINTER" | "CANCELLED";

export interface PodProductionRelease {
  id: string;
  release_version: typeof POD_PRODUCTION_RELEASE_VERSION;
  batch_id: string;
  batch_sha256: string;
  status: PodProductionReleaseStatus;
  proof_artifact_ids: string[];
  proof_approval_event_ids: string[];
  created_at: string;
  created_by: string;
  updated_at: string;
  schema_version: 1;
}

export interface PodProductionReleaseEvent {
  id: string;
  release_id: string;
  batch_id: string;
  event_type: PodProductionReleaseEventType;
  from_status: PodProductionReleaseStatus | null;
  to_status: PodProductionReleaseStatus;
  idempotency_key: string;
  actor_uid: string;
  reason: string | null;
  created_at: string;
  schema_version: 1;
}

export class PodProductionReleaseError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PodProductionReleaseError";
  }
}

export const derivePodProductionReleaseId = async (batchId: string) => {
  if (!batchId.trim()) throw new PodProductionReleaseError("pod_release_batch_id_required");
  return `pr-${await sha256Utf8(canonicalJson({ batch_id: batchId, release_version: POD_PRODUCTION_RELEASE_VERSION }))}`;
};

export const derivePodProductionReleaseEventId = async (releaseId: string, idempotencyKey: string) => {
  if (!releaseId.trim() || !idempotencyKey.trim()) throw new PodProductionReleaseError("pod_release_idempotency_key_required");
  if (idempotencyKey.length > 160) throw new PodProductionReleaseError("pod_release_idempotency_key_invalid");
  return `pre-${await sha256Utf8(canonicalJson({ idempotency_key: idempotencyKey, release_id: releaseId }))}`;
};

const transitions: Record<PodProductionReleaseStatus, Partial<Record<PodProductionReleaseEventType, PodProductionReleaseStatus>>> = {
  DRAFT: { MARKED_READY: "READY", CANCELLED: "CANCELLED" },
  READY: { RELEASED_TO_PRINTER: "RELEASED_TO_PRINTER", CANCELLED: "CANCELLED" },
  RELEASED_TO_PRINTER: {},
  CANCELLED: {},
};

export const nextPodProductionReleaseStatus = (
  current: PodProductionReleaseStatus,
  eventType: PodProductionReleaseEventType,
) => {
  const next = transitions[current][eventType];
  if (!next) throw new PodProductionReleaseError(`pod_release_transition_invalid:${current}:${eventType}`);
  return next;
};
