import React from "react";
import canvaBackBase from "@/assets/postcard-templates/canva-back-base.png";

export interface PostcardBackProps {
  backQrLabel?: string | null;
  countryIso2?: string | null;
  countryFlagUrl?: string | null;
  showCropMarks?: boolean;
  className?: string;
  qrCodeUrl?: string | null;
  printMode?: boolean;
  templateUrl?: string;
  bodyFontFamily?: string;
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

export const PostcardBack: React.FC<PostcardBackProps> = ({
  backQrLabel,
  showCropMarks = true,
  className = "",
  qrCodeUrl,
  countryIso2,
  countryFlagUrl,
  printMode = false,
  templateUrl,
  bodyFontFamily,
}) => {
  const flagUrl = countryFlagUrl || (!printMode && countryIso2 ? `https://flagcdn.com/w640/${countryIso2.toLowerCase()}.png` : null);
  const qrLabel = backQrLabel?.trim();
  const effectiveBodyFontFamily = bodyFontFamily || (printMode ? "PodInterV1" : undefined);
  const effectiveTemplateUrl = templateUrl || (!printMode ? canvaBackBase : null);
  if (printMode && (!effectiveTemplateUrl || !flagUrl || !qrCodeUrl)) throw new Error("pod_asset_back_render_dependency_missing");

  return (
  <div className={`relative bg-white select-none ${printMode ? "h-full" : "p-3 sm:p-4"} ${className}`}>
    {showCropMarks && <PreviewCropMarks />}

    <div
      className={`relative w-full overflow-hidden ${printMode ? "h-full" : "aspect-[154/111]"}`}
      style={{ containerType: "inline-size" }}
    >
      <img
        src={effectiveTemplateUrl || canvaBackBase}
        alt="Szablon Canva - tył pocztówki"
        className="absolute inset-0 h-full w-full"
      />

      <div className="absolute left-[8%] top-[6.5%] z-10 h-[18%] w-[31%] bg-white text-center text-black">
        <div className="absolute left-0 top-[8%] flex w-full justify-center font-sans text-[4.15cqw] font-light leading-none" style={effectiveBodyFontFamily ? { fontFamily: effectiveBodyFontFamily } : undefined}>
          <span className="inline-flex gap-[0.14em]">
            {Array.from("PODRÓŻÓWKA").map((letter, index) => (
              <span key={`${letter}-${index}`}>{letter}</span>
            ))}
          </span>
        </div>
        <div className="absolute -left-[10%] top-[64%] h-[0.38cqw] w-[120%] rounded-full bg-black" />
        <div className="absolute left-0 top-[75%] w-full whitespace-nowrap font-sans text-[1.65cqw] font-normal leading-none tracking-[0.1em]" style={effectiveBodyFontFamily ? { fontFamily: effectiveBodyFontFamily } : undefined}>
          ODWRÓCONA POCZTÓWKA
        </div>
      </div>

      {flagUrl && (
        <>
          <div className="absolute left-[72.2%] top-[8.1%] z-10 h-[24.6%] w-[18.8%] bg-white" />
          <img
            src={flagUrl}
            alt={countryIso2 ? `Flaga ${countryIso2.toUpperCase()}` : "Flaga kraju"}
            className="absolute left-[72.6%] top-[8.5%] z-20 h-[23.8%] w-[18%] object-contain"
            crossOrigin="anonymous"
          />
        </>
      )}

      {qrLabel && (
        <div className="absolute left-[49.5%] top-[82%] z-10 flex h-[14%] w-[34%] items-center justify-center bg-white px-[1%] text-center">
          <p className="font-sans text-[2.05cqw] leading-[1.15] text-[#999]" style={effectiveBodyFontFamily ? { fontFamily: effectiveBodyFontFamily } : undefined}>
            {qrLabel}
          </p>
        </div>
      )}

      {qrCodeUrl && (
        <img
          src={qrCodeUrl}
          alt="Kod QR pocztówki"
          className="absolute bottom-[5.5%] right-[5.5%] z-10 aspect-square w-[9%] bg-white object-contain"
        />
      )}
    </div>
  </div>
  );
};
