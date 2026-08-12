import { motion } from "framer-motion";
import { Heart, Send } from "lucide-react";
import { thankYouPhrases, greetingsPhrases } from "@/lib/constants";

const LanguageShowcase = () => {
  return (
    <section id="languages" className="py-20 md:py-32 bg-background overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <span className="inline-block px-3 py-1 bg-polish-red/10 text-primary rounded-full text-sm font-medium mb-4">
            Podziękowania
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">
            Podziękuj w każdym języku
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Wybierz wzór z napisem "Dziękuję" lub "Pozdrowienia z Polski" w języku osoby, 
            której wręczasz Podróżówkę.
          </p>
        </div>

        {/* Thank you section */}
        <div className="mb-16">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Heart className="w-5 h-5 text-primary" />
            <h3 className="font-display text-xl font-semibold text-foreground">
              Dziękuję
            </h3>
          </div>

          {/* Scrolling phrases - row 1 */}
          <div className="relative">
            <div className="flex animate-scroll gap-4 mb-4">
              {[...thankYouPhrases, ...thankYouPhrases].map((item, index) => (
                <motion.div
                  key={`thank-${index}`}
                  whileHover={{ scale: 1.05 }}
                  className="flex-shrink-0 bg-card px-6 py-4 rounded-xl shadow-soft border border-border hover:border-primary/30 transition-colors"
                >
                  <p className="font-display text-2xl font-bold text-foreground mb-1">
                    {item.phrase}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.lang} • {item.pronunciation}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Greetings section */}
        <div>
          <div className="flex items-center justify-center gap-2 mb-8">
            <Send className="w-5 h-5 text-accent" />
            <h3 className="font-display text-xl font-semibold text-foreground">
              Pozdrowienia z Polski
            </h3>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {greetingsPhrases.map((item, index) => (
              <motion.div
                key={`greet-${index}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.02 }}
                className="bg-accent/5 border border-accent/20 px-6 py-4 rounded-xl hover:bg-accent/10 transition-colors"
              >
                <p className="font-display text-lg font-semibold text-foreground mb-1">
                  {item.phrase}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.lang}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Inline animation styles */}
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
};

export default LanguageShowcase;
