import React from "react";
import { ColoredHikerSVG } from "./PostcardFront";

export interface PostcardBackProps {
  backQrLabel?: string | null;
  showCropMarks?: boolean;
  className?: string;
  qrCodeUrl?: string | null;
}

export const PostcardBack: React.FC<PostcardBackProps> = ({
  backQrLabel,
  showCropMarks = true,
  className = "",
  qrCodeUrl,
}) => {
  const displayLabel = backQrLabel?.trim() || "ZESKANUJ";

  return (
    <div className={`relative p-6 sm:p-8 bg-white select-none ${className}`}>
      {/* Printer Crop / Cut Marks outside card frame */}
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

      {/* Main Card Canvas */}
      <div className="relative w-full aspect-[1.42/1] bg-white overflow-hidden p-4 sm:p-6 flex flex-col justify-between border border-slate-100">
        
        {/* Top Header & Stamp Row */}
        <div className="relative z-10 flex items-start justify-between w-full">
          {/* Top-Left: Logo & Subtitle */}
          <div className="flex flex-col items-start pt-1">
            <h1 className="text-xl sm:text-2xl font-normal text-slate-900 tracking-wide font-sans">
              Podróżówka
            </h1>
            <div className="w-44 sm:w-56 h-[1.5px] bg-slate-900 my-1" />
            <p className="text-[10px] sm:text-xs text-slate-600 font-light tracking-wider pl-4">
              odwrócona pocztówka
            </p>
          </div>

          {/* Top-Right: Stamp Box */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#bae6fd] border border-slate-200 overflow-hidden flex flex-col justify-end relative shrink-0 shadow-2xs">
            {/* Stamp Clouds */}
            <div className="absolute top-2 left-2 w-8 h-4 bg-white/90 rounded-full" />
            <div className="absolute top-1 right-2 w-10 h-5 bg-white/95 rounded-full" />
            {/* Stamp Hills */}
            <div
              className="absolute -bottom-1 -left-2 -right-2 h-7 bg-[#a3e635]"
              style={{ borderRadius: "100% 100% 0 0" }}
            />
            <div
              className="absolute -bottom-2 -left-4 -right-4 h-5 bg-[#65a30d]"
              style={{ borderRadius: "100% 100% 0 0" }}
            />
          </div>
        </div>

        {/* Center Section: Europe Map with Poland + Dashed Trail with Hiker */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-start overflow-hidden">
          <svg
            viewBox="0 0 500 350"
            className="w-full h-full"
            fill="none"
            stroke="none"
          >
            {/* Europe Map Vector Outline */}
            <g stroke="#64748b" strokeWidth="1" strokeLinejoin="round" fill="none" opacity="0.6">
              {/* British Isles */}
              <path d="M 80 160 Q 90 140 100 150 Q 110 170 95 190 Q 80 180 80 160 Z" />
              <path d="M 65 170 Q 75 160 75 180 Q 65 190 65 170 Z" />

              {/* Scandinavia */}
              <path d="M 180 60 Q 210 40 230 70 Q 220 120 180 130 Q 160 100 180 60 Z" />

              {/* Iberia / Spain / Portugal */}
              <path d="M 60 270 L 110 270 L 105 310 L 55 305 Z" />

              {/* France */}
              <path d="M 110 210 L 145 200 L 150 245 L 115 255 Z" />

              {/* Italy */}
              <path d="M 180 250 L 200 280 L 210 305 L 195 310 L 175 270 Z" />

              {/* Germany, Benelux, Central Europe */}
              <path d="M 145 170 L 185 165 L 190 210 L 150 215 Z" />

              {/* Poland - Flag Colors inside */}
              {/* Upper half of Poland (White) */}
              <path
                d="M 185 175 L 220 170 L 225 190 L 188 192 Z"
                fill="#ffffff"
                stroke="#334155"
                strokeWidth="1.2"
                opacity="1"
              />
              {/* Lower half of Poland (Red) */}
              <path
                d="M 188 192 L 225 190 L 220 210 L 185 208 Z"
                fill="#dc2626"
                stroke="#334155"
                strokeWidth="1.2"
                opacity="1"
              />

              {/* Eastern Europe & Balkans */}
              <path d="M 225 165 L 280 150 L 270 230 L 210 230 Z" />

              {/* Iceland */}
              <path d="M 50 110 Q 70 100 75 115 Q 60 130 50 110 Z" />
            </g>

            {/* Dashed trail line from Atlantic/West through Scandinavia towards stamp */}
            <path
              d="M 45 155 Q 50 130 110 135 Q 170 140 215 150 Q 280 150 410 115"
              stroke="#334155"
              strokeWidth="1.5"
              strokeDasharray="8 6"
              fill="none"
              opacity="0.85"
            />
          </svg>

          {/* Hiker figure positioned walking along the trail near top-center */}
          <div className="absolute top-[38%] left-[42%] -translate-x-1/2 -translate-y-1/2 z-10">
            <ColoredHikerSVG className="w-9 h-11 sm:w-11 sm:h-13" />
          </div>
        </div>

        {/* Right Section: Address Lines & Bottom QR section */}
        <div className="relative z-10 flex flex-col justify-end items-end w-full space-y-4 pt-12">
          {/* 4 Parallel Address Lines */}
          <div className="w-1/2 sm:w-[52%] space-y-4 sm:space-y-5 pr-2">
            <div className="w-full border-b border-slate-800" />
            <div className="w-full border-b border-slate-800" />
            <div className="w-full border-b border-slate-800" />
            <div className="w-full border-b border-slate-800" />
          </div>

          {/* Bottom Right: ZESKANUJ Text + QR Placeholder */}
          <div className="flex items-center gap-3 pt-2 pr-1">
            <span className="text-xs sm:text-sm font-sans tracking-widest text-slate-500 uppercase font-normal">
              {displayLabel}
            </span>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#bae6fd] border border-slate-200 overflow-hidden shrink-0 flex flex-col justify-end relative shadow-2xs">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code" className="w-full h-full object-cover" />
              ) : (
                <>
                  {/* Mini sky & hills placeholder inside QR box matching template */}
                  <div className="absolute top-1 left-1 w-5 h-2.5 bg-white/90 rounded-full" />
                  <div
                    className="absolute -bottom-1 -left-1 -right-1 h-4 bg-[#84cc16]"
                    style={{ borderRadius: "100% 100% 0 0" }}
                  />
                  <div
                    className="absolute -bottom-1 -left-2 -right-2 h-2.5 bg-[#65a30d]"
                    style={{ borderRadius: "100% 100% 0 0" }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
