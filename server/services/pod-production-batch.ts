import { canonicalJson } from "../../src/lib/podPrintManifest.js";
import { readFrozenPodPrintManifest, type PodPrintManifestStore } from "../../src/lib/podPrintManifestPersistence.js";
import {
  verifyPodPrintAssetSet,
  type PodPrintAssetSetItem,
  type PodPrintAssetSetStore,
} from "../../src/lib/podPrintAssetSet.js";
import {
  POD_CUT_STACK_PROFILE_VERSION,
  PodProductionBatchError,
  planPodProductionBatch,
  type PodProductionBatchSourceItem,
} from "../../src/lib/podProductionBatch.js";
import type { PodPrintFormatConfig } from "../../src/lib/podImposition.js";
import { selectPodPrintFontAssets } from "../../src/lib/podPrintFonts.js";

export interface PodProductionBatchSelection {
  print_manifest_id: string;
  asset_set_id: string;
}

export interface PodProductionBatchSourceStores {
  manifestStore: PodPrintManifestStore;
  assetSetStore: PodPrintAssetSetStore;
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

const readAssetSet = async (store: PodPrintAssetSetStore, assetSetId: string) => {
  const header = await store.readHeader(assetSetId);
  if (!header || header.data.state !== "frozen") throw new PodProductionBatchError("pod_batch_asset_set_not_frozen");
  const items: PodPrintAssetSetItem[] = [];
  for (let chunkIndex = 0; chunkIndex < header.data.chunk_count; chunkIndex += 1) {
    const chunkId = `${assetSetId}-${String(chunkIndex).padStart(6, "0")}`;
    const chunk = await store.readChunk(chunkId);
    if (!chunk) throw new PodProductionBatchError("pod_batch_asset_set_chunk_missing");
    for (const itemId of chunk.item_ids) {
      const item = await store.readItem(itemId);
      if (!item) throw new PodProductionBatchError("pod_batch_asset_set_item_missing");
      items.push(item);
    }
  }
  return verifyPodPrintAssetSet(header.data, items);
};

export const assertPodProductionBatchAssetCoverage = (
  positionIds: string[],
  renderInputHashes: Map<string, string>,
  assets: PodPrintAssetSetItem[],
  requiredFontKeys: readonly string[],
) => {
  const sharedAssets = [
    { role: "postcard_front_template", key: "postcard-front-template" },
    { role: "postcard_back_template", key: "postcard-back-template" },
    ...requiredFontKeys.map((key) => ({ role: "print_font", key })),
  ] as const;
  for (const sharedAsset of sharedAssets) {
    if (assets.filter((asset) => asset.asset_role === sharedAsset.role
      && asset.shared_key === sharedAsset.key
      && asset.print_job_item_id === null).length !== 1) {
      throw new PodProductionBatchError(`pod_batch_asset_coverage_mismatch:${sharedAsset.key}`);
    }
  }
  for (const itemId of positionIds) {
    for (const role of ["postcard_front_photo", "country_flag", "qr_raster"] as const) {
      const matches = assets.filter((asset) => asset.asset_role === role && asset.print_job_item_id === itemId);
      if (matches.length !== 1 || matches[0].render_input_sha256 !== renderInputHashes.get(itemId)) {
        throw new PodProductionBatchError(`pod_batch_asset_coverage_mismatch:${role}:${itemId}`);
      }
    }
  }
};

export const loadPodProductionBatchPlan = async (
  stores: PodProductionBatchSourceStores,
  selections: readonly PodProductionBatchSelection[],
) => {
  if (!selections.length) throw new PodProductionBatchError("pod_batch_selections_required");
  const selectionKeys = new Set<string>();
  const orderedSelections = [...selections].sort((left, right) => compareText(left.print_manifest_id, right.print_manifest_id)
    || compareText(left.asset_set_id, right.asset_set_id));
  const sourceItems: PodProductionBatchSourceItem[] = [];
  const formatsById = new Map<string, PodPrintFormatConfig>();

  for (const selection of orderedSelections) {
    if (!selection.print_manifest_id.trim() || !selection.asset_set_id.trim()) {
      throw new PodProductionBatchError("pod_batch_selection_identifier_required");
    }
    const selectionKey = `${selection.print_manifest_id}:${selection.asset_set_id}`;
    if (selectionKeys.has(selectionKey)) throw new PodProductionBatchError("pod_batch_selection_duplicate");
    selectionKeys.add(selectionKey);

    const [manifest, assetSet] = await Promise.all([
      readFrozenPodPrintManifest(stores.manifestStore, selection.print_manifest_id),
      readAssetSet(stores.assetSetStore, selection.asset_set_id),
    ]);
    if (!manifest) throw new PodProductionBatchError("pod_batch_source_manifest_missing");
    if (assetSet.header.manifest_id !== manifest.header.id
      || assetSet.header.manifest_sha256 !== manifest.header.manifest_sha256) {
      throw new PodProductionBatchError("pod_batch_asset_set_manifest_mismatch");
    }
    const positions = manifest.manifest.format_groups.flatMap((group) => group.items);
    const renderInputHashes = new Map(positions.map((position) => [position.print_job_item_id, position.render_input_sha256]));
    const requiredFontKeys = selectPodPrintFontAssets(manifest.manifest).map((font) => font.key);
    assertPodProductionBatchAssetCoverage(
      positions.map((position) => position.print_job_item_id),
      renderInputHashes,
      assetSet.items,
      requiredFontKeys,
    );

    for (const group of manifest.manifest.format_groups) {
      const existingFormat = formatsById.get(group.print_format_id);
      if (existingFormat && canonicalJson(existingFormat) !== canonicalJson(group.print_format)) {
        throw new PodProductionBatchError(`pod_batch_format_configuration_conflict:${group.print_format_id}`);
      }
      formatsById.set(group.print_format_id, group.print_format);
      for (const position of group.items) {
        sourceItems.push({
          pod_job_id: position.pod_job_id,
          print_job_id: manifest.header.batch_id,
          print_job_item_id: position.print_job_item_id,
          inventory_unit_id: position.inventory_unit_id,
          source_order_id: position.source_order_id,
          card_design_id: position.card_design_id,
          print_manifest_id: manifest.header.id,
          print_manifest_sha256: manifest.header.manifest_sha256,
          print_manifest_state: manifest.header.state,
          asset_set_id: assetSet.header.id,
          asset_set_sha256: assetSet.header.asset_set_sha256,
          asset_set_state: assetSet.header.state,
          render_profile_version: assetSet.header.render_profile_version,
          render_profile_sha256: assetSet.header.render_profile_sha256,
          render_input_sha256: position.render_input_sha256,
          print_format_id: group.print_format_id,
          format_source: position.format_source || "legacy_fallback_v1",
          algorithm_version: manifest.header.algorithm_version,
          cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
          sequence_index: position.sequence_index,
          batch_order_index: position.batch_order_index,
          primary_language_code: position.primary_language_code,
          secondary_language_code: position.secondary_language_code,
        });
      }
    }
  }
  return planPodProductionBatch(sourceItems, Array.from(formatsById.values()));
};

export const verifyPodProductionBatchSources = async (
  stores: PodProductionBatchSourceStores,
  selections: readonly PodProductionBatchSelection[],
  expectedBatchId: string,
  expectedBatchSha256: string,
) => {
  const fresh = await loadPodProductionBatchPlan(stores, selections);
  if (fresh.batch_id !== expectedBatchId || fresh.batch_sha256 !== expectedBatchSha256) {
    throw new PodProductionBatchError("pod_batch_source_changed_during_freeze");
  }
  return fresh;
};
