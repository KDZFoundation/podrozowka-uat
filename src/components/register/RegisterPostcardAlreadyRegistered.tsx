import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import type { PostcardInfo } from "@/pages/RegisterPostcard";
import { getLocalizedCountryName, getRegistrationCopy } from "@/lib/registrationI18n";

const RegisterPostcardAlreadyRegistered = ({ postcard }: { postcard: PostcardInfo }) => {
  const copy = getRegistrationCopy(postcard.design.language_code);
  const countryName = getLocalizedCountryName(postcard.design.country_iso2, postcard.design.country_name, copy.locale);

  return (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
      <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-8 h-8 text-accent" />
      </div>
      <h1 className="font-display text-2xl font-bold text-foreground mb-2">{copy.alreadyRegisteredTitle}</h1>
      <p className="text-muted-foreground mb-2">
        {copy.alreadyRegisteredText} <strong>{postcard.recipient_name}</strong>.
      </p>
      <p className="text-sm text-muted-foreground mb-6">
        {countryName} — {postcard.design.title}
      </p>
      <a href="/" className="text-primary hover:underline">{copy.learnMore}</a>
    </motion.div>
  </div>
  );
};

export default RegisterPostcardAlreadyRegistered;
