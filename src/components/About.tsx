import { motion } from "framer-motion";
import { Heart, Globe, Users, Sparkles } from "lucide-react";
import PostcardPreview from "@/components/PostcardPreview";

const features = [
  { icon: Heart, title: "Osobiste podziękowanie", description: "Wręcz coś wyjątkowego zamiast zwykłej wizytówki czy napiwku." },
  { icon: Globe, title: "Ambasador Polski", description: "Pokaż światu piękno naszego kraju poprzez sztukę i fotografię." },
  { icon: Users, title: "Budowanie relacji", description: "Twórz autentyczne więzi międzykulturowe podczas swoich podróży." },
  { icon: Sparkles, title: "Unikalna pamiątka", description: "Każda Podróżówka to dzieło sztuki, które zostanie zapamiętane." },
];

const About = () => (
  <section id="about" className="bg-background py-20 md:py-32">
    <div className="container mx-auto px-4">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} viewport={{ once: true }}>
            <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">O projekcie</span>
            <h2 className="mb-6 font-display text-3xl font-bold leading-tight text-foreground md:text-4xl lg:text-5xl">Odwrócona pocztówka — <span className="text-primary">nowy sposób</span> na podziękowanie</h2>
            <p className="mb-6 text-lg leading-relaxed text-muted-foreground">Podróżówka to wyjątkowa koncepcja „odwróconej pocztówki”. Zamiast wysyłać pocztówki do domu, zabierasz je ze sobą i wręczasz jako podziękowanie za życzliwość, pomoc lub po prostu jako miły gest dla osób spotkanych w podróży.</p>
            <p className="mb-4 text-muted-foreground">Każda karta prezentuje piękno Polski — krajobrazy, architekturę i dzieła polskich artystów — oraz zawiera podziękowania w języku odbiorcy.</p>
            <p className="mb-8 text-sm italic text-muted-foreground">Na odwrocie każdej Podróżówki znajdziesz miejsce na wiadomość oraz kod QR, dzięki któremu obdarowana osoba może przypisać kartkę do Twojej historii podróży.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => (
                <motion.div key={feature.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.1 }} viewport={{ once: true }} className="flex gap-3 rounded-xl bg-secondary p-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10"><feature.icon className="h-5 w-5 text-primary" /></div>
                  <div><h3 className="mb-1 text-sm font-semibold text-foreground">{feature.title}</h3><p className="text-xs text-muted-foreground">{feature.description}</p></div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
          <PostcardPreview embedded />
        </motion.div>
      </div>
    </div>
  </section>
);

export default About;
