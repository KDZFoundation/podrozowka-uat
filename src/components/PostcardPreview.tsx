import { useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import krakowImage from "@/assets/krakow-square.jpg";
import { PostcardBack } from "@/components/postcard/PostcardBack";

const PostcardPreview = () => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <section className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4">
            Przykładowy wzór
          </span>
          <h2 className="font-display text-2xl md:text-4xl font-bold text-foreground mb-3">
            Zobacz jak wygląda Podróżówka
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Kliknij kartę, aby zobaczyć drugą stronę
          </p>
        </div>

        <div className="flex justify-center">
          <div 
            className="relative cursor-pointer perspective-1000"
            style={{ perspective: "1000px" }}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <motion.div
              className="relative w-[320px] md:w-[400px] h-[220px] md:h-[280px]"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Front of card */}
              <div 
                className="absolute inset-0 rounded-xl overflow-hidden shadow-elevated"
                style={{ backfaceVisibility: "hidden" }}
              >
                <img 
                  src={krakowImage} 
                  alt="Kraków - Rynek Główny"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
                
                {/* Thank you text overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
                  <p className="font-display text-2xl md:text-3xl font-bold text-primary-foreground mb-1">
                    Dziękuję
                  </p>
                  <p className="font-display text-lg md:text-xl text-primary-foreground/90">
                    谢谢
                  </p>
                </div>

                {/* Poland badge */}
                <div className="absolute top-3 right-3 bg-primary/90 text-primary-foreground px-3 py-1 rounded-full text-xs font-medium">
                  🇵🇱 Polska
                </div>
              </div>

              {/* Back of card */}
              <div 
                className="absolute inset-0 bg-white rounded-xl shadow-elevated overflow-hidden"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <PostcardBack showCropMarks={false} className="p-2 w-full h-full" />
              </div>
            </motion.div>

            {/* Flip indicator */}
            <motion.div 
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-muted-foreground text-sm"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Kliknij aby obrócić</span>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PostcardPreview;
