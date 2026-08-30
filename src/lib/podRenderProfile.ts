import { canonicalJson, sha256Utf8 } from "./podPrintManifest";
import { POD_PDF_RENDERER_VERSION } from "./podPdfMetadata";
import { POD_FONT_REGISTRY_VERSION } from "./podFontRegistry.generated";

export const POD_PRINT_ASSET_SET_VERSION = 2 as const;
export const POD_RENDER_PROFILE_VERSION = "pod-render-profile-v2" as const;

export const POD_RENDER_PROFILE = {
  asset_set_version: POD_PRINT_ASSET_SET_VERSION,
  render_profile_version: POD_RENDER_PROFILE_VERSION,
  renderer_version: POD_PDF_RENDERER_VERSION,
  renderer_layout_version: "postcard-front-back-v2-multiscript",
  libraries: {
    html2canvas: "1.4.1",
    jspdf: "4.2.1",
    qrcode: "1.5.4",
  },
  raster: {
    render_width_px: 520,
    render_scale: 3.5,
    height_calculation_version: "gross-ratio-round-v1",
    background_color: "#ffffff",
    image_timeout_ms: 20_000,
    allow_taint: false,
    use_cors: true,
    scroll_x: 0,
    scroll_y: 0,
    foreign_object_rendering: false,
    logging: false,
    remove_container: true,
    proxy: null,
    jpeg_quality: 0.96,
  },
  qr: {
    algorithm_version: "qrcode-1.5.4-png-v1",
    width: 600,
    margin: 3,
    error_correction_level: "M",
    content_type: "image/png",
  },
  fonts: {
    registry_version: POD_FONT_REGISTRY_VERSION,
    selection_algorithm_version: "unicode-script-and-language-v1",
    body_family: "PodNotoSansV2",
    handwriting_family: "PodPatrickHandV2",
    source: "fontsource-cdn-pinned-sha256",
  },
  templates: [
    { key: "postcard-front-template", role: "postcard_front_template", source: "src/assets/postcard-templates/canva-front-base.png" },
    { key: "postcard-back-template", role: "postcard_back_template", source: "src/assets/postcard-templates/canva-back-base.png" },
  ],
} as const;

export type PodRenderProfileAssetHashes = {
  postcard_front_template: string;
  postcard_back_template: string;
} & Record<string, string>;

export const hashPodRenderProfile = (assetHashes?: PodRenderProfileAssetHashes) => sha256Utf8(canonicalJson({
  ...POD_RENDER_PROFILE,
  asset_sha256: assetHashes || null,
}));
