import { jsPDF } from "jspdf";
import { auth } from "@/integrations/firebase/config";
import { backendApiUrl } from "@/lib/backendApi";
import { hashPodPrintRenderInput, type PodPrintRenderInput } from "@/lib/podPrintManifest";
import type { PodProductionBatchManifest, PodProductionBatchPosition } from "@/lib/podProductionBatch";
import { derivePodProductionBatchArtifactId } from "@/lib/podProductionBatchArtifact";
import type { LoadedPodPrintAssets } from "@/lib/podPrintAssetClient";
import { applyDeterministicPodPdfMetadata, podPdfBytes } from "@/lib/podPdfMetadata";
import { drawPodCropMarks, renderPodPostcardSide, type CardDesignData } from "@/lib/generatePodPrintPdf";

export interface PodProductionBatchRenderSources {
  renderInputs: ReadonlyMap<string, PodPrintRenderInput>;
  assetsBySetId: ReadonlyMap<string, LoadedPodPrintAssets>;
  dispose(): void;
}

export interface PodProductionBatchPdfResult {
  artifactId: string;
  batchId: string;
  groupIndex: number;
  downloadUrl: string;
  reprinted: boolean;
}

const download = (bytes: ArrayBuffer, fileName: string) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return url;
};

const assertPositionSource = async (
  position: PodProductionBatchPosition,
  sources: PodProductionBatchRenderSources,
) => {
  const renderInput = sources.renderInputs.get(position.print_job_item_id);
  if (!renderInput) {
    throw new Error(`pod_batch_render_input_missing:${position.print_job_item_id}`);
  }
  const renderInputSha256 = await hashPodPrintRenderInput(renderInput);
  if (renderInputSha256 !== position.render_input_sha256) {
    throw new Error(`pod_batch_render_input_hash_mismatch:${position.print_job_item_id}`);
  }
  const assets = sources.assetsBySetId.get(position.asset_set_id);
  if (!assets || assets.header.id !== position.asset_set_id
    || assets.header.asset_set_sha256 !== position.asset_set_sha256
    || assets.header.render_profile_version !== position.render_profile_version
    || assets.header.render_profile_sha256 !== position.render_profile_sha256) {
    throw new Error(`pod_batch_render_asset_set_mismatch:${position.print_job_item_id}`);
  }
  const itemAssets = assets.items.filter((asset) => asset.print_job_item_id === position.print_job_item_id);
  if (itemAssets.some((asset) => asset.render_input_sha256 !== null
    && asset.render_input_sha256 !== renderInputSha256)) {
    throw new Error(`pod_batch_render_input_hash_mismatch:${position.print_job_item_id}`);
  }
  return { renderInput, assets };
};

export const generatePodProductionBatchGroupPdf = async (
  manifest: PodProductionBatchManifest,
  groupIndex: number,
  loadSources: () => Promise<PodProductionBatchRenderSources>,
): Promise<PodProductionBatchPdfResult> => {
  const group = manifest.groups[groupIndex];
  if (!group || group.group_index !== groupIndex) throw new Error("pod_batch_render_group_missing");
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Do przygotowania batcha POD wymagane jest konto administratora.");
  const artifactId = await derivePodProductionBatchArtifactId(manifest.batch_id, groupIndex);
  const artifactUrl = `${backendApiUrl("/api/pod/production-batch-artifact")}?${new URLSearchParams({ artifact_id: artifactId })}`;
  const existing = await fetch(artifactUrl, { headers: { Authorization: `Bearer ${token}` } });
  const fileName = `${manifest.batch_id}-group-${String(groupIndex).padStart(4, "0")}.pdf`;
  if (existing.ok) {
    return {
      artifactId,
      batchId: manifest.batch_id,
      groupIndex,
      downloadUrl: download(await existing.arrayBuffer(), fileName),
      reprinted: true,
    };
  }
  const failure = await existing.json().catch(() => null) as { error?: string } | null;
  if (existing.status !== 404 || failure?.error !== "pod_batch_artifact_not_found") {
    throw new Error(failure?.error || "pod_batch_artifact_lookup_failed");
  }

  const sources = await loadSources();
  try {
    const shortEdge = Math.min(group.print_format.netWidthMm, group.print_format.netHeightMm);
    const longEdge = Math.max(group.print_format.netWidthMm, group.print_format.netHeightMm);
    const grossWidthMm = (group.print_format.orientation === "landscape" ? longEdge : shortEdge) + group.print_format.bleedMm * 2;
    const grossHeightMm = (group.print_format.orientation === "landscape" ? shortEdge : longEdge) + group.print_format.bleedMm * 2;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [group.sheet_width_mm, group.sheet_height_mm],
      compress: true,
      putOnlyUsedFonts: true,
    });
    applyDeterministicPodPdfMetadata(pdf, { manifestSha256: manifest.batch_sha256, documentNumber: `${manifest.batch_id}-${groupIndex}` });
    for (let sheetIndex = 0; sheetIndex < group.sheet_count; sheetIndex += 1) {
      if (sheetIndex > 0) pdf.addPage([group.sheet_width_mm, group.sheet_height_mm], "portrait");
      const positions = group.slots.filter((slot): slot is PodProductionBatchPosition =>
        slot.kind === "position" && slot.sheet_index === sheetIndex);
      const rendered: Array<{ position: PodProductionBatchPosition; front: string; back: string }> = [];
      for (const position of positions) {
        const { renderInput, assets } = await assertPositionSource(position, sources);
        const design: CardDesignData = {
          id: position.card_design_id,
          country_id: "frozen-production-batch",
          country_iso2: null,
          country_flag_url: assets.urlFor("country_flag", position.print_job_item_id),
          image_front_url: assets.urlFor("postcard_front_photo", position.print_job_item_id),
          photo_author: renderInput.photo_author,
          thank_you_text: renderInput.front_text,
          back_qr_label: renderInput.back_qr_label,
          crop_settings: renderInput.crop_settings,
        };
        const qr = assets.urlFor("qr_raster", position.print_job_item_id);
        rendered.push({
          position,
          front: await renderPodPostcardSide("front", design, qr, grossWidthMm, grossHeightMm, assets),
          back: await renderPodPostcardSide("back", design, qr, grossWidthMm, grossHeightMm, assets),
        });
      }
      for (const entry of rendered) {
        const artwork = entry.position.front_coordinates.artwork;
        pdf.addImage(entry.front, "JPEG", artwork.x, artwork.y, artwork.width, artwork.height,
          `front-${entry.position.print_job_item_id}`, "FAST");
        drawPodCropMarks(pdf, entry.position.front_coordinates);
      }
      pdf.addPage([group.sheet_width_mm, group.sheet_height_mm], "portrait");
      for (const entry of rendered) {
        const artwork = entry.position.back_coordinates.artwork;
        pdf.addImage(entry.back, "PNG", artwork.x, artwork.y, artwork.width, artwork.height,
          `back-${entry.position.print_job_item_id}`, "FAST");
        drawPodCropMarks(pdf, entry.position.back_coordinates);
      }
    }
    const bytes = podPdfBytes(pdf);
    const createUrl = `${backendApiUrl("/api/pod/production-batch-artifact")}?${new URLSearchParams({
      batch_id: manifest.batch_id,
      group_index: String(groupIndex),
    })}`;
    const archived = await fetch(createUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" },
      body: bytes,
    });
    const archive = await archived.json().catch(() => null) as { artifact_id?: string; error?: string } | null;
    if (!archived.ok || !archive?.artifact_id) throw new Error(archive?.error || "pod_batch_artifact_archive_failed");
    const canonical = await fetch(`${backendApiUrl("/api/pod/production-batch-artifact")}?${new URLSearchParams({ artifact_id: archive.artifact_id })}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!canonical.ok) throw new Error("pod_batch_artifact_reprint_failed");
    return {
      artifactId: archive.artifact_id,
      batchId: manifest.batch_id,
      groupIndex,
      downloadUrl: download(await canonical.arrayBuffer(), fileName),
      reprinted: false,
    };
  } finally {
    sources.dispose();
  }
};
