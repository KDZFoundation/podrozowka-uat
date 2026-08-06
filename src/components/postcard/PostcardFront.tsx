import React from "react";

export interface CropSettings {
  fit?: "auto" | "crop";
  zoom?: number; // 100 - 200
  x?: number;    // 0 - 100
  y?: number;    // 0 - 100
}

export interface PostcardFrontProps {
  imageUrl?: string | null;
  photoAuthor?: string | null;
  contentText?: string | null;
  cropSettings?: CropSettings;
  showCropMarks?: boolean;
  className?: string;
}

export const PostcardFront: React.FC<PostcardFrontProps> = ({
  imageUrl,
  photoAuthor,
  contentText,
  cropSettings = { fit: "auto", zoom: 100, x: 50, y: 50 },
  showCropMarks = true,
  className = "",
}) => {
  const isCrop = cropSettings?.fit === "crop";
  const zoomVal = cropSettings?.zoom ?? 100;
  const posX = cropSettings?.x ?? 50;
  const posY = cropSettings?.y ?? 50;

  const normalizedAuthor = photoAuthor?.trim() || "Autor zdjęcia";
  const displayAuthor = normalizedAuthor.startsWith("@") || normalizedAuthor.startsWith("(C)") || normalizedAuthor.startsWith("©")
    ? normalizedAuthor
    : `(C) ${normalizedAuthor}`;

  const displayContent = contentText?.trim() || "Wpisz tutaj treść...";

  return (
    <div className={`relative p-4 sm:p-6 bg-white rounded-md shadow-xl select-none ${className}`}>
      {/* Printer Crop / Cut Marks in corners */}
      {showCropMarks && (
        <>
          {/* Top-Left Cut Mark */}
          <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-slate-900 pointer-events-none" />
          {/* Top-Right Cut Mark */}
          <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-slate-900 pointer-events-none" />
          {/* Bottom-Left Cut Mark */}
          <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-slate-900 pointer-events-none" />
          {/* Bottom-Right Cut Mark */}
          <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-slate-900 pointer-events-none" />
        </>
      )}

      {/* Main Postcard Front Canvas */}
      <div className="relative w-full aspect-[1.42/1] flex flex-col justify-between bg-white border border-slate-100 overflow-hidden">
        {/* 1. OKNO NA WCZYTANIE ZDJĘCIA */}
        <div className="relative w-full h-[76%] bg-sky-100 overflow-hidden border-b border-slate-100 group">
          {imageUrl ? (
            <div className="relative w-full h-full overflow-hidden">
              <img
                src={imageUrl}
                alt="Zdjęcie pocztówki"
                className="w-full h-full object-cover transition-all duration-200"
                style={{
                  objectPosition: isCrop ? `${posX}% ${posY}%` : "center center",
                  transform: isCrop ? `scale(${zoomVal / 100})` : "none",
                }}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            /* Default Vector Illustration matching template (clouds & green hills) */
            <div className="relative w-full h-full bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-50 flex flex-col items-center justify-center overflow-hidden">
              {/* Clouds */}
              <div className="absolute top-4 left-6 w-16 h-8 bg-white/80 rounded-full blur-[0.5px]" />
              <div className="absolute top-3 left-10 w-12 h-10 bg-white/90 rounded-full" />

              <div className="absolute top-6 right-16 w-24 h-12 bg-white/80 rounded-full blur-[0.5px]" />
              <div className="absolute top-4 right-20 w-16 h-14 bg-white/90 rounded-full" />

              {/* Distant Hills */}
              <div
                className="absolute bottom-0 left-0 right-0 h-24 bg-lime-600/40"
                style={{ borderRadius: "100% 100% 0 0 / 80% 80% 0 0" }}
              />
              <div
                className="absolute bottom-0 -left-10 -right-10 h-16 bg-lime-700/80"
                style={{ borderRadius: "100% 100% 0 0 / 100% 100% 0 0" }}
              />

              {/* Tiny sheep outline on left hill */}
              <div className="absolute bottom-12 left-8 w-2 h-1.5 bg-white rounded-full shadow-xs" />

              <div className="relative z-10 text-center p-2 bg-white/60 backdrop-blur-xs rounded-lg border border-white/60">
                <p className="text-xs font-semibold text-slate-700">Podgląd zdjęcia</p>
                <p className="text-[10px] text-slate-500">Wczytaj własną fotografię w kreatorze</p>
              </div>
            </div>
          )}

          {/* 2. PIONOWA TREŚĆ NA WPISANIE NAZWY AUTORA ZDJĘCIA */}
          <div className="absolute right-1.5 bottom-2 top-2 flex items-center justify-center pointer-events-none z-10">
            <span
              className="text-[10px] sm:text-[11px] font-sans text-slate-400 font-medium tracking-wide select-none whitespace-nowrap bg-white/40 px-1 py-0.5 rounded backdrop-blur-[1px]"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              {displayAuthor}
            </span>
          </div>
        </div>

        {/* 3 & 4. DOLNA SEKCJA: IKONY LUDZIKA + TREŚĆ */}
        <div className="relative w-full h-[24%] bg-white px-3 py-1 flex items-center justify-between">
          {/* Lewa ikona ludzika (Line-art hiker with hat, backpack, stick) */}
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 60 80" className="w-8 h-10 stroke-slate-700 fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* Kapelusz */}
              <path d="M 16 20 Q 30 14 44 20 M 20 20 C 22 10 38 10 40 20" />
              {/* Głowa */}
              <circle cx="30" cy="28" r="6" />
              {/* Plecak z szelkami */}
              <rect x="14" y="34" width="10" height="18" rx="2" strokeDasharray="3 2" />
              {/* Tłów */}
              <path d="M 30 34 L 28 54" />
              {/* Nogi w chodzie */}
              <path d="M 28 54 L 18 74 M 28 54 L 38 74" />
              {/* Laska trekkingowa */}
              <path d="M 44 24 L 40 76" strokeWidth="1.5" />
              {/* Ręka trzymająca kijek */}
              <path d="M 28 40 L 42 42" />
            </svg>
          </div>

          {/* Miejsca do wpisania treści (Szkic tekstu) */}
          <div className="flex-1 text-center px-2">
            <p className="text-xs sm:text-sm font-medium text-slate-600 tracking-wide leading-tight line-clamp-2">
              {displayContent}
            </p>
          </div>

          {/* Prawa ikona ludzika (Kolorowy hiker z zielonym plecakiem) */}
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 60 80" className="w-8 h-10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* Kapelusz z brązowym rondem */}
              <path d="M 16 22 Q 30 16 44 22" stroke="#78350f" strokeWidth="2.5" />
              <path d="M 22 22 C 22 14 38 14 38 22" fill="#b45309" stroke="#78350f" strokeWidth="1.5" />
              {/* Głowa */}
              <circle cx="30" cy="28" r="5" stroke="#1e293b" fill="#fef08a" />
              {/* Zielony Plecak */}
              <rect x="12" y="34" width="11" height="17" rx="3" fill="#15803d" stroke="#166534" strokeWidth="1.5" />
              {/* Tłów */}
              <path d="M 30 33 L 32 52" stroke="#1e293b" />
              {/* Nogi idące w prawo */}
              <path d="M 32 52 L 22 72 M 32 52 L 42 70 M 42 70 L 46 72" stroke="#1e293b" strokeWidth="2" />
              {/* Ręka */}
              <path d="M 29 40 L 38 46" stroke="#1e293b" strokeWidth="2" />
            </svg>
          </div>
        </div>

        {/* Dolna linia przerywana do cięcia/zgięcia */}
        {showCropMarks && (
          <div className="w-full border-b border-dashed border-slate-400 opacity-60" />
        )}
      </div>
    </div>
  );
};
