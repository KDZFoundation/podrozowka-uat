import React from "react";
import canvaFrontBase from "@/assets/postcard-templates/canva-front-base.png";

export interface CropSettings {
  fit?: "auto" | "crop";
  zoom?: number;
  x?: number;
  y?: number;
}

export interface PostcardFrontProps {
  imageUrl?: string | null;
  photoAuthor?: string | null;
  contentText?: string | null;
  cropSettings?: CropSettings;
  showCropMarks?: boolean;
  printMode?: boolean;
  className?: string;
  templateUrl?: string;
  bodyFontFamily?: string;
  handwritingFontFamily?: string;
}

const PreviewCropMarks = () => (
  <>
    <div className="absolute top-0 left-2 w-4 border-t border-slate-900 pointer-events-none" />
    <div className="absolute top-2 left-0 h-4 border-l border-slate-900 pointer-events-none" />
    <div className="absolute top-0 right-2 w-4 border-t border-slate-900 pointer-events-none" />
    <div className="absolute top-2 right-0 h-4 border-r border-slate-900 pointer-events-none" />
    <div className="absolute bottom-0 left-2 w-4 border-b border-slate-900 pointer-events-none" />
    <div className="absolute bottom-2 left-0 h-4 border-l border-slate-900 pointer-events-none" />
    <div className="absolute bottom-0 right-2 w-4 border-b border-slate-900 pointer-events-none" />
    <div className="absolute bottom-2 right-0 h-4 border-r border-slate-900 pointer-events-none" />
  </>
);

export const PostcardFront: React.FC<PostcardFrontProps> = ({
  imageUrl,
  photoAuthor,
  contentText,
  cropSettings = { fit: "auto", zoom: 100, x: 50, y: 50 },
  showCropMarks = true,
  printMode = false,
  className = "",
  templateUrl,
  bodyFontFamily,
  handwritingFontFamily,
}) => {
  const isCrop = cropSettings.fit === "crop";
  const zoom = cropSettings.zoom ?? 100;
  const x = cropSettings.x ?? 50;
  const y = cropSettings.y ?? 50;
  const rawAuthor = photoAuthor?.trim();
  const cleanAuthor = rawAuthor
    ?.replace(/^fot\.\s*by\s*/i, "")
    .replace(/^\(C\)\s*/i, "")
    .replace(/^©\s*/, "")
    .replace(/^@+/, "")
    .trim();
  const author = cleanAuthor ? `fot. by @${cleanAuthor}` : null;
  const content = contentText?.trim() || null;
  // A second language can make the front message significantly longer. Keep
  // every translation inside the fixed, print-safe message area instead of
  // letting it extend below the hikers or beyond the postcard trim.
  const contentLength = content?.length ?? 0;
  const messageFontSize =
    contentLength > 140 ? "1.15cqw" :
    contentLength > 110 ? "1.35cqw" :
    contentLength > 85 ? "1.65cqw" :
    contentLength > 60 ? "2.05cqw" :
    contentLength > 44 ? "2.45cqw" :
    "2.9cqw";
  const replacesTemplateText = Boolean(content && content !== "PODZIĘKOWANIA");
  const effectiveBodyFontFamily = bodyFontFamily || (printMode ? "PodNotoSansV2" : undefined);
  const effectiveHandwritingFontFamily = handwritingFontFamily || (printMode ? "PodPatrickHandV2, PodNotoSansV2" : undefined);
  const effectiveTemplateUrl = templateUrl || (!printMode ? canvaFrontBase : null);
  if (printMode && (!effectiveTemplateUrl || !imageUrl)) throw new Error("pod_asset_front_render_dependency_missing");

  return (
    <div className={`relative bg-white select-none ${printMode ? "h-full" : "p-3 sm:p-4"} ${className}`}>
      {showCropMarks && <PreviewCropMarks />}

      <div
        className={`relative w-full overflow-hidden ${printMode ? "h-full" : "aspect-[154/111]"}`}
        style={{ containerType: "inline-size" }}
      >
        <img
          src={effectiveTemplateUrl || canvaFrontBase}
          alt="Szablon Canva - przód pocztówki"
          className="absolute inset-0 h-full w-full"
        />

        {imageUrl && (
          <div
            className="absolute left-[4%] top-[6.25%] h-[71.75%] w-[92%] overflow-hidden"
            aria-label="Obszar zdjęcia z bezpiecznym odstępem od linii cięcia"
          >
            <img
              src={imageUrl}
              alt="Zdjęcie pocztówki"
              className="h-full w-full object-cover"
              style={{
                objectPosition: isCrop ? `${x}% ${y}%` : "center center",
                transform: isCrop ? `scale(${zoom / 100})` : "none",
              }}
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        {author && (
          <div className="absolute left-[96%] top-[2%] z-20 h-[74%] w-[2%] overflow-visible bg-white">
            <span
              dir="auto"
              className="absolute bottom-0 left-full block whitespace-nowrap text-[1.75cqw] font-normal tracking-wide text-black"
              style={{
                fontFamily: effectiveHandwritingFontFamily || '"Patrick Hand", "Segoe Print", "Comic Sans MS", cursive',
                transform: "rotate(-90deg)",
                transformOrigin: "left bottom",
              }}
            >
              {author}
            </span>
          </div>
        )}

        {replacesTemplateText && (
          <div className="absolute left-[22%] top-[80.5%] z-10 flex h-[11.5%] w-[56%] items-center justify-center overflow-hidden bg-white px-2 text-center">
            <p
              dir="auto"
              className="w-full break-words font-sans font-normal uppercase tracking-[0.04em] text-[#999]"
              style={{ fontSize: messageFontSize, lineHeight: 1.12, unicodeBidi: "plaintext", ...(effectiveBodyFontFamily ? { fontFamily: effectiveBodyFontFamily } : {}) }}
            >
              {content}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
