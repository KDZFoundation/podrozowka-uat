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

export const HikerLogoSVG: React.FC<{ className?: string; mirror?: boolean }> = ({
  className = "w-8 h-10",
  mirror = false,
}) => {
  return (
    <svg
      viewBox="0 0 60 80"
      className={`${className} ${mirror ? "scale-x-[-1]" : ""}`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 1. Kapelusz (Brown Hat) */}
      <path
        d="M 20 22 C 20 10 40 10 40 22 Z"
        fill="#92400e"
        stroke="#000000"
        strokeWidth="2"
      />
      <path
        d="M 25 16 Q 30 18 35 16"
        fill="none"
        stroke="#000000"
        strokeWidth="1.5"
      />
      <path
        d="M 12 24 Q 30 17 48 24 Q 30 20 12 24 Z"
        fill="#92400e"
        stroke="#000000"
        strokeWidth="2"
      />

      {/* 2. Głowa (Head) */}
      <circle
        cx="30"
        cy="29"
        r="6"
        fill="#ffffff"
        stroke="#000000"
        strokeWidth="2"
      />

      {/* 3. Zielony Plecak (Green Backpack) */}
      <rect
        x="10"
        y="35"
        width="11"
        height="18"
        rx="4"
        fill="#15803d"
        stroke="#000000"
        strokeWidth="2"
      />
      <rect
        x="12"
        y="43"
        width="7"
        height="8"
        rx="2"
        fill="#16a34a"
        stroke="#000000"
        strokeWidth="1.2"
      />
      <path
        d="M 21 37 Q 27 41 26 47"
        fill="none"
        stroke="#000000"
        strokeWidth="1.8"
      />

      {/* 4. Tłów (Torso) */}
      <path
        d="M 30 35 L 27 54"
        stroke="#000000"
        strokeWidth="2.2"
      />

      {/* 5. Ręka z dłonią (Arm with hand) */}
      <path
        d="M 29 41 Q 35 47 41 45"
        fill="none"
        stroke="#000000"
        strokeWidth="2"
      />
      <circle
        cx="42"
        cy="45"
        r="2"
        fill="#ffffff"
        stroke="#000000"
        strokeWidth="1.5"
      />

      {/* 6. Nogi w chodzie (Walking legs) */}
      <path
        d="M 27 54 L 14 74"
        stroke="#000000"
        strokeWidth="2.2"
      />
      <path
        d="M 27 54 L 38 72"
        stroke="#000000"
        strokeWidth="2.2"
      />

      {/* 7. Czarne Buty (Solid Black Oval Shoes) */}
      <ellipse cx="12" cy="76" rx="5.5" ry="3" fill="#000000" />
      <ellipse cx="40" cy="74" rx="5.5" ry="3" fill="#000000" />
    </svg>
  );
};

export const SketchHikerSVG: React.FC<{ className?: string }> = ({
  className = "w-8 h-10",
}) => {
  return (
    <svg
      viewBox="0 0 60 80"
      className={className}
      fill="none"
      stroke="#52525b"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Kapelusz w stylu szkicu */}
      <path d="M 18 22 C 18 12 38 12 38 22 Z" strokeDasharray="3 1" />
      <path d="M 12 24 Q 28 17 46 24" strokeDasharray="3 1" />
      
      {/* Głowa */}
      <circle cx="28" cy="29" r="6" stroke="#52525b" strokeWidth="1.2" />

      {/* Plecak szkicowany */}
      <rect x="10" y="34" width="11" height="17" rx="3" strokeDasharray="2 1.5" strokeWidth="1.2" />
      <path d="M 21 36 Q 26 40 25 46" strokeDasharray="2 1.5" />

      {/* Tłów */}
      <path d="M 28 35 L 26 53" strokeWidth="1.5" />

      {/* Ręka z kaską / kijkiem */}
      <path d="M 27 41 Q 33 46 38 43" strokeWidth="1.2" />
      <circle cx="39" cy="43" r="1.5" />

      {/* Kijek trekkingowy kropkowany */}
      <path d="M 39 37 L 39 70" strokeDasharray="2 1.5" strokeWidth="1.2" />

      {/* Nogi w chodzie */}
      <path d="M 26 53 L 14 73" strokeWidth="1.5" />
      <path d="M 26 53 L 37 71" strokeWidth="1.5" />

      {/* Buty szkicowe */}
      <ellipse cx="12" cy="74" rx="5" ry="2.5" strokeDasharray="2 1" />
      <ellipse cx="39" cy="72" rx="5" ry="2.5" strokeDasharray="2 1" />
    </svg>
  );
};

export const ColoredHikerSVG: React.FC<{ className?: string }> = ({
  className = "w-8 h-10",
}) => {
  return (
    <svg
      viewBox="0 0 60 80"
      className={className}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 1. Kapelusz (Brown Hat) */}
      <path
        d="M 20 22 C 20 10 40 10 40 22 Z"
        fill="#a16207"
        stroke="#000000"
        strokeWidth="1.8"
      />
      <path
        d="M 24 16 Q 30 18 36 16"
        fill="none"
        stroke="#000000"
        strokeWidth="1.2"
      />
      <path
        d="M 12 24 Q 30 17 48 24 Q 30 20 12 24 Z"
        fill="#a16207"
        stroke="#000000"
        strokeWidth="1.8"
      />

      {/* 2. Głowa (Head) */}
      <circle
        cx="30"
        cy="29"
        r="6"
        fill="#ffffff"
        stroke="#000000"
        strokeWidth="1.8"
      />

      {/* 3. Zielony Plecak (Green Backpack) */}
      <rect
        x="10"
        y="34"
        width="12"
        height="18"
        rx="4"
        fill="#15803d"
        stroke="#000000"
        strokeWidth="1.8"
      />
      <rect
        x="12"
        y="42"
        width="8"
        height="8"
        rx="2"
        fill="#16a34a"
        stroke="#000000"
        strokeWidth="1.2"
      />

      {/* 4. Tłów (Torso) */}
      <path
        d="M 30 35 L 27 54"
        stroke="#000000"
        strokeWidth="2"
      />

      {/* 5. Ręka z dłonią (Arm) */}
      <path
        d="M 29 41 Q 36 46 41 44"
        fill="none"
        stroke="#000000"
        strokeWidth="1.8"
      />
      <circle
        cx="42"
        cy="44"
        r="2"
        fill="#ffffff"
        stroke="#000000"
        strokeWidth="1.2"
      />

      {/* 6. Nogi w chodzie (Walking legs) */}
      <path
        d="M 27 54 L 14 74"
        stroke="#000000"
        strokeWidth="2"
      />
      <path
        d="M 27 54 L 38 72"
        stroke="#000000"
        strokeWidth="2"
      />

      {/* 7. Czarne Buty (Solid Black Oval Shoes) */}
      <ellipse cx="12" cy="76" rx="5.5" ry="3" fill="#000000" />
      <ellipse cx="40" cy="74" rx="5.5" ry="3" fill="#000000" />
    </svg>
  );
};

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

  const rawAuthor = photoAuthor?.trim();
  const displayAuthor = rawAuthor
    ? rawAuthor.startsWith("(C)") || rawAuthor.startsWith("©")
      ? rawAuthor
      : `(C) ${rawAuthor}`
    : "(C) Autor zdjęcia";

  const displayContent = contentText?.trim() || "PODZIĘKOWANIA";

  return (
    <div className={`relative p-6 sm:p-8 bg-white select-none ${className}`}>
      {/* Printer Crop / Cut Marks outside the card frame */}
      {showCropMarks && (
        <>
          {/* Top Center Crop Mark */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-0 border-t-2 border-slate-900 pointer-events-none" />

          {/* Bottom Center Crop Mark */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0 border-b-2 border-slate-900 pointer-events-none" />

          {/* Top-Left Crop Marks */}
          <div className="absolute top-1 left-4 w-5 h-0 border-t-2 border-slate-900 pointer-events-none" />
          <div className="absolute top-4 left-1 w-0 h-5 border-l-2 border-slate-900 pointer-events-none" />

          {/* Top-Right Crop Marks */}
          <div className="absolute top-1 right-4 w-5 h-0 border-t-2 border-slate-900 pointer-events-none" />
          <div className="absolute top-4 right-1 w-0 h-5 border-r-2 border-slate-900 pointer-events-none" />

          {/* Bottom-Left Crop Marks */}
          <div className="absolute bottom-1 left-4 w-5 h-0 border-b-2 border-slate-900 pointer-events-none" />
          <div className="absolute bottom-4 left-1 w-0 h-5 border-l-2 border-slate-900 pointer-events-none" />

          {/* Bottom-Right Crop Marks */}
          <div className="absolute bottom-1 right-4 w-5 h-0 border-b-2 border-slate-900 pointer-events-none" />
          <div className="absolute bottom-4 right-1 w-0 h-5 border-r-2 border-slate-900 pointer-events-none" />
        </>
      )}

      {/* Main Card Area */}
      <div className="relative w-full aspect-[1.42/1] flex flex-col justify-between bg-white overflow-hidden p-3">
        {/* 1. OKNO NA WCZYTANIE ZDJĘCIA (Szeroka ramka zdjęcia) */}
        <div className="relative w-full h-[76%] bg-[#bae6fd] overflow-hidden">
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
            /* Default Vector Illustration matching attached PDF template screenshot */
            <div className="relative w-full h-full bg-[#bae6fd] flex flex-col justify-end overflow-hidden">
              {/* Fluffy White Clouds */}
              <div className="absolute top-6 left-6 w-24 h-12 bg-white/95 rounded-full" />
              <div className="absolute top-4 left-10 w-16 h-14 bg-white/90 rounded-full" />

              <div className="absolute top-5 right-12 w-32 h-16 bg-white/95 rounded-full" />
              <div className="absolute top-2 right-20 w-24 h-20 bg-white/90 rounded-full" />

              {/* Back Light Green Hill */}
              <div
                className="absolute bottom-0 left-[10%] right-[30%] h-24 bg-[#a3e635]"
                style={{ borderRadius: "100% 100% 0 0" }}
              />

              {/* Main Olive Green Hills */}
              <div
                className="absolute -bottom-4 -left-12 right-0 h-32 bg-[#65a30d]"
                style={{ borderRadius: "90% 110% 0 0" }}
              />

              {/* Tiny Sheep on left hill */}
              <div className="absolute bottom-24 left-[5%] flex flex-col items-center">
                <div className="w-3 h-2 bg-white rounded-full relative">
                  <div className="absolute -left-1 top-0.5 w-1 h-1 bg-black rounded-full" />
                </div>
              </div>
            </div>
          )}

          {/* 2. PIONOWA NAZWA AUTORA ZDJĘCIA (Po prawej stronie zdjęcia) */}
          <div className="absolute right-1 bottom-3 flex items-center justify-center pointer-events-none z-10">
            <span
              className="text-[9px] sm:text-[10px] font-sans text-slate-400/90 font-normal tracking-wider select-none whitespace-nowrap"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              {displayAuthor}
            </span>
          </div>
        </div>

        {/* 3 & 4. DOLNA SEKCJA: LEWY SZKICOWY LUDZIK + TEKST PODZIĘKOWANIA + PRAWY KOLOROWY LUDZIK */}
        <div className="relative w-full flex-1 bg-white px-2 pt-2 pb-1 flex flex-col justify-between">
          <div className="flex items-center justify-between w-full">
            {/* Lewa ikona (Szkicowa) */}
            <div className="w-12 h-12 flex items-center justify-center shrink-0">
              <SketchHikerSVG className="w-10 h-12" />
            </div>

            {/* Treść podziękowania */}
            <div className="flex-1 text-center px-4">
              <p className="text-sm sm:text-base font-normal text-slate-600 uppercase tracking-[0.2em] leading-tight line-clamp-2 font-sans">
                {displayContent}
              </p>
            </div>

            {/* Prawa ikona (Kolorowa) */}
            <div className="w-12 h-12 flex items-center justify-center shrink-0">
              <ColoredHikerSVG className="w-10 h-12" />
            </div>
          </div>

          {/* Linia przerywana pod spodem (Dashed line spanning whole width) */}
          <div className="w-full border-b border-dashed border-slate-500/80 mt-1" />
        </div>
      </div>
    </div>
  );
};

