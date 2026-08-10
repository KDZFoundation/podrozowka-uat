import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import QRCode from "qrcode";
import krakowImage from "@/assets/krakow-square.jpg";
import { PostcardFront } from "@/components/postcard/PostcardFront";
import { PostcardBack } from "@/components/postcard/PostcardBack";

const PostcardPreview = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/r/demo-thailand`, { margin: 1, width: 180 })
      .then(setQrCodeUrl)
      .catch(() => setQrCodeUrl(null));
  }, []);

  return (
    <section id="jak-to-dziala" className="bg-secondary/30 py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            Przykładowy wzór
          </span>
          <h2 className="mb-3 font-display text-2xl font-bold text-foreground md:text-4xl">
            Zobacz jak wygląda Podróżówka
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">Kliknij kartkę, aby zobaczyć drugą stronę</p>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            aria-label={isFlipped ? "Pokaż przód kartki" : "Pokaż tył kartki"}
            className="relative w-[320px] cursor-pointer border-0 bg-transparent p-0 md:w-[520px]"
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
                  imageUrl={krakowImage}
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
