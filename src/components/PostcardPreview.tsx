import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import QRCode from "qrcode";
import wroclawImage from "@/assets/images/wroclaw_1784208512742.jpg";
import { PostcardFront } from "@/components/postcard/PostcardFront";
import { PostcardBack } from "@/components/postcard/PostcardBack";

type PostcardPreviewProps = {
  embedded?: boolean;
};

const PostcardPreview = ({ embedded = false }: PostcardPreviewProps) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/r/demo-thailand`, { margin: 1, width: 180 })
      .then(setQrCodeUrl)
      .catch(() => setQrCodeUrl(null));
  }, []);

  return (
    <section id={embedded ? undefined : "jak-to-dziala"} className={embedded ? "" : "bg-secondary/30 py-16 md:py-24"}>
      <div className="container mx-auto px-4">
        <div className={embedded ? "mb-6 text-center" : "mb-10 text-center"}>
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            Przykładowy wzór
          </span>
          <h2 className={`mb-3 font-display font-bold text-foreground ${embedded ? "text-2xl md:text-3xl" : "text-2xl md:text-4xl"}`}>
            Zobacz jak wygląda Podróżówka
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">Kliknij kartkę, aby zobaczyć drugą stronę</p>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            aria-label={isFlipped ? "Pokaż przód kartki" : "Pokaż tył kartki"}
            className={`relative cursor-pointer border-0 bg-transparent p-0 ${embedded ? "w-[280px] md:w-[430px]" : "w-[320px] md:w-[520px]"}`}
            style={{ perspective: "1000px" }}
            onClick={() => setIsFlipped((value) => !value)}
          >
            <motion.div
              className="relative aspect-[154/111]"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-xl bg-white shadow-elevated" style={{ backfaceVisibility: "hidden" }}>
                <PostcardFront
                  imageUrl={wroclawImage}
                  photoAuthor="@Podrozowka"
                  contentText="ขอบคุณที่อยู่กับเรา!"
                  showCropMarks={false}
                  className="h-full w-full"
                />
              </div>
              <div className="absolute inset-0 overflow-hidden rounded-xl bg-white shadow-elevated" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <PostcardBack showCropMarks={false} backQrLabel="สแกน QR เพื่อเดินทางไปกับฉัน" countryIso2="TH" qrCodeUrl={qrCodeUrl} className="h-full w-full" />
              </div>
            </motion.div>
            <span className="absolute -bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
              <RotateCcw className="h-4 w-4" /> Kliknij, aby obrócić
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default PostcardPreview;
