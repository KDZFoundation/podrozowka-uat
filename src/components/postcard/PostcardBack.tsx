import React from "react";
import { QrCode } from "lucide-react";

export interface PostcardBackProps {
  qrLabel?: string | null;
  showCropMarks?: boolean;
  className?: string;
}

/** Canonical POD reverse: the admin preview and print renderer share this composition. */
export const PostcardBack: React.FC<PostcardBackProps> = ({
  qrLabel,
  showCropMarks = true,
  className = "",
}) => {
  const displayQrLabel = qrLabel?.trim() || "ZESKANUJ";

  return (
    <div className={`relative bg-white p-4 sm:p-6 shadow-xl select-none ${className}`}>
      {showCropMarks && <>
        <div className="absolute top-1 left-1 h-3 w-3 border-l-2 border-t-2 border-slate-900" />
        <div className="absolute top-1 right-1 h-3 w-3 border-r-2 border-t-2 border-slate-900" />
        <div className="absolute bottom-1 left-1 h-3 w-3 border-b-2 border-l-2 border-slate-900" />
        <div className="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-slate-900" />
      </>}

      <div className="relative aspect-[1.42/1] overflow-hidden border border-slate-200 bg-[#fffefb] px-[5.5%] py-[4.5%] text-slate-700">
        <header className="flex items-start justify-between border-b border-slate-300 pb-[2.5%]">
          <div className="leading-none">
            <p className="font-serif text-[clamp(13px,2.4vw,23px)] font-bold tracking-tight text-[#214c3e]">Podróżówka</p>
            <p className="mt-1 text-[clamp(6px,1.15vw,10px)] font-medium uppercase tracking-[0.16em] text-slate-500">odwrócona pocztówka</p>
          </div>
          <div className="relative h-[18%] min-h-10 w-[14%] min-w-12 overflow-hidden border-2 border-dashed border-[#76958a] bg-sky-50">
            <div className="absolute -top-2 left-1 h-4 w-7 rounded-full bg-white" />
            <div className="absolute -top-1 right-0 h-3 w-5 rounded-full bg-white" />
            <div className="absolute -bottom-2 left-0 h-5 w-10 rounded-[100%_100%_0_0] bg-emerald-300" />
            <span className="absolute inset-x-0 bottom-1 text-center text-[6px] font-bold uppercase tracking-wider text-[#365c50]">znaczek</span>
          </div>
        </header>

        <div className="grid h-[73%] grid-cols-12 gap-[4%] pt-[3.5%]">
          <section className="col-span-5 flex flex-col justify-between border-r border-dashed border-slate-300 pr-[7%]">
            <div className="relative mx-auto w-[92%]">
              <svg viewBox="0 0 180 118" className="h-auto w-full" aria-label="Mapa Europy z Polską">
                <path d="M22 32 C36 14 57 17 70 22 C84 9 106 12 119 23 C142 17 159 32 155 50 C172 64 157 81 142 83 C133 102 109 104 92 96 C74 110 48 102 43 84 C22 85 10 67 21 53 C10 44 12 36 22 32Z" fill="#edf3ee" stroke="#76958a" strokeWidth="2" />
                <path d="M89 47 l13 -3 10 8 -4 13 -14 3 -10 -9Z" fill="#fff" stroke="#d13f3f" strokeWidth="1.4" />
                <path d="M85 57 h25" stroke="#d13f3f" strokeWidth="4" />
                <path d="M42 78 C63 63 70 72 83 60 C98 47 113 75 137 52" fill="none" stroke="#446d5c" strokeDasharray="4 4" strokeWidth="2" />
                <circle cx="135" cy="53" r="4" fill="#315b49" />
                <path d="M135 48 v-9 M131 42 h8 M132 54 l-5 10 M138 54 l6 8" stroke="#315b49" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="-mt-1 text-center text-[clamp(6px,1vw,9px)] font-medium text-[#446d5c]">Z Polski w świat</p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex h-[clamp(40px,7vw,66px)] w-[clamp(40px,7vw,66px)] shrink-0 items-center justify-center border border-dashed border-[#76958a] bg-white p-1.5"><QrCode className="h-full w-full text-slate-600" strokeWidth={1.5} /></div>
              <div className="pb-1"><p className="text-[clamp(7px,1.25vw,11px)] font-bold uppercase tracking-[0.12em] text-[#214c3e]">{displayQrLabel}</p><p className="mt-1 text-[clamp(5px,0.85vw,8px)] leading-tight text-slate-500">Odkryj historię tej Podróżówki.</p></div>
            </div>
          </section>
          <section className="col-span-7 flex flex-col justify-end pb-[3%]">
            <p className="mb-[7%] text-[clamp(7px,1.2vw,10px)] uppercase tracking-[0.12em] text-slate-400">Adres odbiorcy</p>
            <div className="space-y-[10%]">{[0, 1, 2, 3].map((line) => <div key={line} className="border-b border-slate-400" />)}</div>
          </section>
        </div>
        {showCropMarks && <div className="absolute inset-x-0 bottom-0 border-b border-dashed border-slate-500" />}
      </div>
    </div>
  );
};
