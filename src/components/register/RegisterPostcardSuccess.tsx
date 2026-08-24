import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import type { PostcardInfo } from "@/pages/RegisterPostcard";
import { getLocalizedCountryName, getRegistrationCopy } from "@/lib/registrationI18n";

const RegisterPostcardSuccess = ({ postcard }: { postcard: PostcardInfo }) => {
  const copy = getRegistrationCopy(postcard.design.language_code);
  const countryName = getLocalizedCountryName(postcard.design.country_iso2, postcard.design.country_name, copy.locale);

  return (
  <div className="min-h-screen bg-background flex items-center justify-center p-4" lang={copy.locale}>
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md">
      <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Heart className="w-10 h-10 text-accent" />
      </div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-3">{copy.registeredTitle}</h1>
      <p className="text-muted-foreground mb-4">
        {copy.registeredText} <strong>{countryName}</strong>.
      </p>
      <p className="text-sm text-muted-foreground mb-6">
        {copy.sentBy} <strong>{postcard.traveler_name || "Podróżnik"}</strong>
      </p>
      <a href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all">
        {copy.learnMore}
      </a>
    </motion.div>
  </div>
  );
};

export default RegisterPostcardSuccess;
