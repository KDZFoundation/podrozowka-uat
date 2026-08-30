import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { auth } from "@/integrations/firebase/config";
import { backendApiUrl } from "@/lib/backendApi";
import { PostcardFront, type CropSettings } from "@/components/postcard/PostcardFront";
import { PostcardBack } from "@/components/postcard/PostcardBack";
import type { PodImpositionSideCoordinates } from "@/lib/podImposition";
import {
  canonicalJson,
  type PodPrintManifestItem,
} from "@/lib/podPrintManifest";
import {
  reconstructAndVerifyPodPrintManifest,
  type PodPrintManifestChunk,
  type PodPrintManifestHeader,
  type FrozenPodPrintManifest,
} from "@/lib/podPrintManifestPersistence";
import { applyDeterministicPodPdfMetadata, podPdfBytes, POD_PDF_RENDERER_VERSION } from "@/lib/podPdfMetadata";
import { derivePodPrintArtifactId } from "@/lib/podPrintArtifact";
import { derivePodPrintAssetSetId } from "@/lib/podPrintAssetSet";
import { loadFrozenPodPrintAssets, type LoadedPodPrintAssets } from "@/lib/podPrintAssetClient";
import { POD_RENDER_PROFILE } from "@/lib/podRenderProfile";

const RENDER_WIDTH_PX = POD_RENDER_PROFILE.raster.render_width_px;
// 520 CSS pixels * 3.5 / 154 mm = 300 dpi on the imposed bleed area.
const RENDER_SCALE = POD_RENDER_PROFILE.raster.render_scale;
const normalizeLanguageCode = (value?: string | null) => value?.trim().toLowerCase() || "";
export const podLanguageTemplateKey = (countryId: string, languageCode?: string | null) =>
  `${countryId}:${normalizeLanguageCode(languageCode)}`;

export interface CardDesignData {
  id: string;
  country_id: string;
  country_iso2?: string | null;
  country_flag_url?: string | null;
  image_front_url: string | null;
  photo_author: string | null;
  thank_you_text: string | null;
  back_qr_label: string | null;
  crop_settings: unknown;
}

interface RenderedPodItem {
  id: string;
  front: string;
  back: string;
  placement: PodPrintManifestItem;
}

export interface PodPrintPdfResult {
  fileName: string;
  downloadUrl: string;
  itemCount: number;
  sheetCount: number;
}

const parseCropSettings = (value: unknown): CropSettings => {
  if (!value) return { fit: "auto", zoom: 100, x: 50, y: 50 };
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as CropSettings;
    } catch {
      return { fit: "auto", zoom: 100, x: 50, y: 50 };
    }
  }
  return value as CropSettings;
};

const waitForImages = async (container: HTMLElement) => {
  const images = Array.from(container.querySelectorAll("img"));
  const loading = Promise.all(
    images.map((image) => {
      if (!image.src.startsWith("blob:")) return Promise.reject(new Error("pod_asset_renderer_non_frozen_image"));
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      if (image.complete) return Promise.reject(new Error("pod_asset_renderer_image_invalid"));
      return new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => reject(new Error(`Nie udało się wczytać obrazu: ${image.src}`)), { once: true });
      });
    }),
  );
  await Promise.race([
    loading,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Przekroczono czas wczytywania grafiki wzoru.")), 20_000);
    }),
  ]);
};

const assertFrozenCssUrls = (container: HTMLElement) => {
  for (const element of [container, ...Array.from(container.querySelectorAll<HTMLElement>("*"))]) {
    const backgroundImage = window.getComputedStyle(element).backgroundImage;
    const urls = Array.from(backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g), (match) => match[1]);
    if (urls.some((url) => !url.startsWith("blob:"))) throw new Error("pod_asset_renderer_non_frozen_css_url");
  }
};

export const renderPodPostcardSide = async (
  side: "front" | "back",
  design: CardDesignData,
  qrCodeDataUrl: string,
  grossWidthMm: number,
  grossHeightMm: number,
  assets: LoadedPodPrintAssets,
  fontFamilies: { body: string; handwriting: string },
): Promise<string> => {
  const renderHeightPx = Math.round(RENDER_WIDTH_PX * grossHeightMm / grossWidthMm);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_WIDTH_PX}px`,
    height: `${renderHeightPx}px`,
    background: "#ffffff",
    zIndex: "-1",
  });
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(
    side === "front" ? (
      <PostcardFront
        imageUrl={design.image_front_url}
        photoAuthor={design.photo_author}
        contentText={design.thank_you_text}
        cropSettings={parseCropSettings(design.crop_settings)}
        showCropMarks={false}
        printMode
        templateUrl={assets.urlFor("postcard_front_template")}
        bodyFontFamily={fontFamilies.body}
        handwritingFontFamily={fontFamilies.handwriting}
        className="w-full h-full"
      />
    ) : (
      <PostcardBack
        backQrLabel={design.back_qr_label}
        countryIso2={design.country_iso2}
        countryFlagUrl={design.country_flag_url}
        qrCodeUrl={qrCodeDataUrl}
        showCropMarks={false}
        printMode
        templateUrl={assets.urlFor("postcard_back_template")}
        bodyFontFamily={fontFamilies.body}
        className="w-full h-full"
      />
    ),
  );

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await document.fonts?.ready;
    assertFrozenCssUrls(host);
    await waitForImages(host);
    const canvas = await html2canvas(host, {
      backgroundColor: POD_RENDER_PROFILE.raster.background_color,
      width: RENDER_WIDTH_PX,
      height: renderHeightPx,
      scale: RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      imageTimeout: POD_RENDER_PROFILE.raster.image_timeout_ms,
      windowWidth: RENDER_WIDTH_PX,
      windowHeight: renderHeightPx,
      scrollX: POD_RENDER_PROFILE.raster.scroll_x,
      scrollY: POD_RENDER_PROFILE.raster.scroll_y,
      foreignObjectRendering: POD_RENDER_PROFILE.raster.foreign_object_rendering,
      logging: POD_RENDER_PROFILE.raster.logging,
      removeContainer: POD_RENDER_PROFILE.raster.remove_container,
      proxy: POD_RENDER_PROFILE.raster.proxy || undefined,
    });
    return side === "front" ? canvas.toDataURL("image/jpeg", POD_RENDER_PROFILE.raster.jpeg_quality) : canvas.toDataURL("image/png");
  } finally {
    root.unmount();
    host.remove();
  }
};

export const drawPodCropMarks = (doc: jsPDF, coordinates: PodImpositionSideCoordinates) => {
  const { artwork, trim } = coordinates;
  const left = trim.x;
  const right = trim.x + trim.width;
  const top = trim.y;
  const bottom = trim.y + trim.height;
  // The artwork includes the configured bleed. Keep crop marks a further 2.5 mm
  // outside that artwork, so no line visually enters the photo at a corner.
  const artworkClearance = 2.5;

  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.12);

  doc.line(artwork.x, top, artwork.x - artworkClearance, top);
  doc.line(artwork.x + artwork.width + artworkClearance, top, artwork.x + artwork.width, top);
  doc.line(artwork.x, bottom, artwork.x - artworkClearance, bottom);
  doc.line(artwork.x + artwork.width + artworkClearance, bottom, artwork.x + artwork.width, bottom);
  doc.line(left, artwork.y, left, artwork.y - artworkClearance);
  doc.line(left, artwork.y + artwork.height + artworkClearance, left, artwork.y + artwork.height);
  doc.line(right, artwork.y, right, artwork.y - artworkClearance);
  doc.line(right, artwork.y + artwork.height + artworkClearance, right, artwork.y + artwork.height);
};

const addSideToSheet = (
  doc: jsPDF,
  items: RenderedPodItem[],
  side: "front" | "back",
) => {
  items.forEach((item) => {
    const coordinates = side === "front" ? item.placement.front_coordinates : item.placement.back_coordinates;
    const { artwork } = coordinates;
    const data = side === "front" ? item.front : item.back;
    const format = side === "front" ? "JPEG" : "PNG";
    doc.addImage(data, format, artwork.x, artwork.y, artwork.width, artwork.height, `${side}-${item.id}`, "FAST");
    drawPodCropMarks(doc, coordinates);
  });
};

const requestFrozenManifest = async (
  printJobIds: string[],
  batchId: string,
): Promise<FrozenPodPrintManifest> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Do przygotowania manifestu POD wymagane jest konto administratora.");
  const call = async <T,>(operation: "get_header" | "get_chunk" | "freeze", chunkIndex?: number) => {
    const response = await fetch(backendApiUrl("/api/pod/print-manifest"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation,
        batch_id: batchId,
        batch_revision: "1",
        print_job_ids: printJobIds,
        ...(chunkIndex === undefined ? {} : { chunk_index: chunkIndex }),
      }),
    });
    const body = await response.json().catch(() => null) as T & { error?: string } | null;
    return { response, body };
  };
  let result = await call<{ header: PodPrintManifestHeader }>("get_header");
  if (result.response.status === 404
    || (result.response.status === 422 && result.body?.error?.startsWith("manifest_not_frozen:"))) {
    result = await call<{ header: PodPrintManifestHeader }>("freeze");
  }
  if (!result.response.ok || !result.body) throw new Error(result.body?.error || "Nie udało się zamrozić manifestu POD.");
  const chunks: PodPrintManifestChunk[] = [];
  for (let chunkIndex = 0; chunkIndex < result.body.header.chunk_count; chunkIndex += 1) {
    const page = await call<{ chunk: PodPrintManifestChunk }>("get_chunk", chunkIndex);
    if (!page.response.ok || !page.body) throw new Error(page.body?.error || `Nie udało się pobrać fragmentu ${chunkIndex} manifestu POD.`);
    chunks.push(page.body.chunk);
  }
  return reconstructAndVerifyPodPrintManifest(result.body.header, chunks);
};

const generatePodPrintPdfForJobs = async (
  printJobIds: string[],
  documentNumber: string,
): Promise<PodPrintPdfResult> => {
  if (printJobIds.length === 0) throw new Error("No POD print jobs selected.");
  const frozen = await requestFrozenManifest(printJobIds, documentNumber);
  const manifest = frozen.manifest;
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Do pobrania artefaktu PDF POD wymagane jest konto administratora.");
  const documentFilePrefix = /^(POD|MAG)-/.test(documentNumber) ? documentNumber : `POD-${documentNumber}`;
  const fileName = `${documentFilePrefix}-SRA3.pdf`;
  const assetSetId = await derivePodPrintAssetSetId(frozen.header.manifest_sha256);
  const artifactIds = [
    await derivePodPrintArtifactId(documentNumber, frozen.header.manifest_sha256, assetSetId),
    await derivePodPrintArtifactId(documentNumber, frozen.header.manifest_sha256),
  ];
  for (const artifactId of artifactIds) {
    const existingUrl = `${backendApiUrl("/api/pod/print-artifact")}?${new URLSearchParams({ artifact_id: artifactId })}`;
    const existingResponse = await fetch(existingUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (existingResponse.ok) {
      const downloadUrl = URL.createObjectURL(new Blob([await existingResponse.arrayBuffer()], { type: "application/pdf" }));
      const downloadLink = document.createElement("a");
      downloadLink.href = downloadUrl;
      downloadLink.download = fileName;
      downloadLink.style.display = "none";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      return { fileName, downloadUrl, itemCount: manifest.postcard_count, sheetCount: manifest.sheet_count };
    }
    const existingFailure = await existingResponse.json().catch(() => null) as { error?: string } | null;
    if (existingResponse.status !== 404 || existingFailure?.error !== "pod_artifact_not_found") {
      throw new Error(existingFailure?.error || "Nie udało się sprawdzić kanonicznego PDF POD.");
    }
  }
  const frozenAssets = await loadFrozenPodPrintAssets(frozen.header.id);
  const renderedFronts = new Map<string, string>();
  const initialFormat = manifest.format_groups[0].print_format;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [initialFormat.sheetWidthMm, initialFormat.sheetHeightMm],
    compress: true,
    putOnlyUsedFonts: true,
  });
  applyDeterministicPodPdfMetadata(pdf, { manifestSha256: frozen.header.manifest_sha256, documentNumber });

  let generatedBytes: Uint8Array;
  try {
  // Render one SRA3 sheet at a time. A physical stock order may contain
  // thousands of cards; retaining every front/back canvas in memory would
  // exhaust the browser before the PDF could be written.
  let renderedSheetCount = 0;
  for (const group of manifest.format_groups) {
    for (let sheetIndex = 0; sheetIndex < group.sheet_count; sheetIndex += 1) {
      const sourcePlacements = group.items.filter((placement) => placement.sheet_index === sheetIndex);
      const sheetItems: RenderedPodItem[] = [];

      for (const placement of sourcePlacements) {
        const input = placement.render_input;
        const fontFamilies = frozenAssets.fontFamiliesFor(placement);
        const qrCodeDataUrl = frozenAssets.urlFor("qr_raster", placement.print_job_item_id);
        const hasFlag = frozenAssets.items.some((asset) => asset.asset_role === "country_flag" && asset.print_job_item_id === placement.print_job_item_id);
        const printDesign: CardDesignData = {
          id: placement.card_design_id,
          country_id: "frozen-manifest",
          country_iso2: null,
          country_flag_url: hasFlag ? frozenAssets.urlFor("country_flag", placement.print_job_item_id) : null,
          image_front_url: input.image_front_url ? frozenAssets.urlFor("postcard_front_photo", placement.print_job_item_id) : null,
          photo_author: input.photo_author,
          thank_you_text: input.front_text,
          back_qr_label: input.back_qr_label,
          crop_settings: input.crop_settings,
        };
        const frontCacheKey = `${group.print_format_id}:${canonicalJson({
          crop_settings: input.crop_settings,
          front_text: input.front_text,
          image_front_url: input.image_front_url,
          image_version: input.image_version,
          photo_author: input.photo_author,
          font_families: fontFamilies,
        })}`;
        let front = renderedFronts.get(frontCacheKey);
        if (!front) {
          front = await renderPodPostcardSide("front", printDesign, qrCodeDataUrl, group.gross_width_mm, group.gross_height_mm, frozenAssets, fontFamilies);
          renderedFronts.set(frontCacheKey, front);
        }
        sheetItems.push({
          id: placement.print_job_item_id,
          front,
          back: await renderPodPostcardSide("back", printDesign, qrCodeDataUrl, group.gross_width_mm, group.gross_height_mm, frozenAssets, fontFamilies),
          placement,
        });
      }

      if (renderedSheetCount > 0) pdf.addPage([group.print_format.sheetWidthMm, group.print_format.sheetHeightMm], "portrait");
      addSideToSheet(pdf, sheetItems, "front");
      pdf.addPage([group.print_format.sheetWidthMm, group.print_format.sheetHeightMm], "portrait");
      addSideToSheet(pdf, sheetItems, "back");
      renderedSheetCount += 1;
    }
  }

    generatedBytes = podPdfBytes(pdf);
  } finally {
    frozenAssets.dispose();
  }
  const createQuery = new URLSearchParams({
    manifest_id: frozen.header.id,
    print_job_id: documentNumber,
    renderer_version: POD_PDF_RENDERER_VERSION,
    asset_set_id: frozenAssets.header.id,
  });
  const createUrl = `${backendApiUrl("/api/pod/print-artifact")}?${createQuery}`;
  const archiveResponse = await fetch(createUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" },
    body: generatedBytes,
  });
  const archive = await archiveResponse.json().catch(() => null) as { artifact_id?: string; error?: string } | null;
  if (!archiveResponse.ok || !archive?.artifact_id) throw new Error(archive?.error || "Nie udało się zarchiwizować kanonicznego PDF POD.");
  const reprintUrl = `${backendApiUrl("/api/pod/print-artifact")}?${new URLSearchParams({ artifact_id: archive.artifact_id })}`;
  const canonicalResponse = await fetch(reprintUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!canonicalResponse.ok) {
    const failure = await canonicalResponse.json().catch(() => null) as { error?: string } | null;
    throw new Error(failure?.error || "Nie udało się pobrać kanonicznego PDF POD.");
  }
  const pdfBlob = new Blob([await canonicalResponse.arrayBuffer()], { type: "application/pdf" });
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  downloadLink.style.display = "none";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  return { fileName, downloadUrl, itemCount: manifest.postcard_count, sheetCount: manifest.sheet_count };
};

export const generatePodPrintPdf = (printJobId: string, orderNumber: string) =>
  generatePodPrintPdfForJobs([printJobId], orderNumber);

export const generatePodBatchPrintPdf = (printJobIds: string[], batchNumber: string) =>
  generatePodPrintPdfForJobs(printJobIds, batchNumber);
