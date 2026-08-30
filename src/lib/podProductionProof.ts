import { jsPDF } from "jspdf";
import { POD_IMPOSITION_ALGORITHM, type PodPrintFormatConfig } from "./podImposition";
import { canonicalJson, sha256Utf8 } from "./podPrintManifest";
import {
  POD_CUT_STACK_PROFILE_VERSION,
  planPodProductionBatch,
  type PodProductionBatchManifest,
  type PodProductionBatchSourceItem,
} from "./podProductionBatch";
import { applyDeterministicPodPdfMetadata, podPdfBytes } from "./podPdfMetadata";
import { sha256Bytes, type PodPrintArtifactStorage, type PodPrintArtifactStorageMetadata } from "./podPrintArtifact";

export const POD_PRODUCTION_PROOF_VERSION = 1 as const;
export const POD_PRODUCTION_PROOF_RENDERER_VERSION = "pod-numbered-proof-jspdf-v1" as const;
const HASH = "0".repeat(64);

export interface PodProductionProofManifest {
  proof_version: typeof POD_PRODUCTION_PROOF_VERSION;
  renderer_version: typeof POD_PRODUCTION_PROOF_RENDERER_VERSION;
  print_format_id: string;
  print_format: PodPrintFormatConfig;
  batch_manifest: PodProductionBatchManifest;
  instructions: {
    sheet_orientation: "portrait";
    duplex_mode: "flip_on_short_edge";
    printer_output_face: "face_up";
    sheet_stack_order: "ascending_sheet_index_top_to_bottom";
    slot_traversal_order: "row_major_top_left_to_bottom_right";
    pile_merge_order: "ascending_front_slot";
  };
  expected_output_sequence: Array<{
    proof_number: number;
    sheet_index: number;
    front_slot: number;
    back_slot: number;
    cut_pile_index: number;
    position_in_cut_pile: number;
  }>;
}

export interface PodProductionProofArtifact {
  id: string;
  proof_version: typeof POD_PRODUCTION_PROOF_VERSION;
  proof_sha256: string;
  proof_manifest: PodProductionProofManifest;
  print_format_id: string;
  pdf_sha256: string;
  size_bytes: number;
  storage_bucket: string;
  storage_object: string;
  storage_generation: string;
  storage_metageneration: string;
  crc32c: string;
  md5_hash: string | null;
  content_type: "application/pdf";
  status: "ready";
  immutable: true;
  created_at: string;
  created_by: string;
  schema_version: 1;
}

export interface PodProductionProofApprovalEvent {
  id: string;
  proof_artifact_id: string;
  proof_sha256: string;
  event_type: "PHYSICAL_PROOF_APPROVED";
  idempotency_key: string;
  comment: string;
  actor_uid: string;
  created_at: string;
  schema_version: 1;
}

export interface PodProductionProofStore {
  readArtifact(id: string): Promise<PodProductionProofArtifact | null>;
  createArtifact(id: string, artifact: PodProductionProofArtifact): Promise<void>;
  readApproval(id: string): Promise<PodProductionProofApprovalEvent | null>;
  createApproval(id: string, event: PodProductionProofApprovalEvent): Promise<void>;
}

export class PodProductionProofError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PodProductionProofError";
  }
}

export const buildPodProductionProofManifest = async (format: PodPrintFormatConfig): Promise<PodProductionProofManifest> => {
  // Two full sheets expose duplex reflection, sheet stacking and every cut pile.
  const slotProbe = await planPodProductionBatch([{
    pod_job_id: "proof-job",
    print_job_id: "proof-job",
    print_job_item_id: "proof-probe",
    inventory_unit_id: "proof-probe",
    source_order_id: "proof-order",
    card_design_id: "proof-design",
    print_manifest_id: "proof-manifest",
    print_manifest_sha256: HASH,
    print_manifest_state: "frozen",
    asset_set_id: "proof-assets",
    asset_set_sha256: HASH,
    asset_set_state: "frozen",
    render_profile_version: "proof-render-profile",
    render_profile_sha256: HASH,
    render_input_sha256: HASH,
    print_format_id: format.print_format_id,
    algorithm_version: POD_IMPOSITION_ALGORITHM,
    cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
    sequence_index: 0,
    batch_order_index: 0,
    primary_language_code: null,
    secondary_language_code: null,
  }], [format]);
  const slotsPerSheet = slotProbe.groups[0]?.cut_stack.slots_per_sheet;
  if (!slotsPerSheet) throw new PodProductionProofError("pod_proof_format_has_no_slots");
  const sources: PodProductionBatchSourceItem[] = Array.from({ length: slotsPerSheet * 2 }, (_, index) => ({
    pod_job_id: "proof-job",
    print_job_id: "proof-job",
    print_job_item_id: `proof-position-${String(index + 1).padStart(4, "0")}`,
    inventory_unit_id: `proof-unit-${String(index + 1).padStart(4, "0")}`,
    source_order_id: "proof-order",
    card_design_id: "proof-design",
    print_manifest_id: "proof-manifest",
    print_manifest_sha256: HASH,
    print_manifest_state: "frozen",
    asset_set_id: "proof-assets",
    asset_set_sha256: HASH,
    asset_set_state: "frozen",
    render_profile_version: "proof-render-profile",
    render_profile_sha256: HASH,
    render_input_sha256: HASH,
    print_format_id: format.print_format_id,
    algorithm_version: POD_IMPOSITION_ALGORITHM,
    cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
    sequence_index: index,
    batch_order_index: 0,
    primary_language_code: null,
    secondary_language_code: null,
  }));
  const batchManifest = await planPodProductionBatch(sources, [format]);
  const group = batchManifest.groups[0];
  return {
    proof_version: POD_PRODUCTION_PROOF_VERSION,
    renderer_version: POD_PRODUCTION_PROOF_RENDERER_VERSION,
    print_format_id: format.print_format_id,
    print_format: structuredClone(format),
    batch_manifest: batchManifest,
    instructions: {
      sheet_orientation: group.cut_stack.sheet_orientation,
      duplex_mode: group.cut_stack.duplex_mode,
      printer_output_face: group.cut_stack.printer_output_face,
      sheet_stack_order: group.cut_stack.sheet_stack_order,
      slot_traversal_order: group.cut_stack.slot_traversal_order,
      pile_merge_order: group.cut_stack.pile_merge_order,
    },
    expected_output_sequence: [...group.positions]
      .sort((left, right) => left.batch_sequence_index - right.batch_sequence_index)
      .map((position) => ({
        proof_number: position.batch_sequence_index + 1,
        sheet_index: position.sheet_index,
        front_slot: position.front_slot,
        back_slot: position.back_slot,
        cut_pile_index: position.cut_pile_index,
        position_in_cut_pile: position.position_in_cut_pile,
      })),
  };
};

export const hashPodProductionProofManifest = (manifest: PodProductionProofManifest) => sha256Utf8(canonicalJson(manifest));

export const renderPodProductionProofPdf = async (manifest: PodProductionProofManifest) => {
  const proofSha256 = await hashPodProductionProofManifest(manifest);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [320, 450], compress: true, putOnlyUsedFonts: true });
  applyDeterministicPodPdfMetadata(pdf, {
    manifestSha256: proofSha256,
    documentNumber: `PROOF-${manifest.print_format_id}`,
    rendererVersion: POD_PRODUCTION_PROOF_RENDERER_VERSION,
  });
  const group = manifest.batch_manifest.groups[0];
  const drawSide = (side: "front" | "back", sheetIndex: number) => {
    if (pdf.getNumberOfPages() > 1 || sheetIndex > 0 || side === "back") pdf.addPage([320, 450], "portrait");
    for (const position of group.positions.filter((item) => item.sheet_index === sheetIndex)) {
      const coordinates = side === "front" ? position.front_coordinates : position.back_coordinates;
      const artwork = coordinates.artwork;
      const trim = coordinates.trim;
      const number = position.batch_sequence_index + 1;
      pdf.setDrawColor(160, 160, 160);
      pdf.rect(artwork.x, artwork.y, artwork.width, artwork.height);
      pdf.setDrawColor(0, 0, 0);
      pdf.rect(trim.x, trim.y, trim.width, trim.height);
      const mark = 2;
      pdf.line(artwork.x, trim.y, trim.x - mark, trim.y);
      pdf.line(trim.x + trim.width + mark, trim.y, artwork.x + artwork.width, trim.y);
      pdf.line(artwork.x, trim.y + trim.height, trim.x - mark, trim.y + trim.height);
      pdf.line(trim.x + trim.width + mark, trim.y + trim.height, artwork.x + artwork.width, trim.y + trim.height);
      pdf.line(trim.x, artwork.y, trim.x, trim.y - mark);
      pdf.line(trim.x, trim.y + trim.height + mark, trim.x, artwork.y + artwork.height);
      pdf.line(trim.x + trim.width, artwork.y, trim.x + trim.width, trim.y - mark);
      pdf.line(trim.x + trim.width, trim.y + trim.height + mark, trim.x + trim.width, artwork.y + artwork.height);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(34);
      pdf.text(String(number), artwork.x + artwork.width / 2, artwork.y + artwork.height / 2, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`${side.toUpperCase()} S${sheetIndex + 1} F${position.front_slot} B${position.back_slot}`, artwork.x + 4, artwork.y + 7);
      pdf.text(`PILE ${position.cut_pile_index} / ${position.position_in_cut_pile}`, artwork.x + 4, artwork.y + artwork.height - 5);
    }
  };
  for (let sheetIndex = 0; sheetIndex < group.sheet_count; sheetIndex += 1) {
    drawSide("front", sheetIndex);
    drawSide("back", sheetIndex);
  }
  return { proofSha256, bytes: podPdfBytes(pdf) };
};

export const derivePodProductionProofArtifactId = async (printFormatId: string, proofSha256: string) =>
  `ppa-${await sha256Utf8(canonicalJson({ print_format_id: printFormatId, proof_sha256: proofSha256, proof_version: POD_PRODUCTION_PROOF_VERSION }))}`;

const proofMetadata = (artifact: Pick<PodProductionProofArtifact, "proof_sha256" | "print_format_id" | "pdf_sha256">) => ({
  content_type: "application/pdf",
  proof_sha256: artifact.proof_sha256,
  print_format_id: artifact.print_format_id,
  pdf_sha256: artifact.pdf_sha256,
  proof_version: String(POD_PRODUCTION_PROOF_VERSION),
  renderer_version: POD_PRODUCTION_PROOF_RENDERER_VERSION,
});

const verifyProofObject = async (storage: PodPrintArtifactStorage, object: string, generation: string | undefined, pdfSha256: string, size: number, metadata: Record<string, string>) => {
  const objectMetadata = await storage.readMetadata(object, generation);
  const bytes = await storage.download(object, objectMetadata.generation);
  if (objectMetadata.object !== object || objectMetadata.contentType !== "application/pdf" || objectMetadata.size !== size
    || bytes.byteLength !== size || (generation && objectMetadata.generation !== generation)
    || await sha256Bytes(bytes) !== pdfSha256
    || Object.entries(metadata).some(([key, value]) => objectMetadata.metadata[key] !== value)) {
    throw new PodProductionProofError("pod_proof_artifact_integrity_mismatch");
  }
  return { metadata: objectMetadata, bytes };
};

const assertRecordedProofMetadata = (artifact: PodProductionProofArtifact, metadata: PodPrintArtifactStorageMetadata) => {
  if (metadata.bucket !== artifact.storage_bucket || metadata.metageneration !== artifact.storage_metageneration
    || metadata.crc32c !== artifact.crc32c || metadata.md5Hash !== artifact.md5_hash) {
    throw new PodProductionProofError("pod_proof_artifact_integrity_mismatch");
  }
};

export const createPodProductionProofArtifact = async (storage: PodPrintArtifactStorage, store: PodProductionProofStore, input: {
  format: PodPrintFormatConfig;
  createdAt: string;
  createdBy: string;
}) => {
  const manifest = await buildPodProductionProofManifest(input.format);
  const rendered = await renderPodProductionProofPdf(manifest);
  const pdfSha256 = await sha256Bytes(rendered.bytes);
  const id = await derivePodProductionProofArtifactId(input.format.print_format_id, rendered.proofSha256);
  const object = `pod-production-proofs/${input.format.print_format_id}/${rendered.proofSha256}/${pdfSha256}.pdf`;
  const metadata = proofMetadata({ proof_sha256: rendered.proofSha256, print_format_id: input.format.print_format_id, pdf_sha256: pdfSha256 });
  const existing = await store.readArtifact(id);
  if (existing) {
    if (existing.proof_sha256 !== rendered.proofSha256 || existing.pdf_sha256 !== pdfSha256 || existing.storage_object !== object
      || await hashPodProductionProofManifest(existing.proof_manifest) !== existing.proof_sha256) {
      throw new PodProductionProofError("pod_proof_artifact_firestore_conflict");
    }
    const verified = await verifyProofObject(storage, object, existing.storage_generation, pdfSha256, existing.size_bytes, metadata);
    assertRecordedProofMetadata(existing, verified.metadata);
    return { artifact: existing, bytes: verified.bytes, created: false };
  }
  let uploaded: PodPrintArtifactStorageMetadata;
  try {
    uploaded = await storage.createOnly(object, rendered.bytes, metadata);
  } catch (error) {
    if (!String(error).includes("precondition_failed")) throw error;
    try {
      uploaded = (await verifyProofObject(storage, object, undefined, pdfSha256, rendered.bytes.byteLength, metadata)).metadata;
    } catch {
      throw new PodProductionProofError("pod_proof_artifact_storage_conflict");
    }
  }
  const verified = await verifyProofObject(storage, object, uploaded.generation, pdfSha256, rendered.bytes.byteLength, metadata);
  const artifact: PodProductionProofArtifact = {
    id,
    proof_version: POD_PRODUCTION_PROOF_VERSION,
    proof_sha256: rendered.proofSha256,
    proof_manifest: manifest,
    print_format_id: input.format.print_format_id,
    pdf_sha256: pdfSha256,
    size_bytes: rendered.bytes.byteLength,
    storage_bucket: verified.metadata.bucket,
    storage_object: object,
    storage_generation: verified.metadata.generation,
    storage_metageneration: verified.metadata.metageneration,
    crc32c: verified.metadata.crc32c,
    md5_hash: verified.metadata.md5Hash,
    content_type: "application/pdf",
    status: "ready",
    immutable: true,
    created_at: input.createdAt,
    created_by: input.createdBy,
    schema_version: 1,
  };
  try {
    await store.createArtifact(id, artifact);
  } catch {
    const concurrent = await store.readArtifact(id);
    if (!concurrent || canonicalJson({ ...concurrent, created_at: "", created_by: "" }) !== canonicalJson({ ...artifact, created_at: "", created_by: "" })) {
      throw new PodProductionProofError("pod_proof_artifact_firestore_conflict");
    }
    return { artifact: concurrent, bytes: verified.bytes, created: false };
  }
  return { artifact, bytes: verified.bytes, created: true };
};

export const readPodProductionProofArtifact = async (storage: PodPrintArtifactStorage, store: PodProductionProofStore, artifactId: string) => {
  const artifact = await store.readArtifact(artifactId);
  if (!artifact || artifact.status !== "ready" || artifact.immutable !== true) throw new PodProductionProofError("pod_proof_artifact_not_found");
  if (await hashPodProductionProofManifest(artifact.proof_manifest) !== artifact.proof_sha256
    || artifact.proof_manifest.print_format_id !== artifact.print_format_id) {
    throw new PodProductionProofError("pod_proof_artifact_integrity_mismatch");
  }
  const verified = await verifyProofObject(storage, artifact.storage_object, artifact.storage_generation, artifact.pdf_sha256, artifact.size_bytes, proofMetadata(artifact));
  assertRecordedProofMetadata(artifact, verified.metadata);
  return { artifact, bytes: verified.bytes };
};

export const derivePodProductionProofApprovalId = async (artifactId: string, idempotencyKey: string) => {
  if (!artifactId.trim() || !idempotencyKey.trim() || idempotencyKey.length > 160) {
    throw new PodProductionProofError("pod_proof_approval_reference_invalid");
  }
  return `ppae-${await sha256Utf8(canonicalJson({ artifact_id: artifactId, idempotency_key: idempotencyKey }))}`;
};
