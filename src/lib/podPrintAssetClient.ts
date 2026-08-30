import { backendApiUrl } from "./backendApi";
import { auth } from "@/integrations/firebase/config";
import { sha256Bytes } from "./podPrintArtifact";
import {
  verifyPodPrintAssetSet,
  type PodPrintAssetSetChunk,
  type PodPrintAssetSetHeader,
  type PodPrintAssetSetItem,
  type PodPrintAssetRole,
} from "./podPrintAssetSet";
import { hashPodRenderProfile, POD_RENDER_PROFILE } from "./podRenderProfile";
import { canonicalJson, sha256Utf8 } from "./podPrintManifest";

export interface LoadedPodPrintAssets {
  header: PodPrintAssetSetHeader;
  items: PodPrintAssetSetItem[];
  urlFor(role: PodPrintAssetRole, printJobItemId?: string): string;
  dispose(): void;
}

const post = async <T,>(token: string, body: Record<string, unknown>) => {
  const response = await fetch(backendApiUrl("/api/pod/print-assets"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok || !result) throw new Error(result?.error || "pod_asset_set_request_failed");
  return result;
};

const loadVerifiedBytes = async (token: string, header: PodPrintAssetSetHeader, item: PodPrintAssetSetItem) => {
  const query = new URLSearchParams({ asset_set_id: header.id, item_id: item.id });
  const response = await fetch(`${backendApiUrl("/api/pod/print-assets")}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error || "pod_asset_download_failed");
  }
  if (response.headers.get("X-POD-Storage-Generation") !== item.storage_generation) {
    throw new Error("pod_asset_generation_mismatch");
  }
  if (response.headers.get("X-POD-Asset-SHA256") !== item.sha256
    || response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== item.content_type) {
    throw new Error("pod_asset_response_metadata_mismatch");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== item.size_bytes || await sha256Bytes(bytes) !== item.sha256) {
    throw new Error("pod_asset_hash_mismatch");
  }
  return bytes;
};

const loadFrozenPodPrintAssetsFromHeader = async (token: string, header: PodPrintAssetSetHeader): Promise<LoadedPodPrintAssets> => {
  const frozen = { header };
  const itemIds: string[] = [];
  for (let chunkIndex = 0; chunkIndex < frozen.header.chunk_count; chunkIndex += 1) {
    const result = await post<{ chunk: PodPrintAssetSetChunk }>(token, {
      operation: "get_chunk",
      asset_set_id: frozen.header.id,
      chunk_index: chunkIndex,
    });
    const chunkPayload = { asset_set_id: frozen.header.id, chunk_index: chunkIndex, item_ids: result.chunk.item_ids };
    if (result.chunk.id !== `${frozen.header.id}-${String(chunkIndex).padStart(6, "0")}`
      || result.chunk.chunk_sha256 !== await sha256Utf8(canonicalJson(chunkPayload))) {
      throw new Error("pod_asset_set_chunk_hash_mismatch");
    }
    itemIds.push(...result.chunk.item_ids);
  }
  if (itemIds.length !== frozen.header.item_count || new Set(itemIds).size !== itemIds.length) {
    throw new Error("pod_asset_set_item_count_mismatch");
  }
  const items: PodPrintAssetSetItem[] = [];
  for (const itemId of itemIds) {
    const result = await post<{ item: PodPrintAssetSetItem }>(token, {
      operation: "get_item",
      asset_set_id: frozen.header.id,
      item_id: itemId,
    });
    items.push(result.item);
  }
  const sharedHash = (key: string) => {
    const item = items.find((candidate) => candidate.shared_key === key);
    if (!item) throw new Error(`pod_asset_missing:${key}`);
    return item.sha256;
  };
  const expectedProfileHash = await hashPodRenderProfile({
    postcard_front_template: sharedHash("postcard-front-template"),
    postcard_back_template: sharedHash("postcard-back-template"),
    inter_300: sharedHash("inter-300"),
    inter_400: sharedHash("inter-400"),
    patrick_hand_400: sharedHash("patrick-hand-400"),
  });
  if (frozen.header.render_profile_sha256 !== expectedProfileHash) throw new Error("pod_asset_render_profile_mismatch");
  await verifyPodPrintAssetSet(frozen.header, items);

  const objectUrls = new Map<string, string>();
  const loadedFonts: FontFace[] = [];
  try {
    for (const item of items) {
      const bytes = await loadVerifiedBytes(token, frozen.header, item);
      if (item.asset_role === "print_font") {
        if (!item.font_family || !item.font_weight || !item.font_style) throw new Error("pod_asset_font_metadata_missing");
        const face = new FontFace(item.font_family, Uint8Array.from(bytes).buffer, {
          weight: item.font_weight,
          style: item.font_style,
        });
        await face.load();
        document.fonts.add(face);
        loadedFonts.push(face);
      } else {
        objectUrls.set(item.id, URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: item.content_type })));
      }
    }
    for (const font of POD_RENDER_PROFILE.fonts) {
      if (!document.fonts.check(`${font.weight} 16px "${font.family}"`)) throw new Error(`pod_asset_font_unavailable:${font.key}`);
    }
    await document.fonts.ready;
  } catch (error) {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    loadedFonts.forEach((face) => document.fonts.delete(face));
    throw error;
  }

  return {
    header: frozen.header,
    items,
    urlFor: (role, printJobItemId) => {
      const item = items.find((candidate) => candidate.asset_role === role
        && (printJobItemId ? candidate.print_job_item_id === printJobItemId : candidate.print_job_item_id === null));
      const url = item ? objectUrls.get(item.id) : null;
      if (!url) throw new Error(`pod_asset_role_missing:${role}:${printJobItemId || "shared"}`);
      return url;
    },
    dispose: () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      loadedFonts.forEach((face) => document.fonts.delete(face));
    },
  };
};

export const loadFrozenPodPrintAssetsById = async (assetSetId: string): Promise<LoadedPodPrintAssets> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Do odczytu zasobów POD wymagane jest konto administratora.");
  const result = await post<{ header: PodPrintAssetSetHeader }>(token, { operation: "get_header", asset_set_id: assetSetId });
  return loadFrozenPodPrintAssetsFromHeader(token, result.header);
};

export const loadFrozenPodPrintAssets = async (manifestId: string): Promise<LoadedPodPrintAssets> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Do zamrożenia zasobów POD wymagane jest konto administratora.");
  const frozen = await post<{ header: PodPrintAssetSetHeader }>(token, { operation: "freeze", manifest_id: manifestId });
  return loadFrozenPodPrintAssetsFromHeader(token, frozen.header);
};
