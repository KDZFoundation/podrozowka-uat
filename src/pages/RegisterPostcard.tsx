import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import RegisterPostcardForm from "@/components/register/RegisterPostcardForm";
import RegisterPostcardSuccess from "@/components/register/RegisterPostcardSuccess";
import RegisterPostcardAlreadyRegistered from "@/components/register/RegisterPostcardAlreadyRegistered";
import { trackEvent } from "@/lib/analytics";
import { getRegistrationCopy } from "@/lib/registrationI18n";
import { backendApiUrl } from "@/lib/backendApi";
import { publicPageUrl } from "@/lib/publicAppUrl";

export interface PostcardInfo {
  business_status: string | null;
  fulfillment_status: string;
  registered_at: string | null;
  traveler_name: string | null;
  recipient_name: string | null;
  available_languages?: Array<{ code: string; name: string }>;
  available_countries?: Array<{ iso2: string; name_pl: string }>;
  design: {
    title: string;
    image_front_url: string | null;
    country_name: string;
    country_iso2: string;
    language_code: string;
  };
}

const RegisterPostcard = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [postcard, setPostcard] = useState<PostcardInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedLanguageCode, setSelectedLanguageCode] = useState("");
  const copy = getRegistrationCopy(selectedLanguageCode || postcard?.design.language_code);

  const requestRegistration = async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    const apiEndpoint = method === "GET"
      ? backendApiUrl(`/api/register-postcard?token=${encodeURIComponent(qrToken || "")}`)
      : backendApiUrl("/api/register-postcard");
    const response = await fetch(apiEndpoint, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    if (!response.ok) throw new Error(payload?.error || payload?.message || copy.postcardNotFound);
    return payload;
  };


  useEffect(() => {
    const fetchPostcard = async () => {
      if (!qrToken) {
        setError(copy.missingQrCode);
        setIsLoading(false);
        return;
      }

      try {
        const data = await requestRegistration("GET");
        const loaded = data as PostcardInfo;
        setPostcard(loaded);
        setSelectedLanguageCode(loaded.design.language_code || loaded.available_languages?.[0]?.code || "en");
      } catch (err) {
        setError(err instanceof Error ? err.message : copy.loadFailed);
      }
      setIsLoading(false);
    };

    fetchPostcard();
  }, [qrToken, copy.loadFailed, copy.missingQrCode]);

  const handleSubmit = async (data: {
    recipientName: string;
    recipientMessage: string;
    recipientEmail: string;
    contactOptIn: boolean;
    registeredCountryIso2?: string;
    latitude?: number;
    longitude?: number;
    languageCode?: string;
  }) => {
    await requestRegistration("POST", {
        token: qrToken,
        recipient_name: data.recipientName.trim(),
        recipient_message: data.recipientMessage.trim() || undefined,
        recipient_email: data.recipientEmail.trim() || undefined,
        contact_opt_in: data.contactOptIn,
        registered_country_iso2: data.registeredCountryIso2 || undefined,
        latitude: data.latitude ?? undefined,
        longitude: data.longitude ?? undefined,
        language_code: data.languageCode || selectedLanguageCode || undefined,
    });

    setIsSuccess(true);
    trackEvent("postcard_registered");
    toast({ title: copy.registeredTitle });

    // Invalidate related queries so dashboard/stats refresh automatically
    queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
    queryClient.invalidateQueries({ queryKey: ['community-gallery'] });
    queryClient.invalidateQueries({ queryKey: ['user-ranking'] });
    queryClient.invalidateQueries({ queryKey: ['postcards'] });
    queryClient.invalidateQueries({ queryKey: ['user-stats'] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" lang={copy.locale}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">{copy.errorTitle}</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <a href="/" className="text-primary hover:underline">{copy.backHome}</a>
        </motion.div>
      </div>
    );
  }

  if (!postcard) return null;

  if (postcard.business_status === 'registered') {
    return <RegisterPostcardAlreadyRegistered postcard={postcard} />;
  }

  if (isSuccess) {
    return <RegisterPostcardSuccess postcard={postcard} />;
  }

  return (
    <>
      <Helmet>
        <html lang={copy.locale} />
        <title>{copy.pageTitle} — Podróżówka</title>
        <meta name="description" content={copy.pageDescription} />
        <link rel="canonical" href={publicPageUrl("/r")} />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content={copy.pageTitle} />
        <meta property="og:description" content={copy.pageDescription} />
        <meta property="og:url" content={publicPageUrl("/r")} />
      </Helmet>
      <RegisterPostcardForm postcard={postcard} languageCode={selectedLanguageCode || postcard.design.language_code} onLanguageChange={setSelectedLanguageCode} onSubmit={handleSubmit} />
    </>
  );
};

export default RegisterPostcard;
