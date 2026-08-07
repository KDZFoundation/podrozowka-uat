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
  const replacesTemplateText = Boolean(content && content !== "PODZIĘKOWANIA");

  return (
    <div className={`relative bg-white select-none ${printMode ? "h-full" : "p-3 sm:p-4"} ${className}`}>
      {showCropMarks && <PreviewCropMarks />}

      <div
        className={`relative w-full overflow-hidden ${printMode ? "h-full" : "aspect-[154/111]"}`}
        style={{ containerType: "inline-size" }}
      >
        <img
          src={canvaFrontBase}
          alt="Szablon Canva - przód pocztówki"
          className="absolute inset-0 h-full w-full"
        />

        {imageUrl && (
          <div className="absolute left-[2%] top-[2%] h-[74%] w-[94%] overflow-hidden">
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
              className="absolute bottom-0 left-full block whitespace-nowrap text-[1.75cqw] font-normal tracking-wide text-black"
              style={{
                fontFamily: '"Patrick Hand", "Segoe Print", "Comic Sans MS", cursive',
                transform: "rotate(-90deg)",
                transformOrigin: "left bottom",
              }}
            >
              {author}
            </span>
          </div>
        )}

        {replacesTemplateText && (
          <div className="absolute left-[22%] top-[80.5%] z-10 flex h-[11.5%] w-[56%] items-center justify-center bg-white px-2 text-center">
            <p className="font-sans text-[2.9cqw] font-normal uppercase leading-tight tracking-[0.04em] text-[#999]">
              {content}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
