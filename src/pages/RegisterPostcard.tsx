import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseAnonKey, supabaseUrl } from "@/integrations/supabase/client";
import RegisterPostcardForm from "@/components/register/RegisterPostcardForm";
import RegisterPostcardSuccess from "@/components/register/RegisterPostcardSuccess";
import RegisterPostcardAlreadyRegistered from "@/components/register/RegisterPostcardAlreadyRegistered";

export interface PostcardInfo {
  business_status: string | null;
  fulfillment_status: string;
  registered_at: string | null;
  traveler_name: string | null;
  recipient_name: string | null;
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

  const requestRegistration = async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    const url = new URL("/functions/v1/register-postcard", supabaseUrl);
    if (method === "GET") url.searchParams.set("token", qrToken || "");
    const response = await fetch(url.toString(), {
      method,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    if (!response.ok) throw new Error(payload?.error || payload?.message || "Nie znaleziono kartki");
    return payload;
  };

  useEffect(() => {
    const fetchPostcard = async () => {
      if (!qrToken) {
        setError("Brak kodu QR");
        setIsLoading(false);
        return;
      }

      try {
        const data = await requestRegistration("GET");
        setPostcard(data as PostcardInfo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Wystąpił błąd podczas ładowania");
      }
      setIsLoading(false);
    };

    fetchPostcard();
  }, [qrToken]);

  const handleSubmit = async (data: {
    recipientName: string;
    recipientMessage: string;
    recipientEmail: string;
    contactOptIn: boolean;
    registeredCountryIso2?: string;
    latitude?: number;
    longitude?: number;
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
    });

    setIsSuccess(true);
    toast({ title: "Kartka zarejestrowana! 🎉" });

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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Nie znaleziono kartki</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <a href="/" className="text-primary hover:underline">Wróć na stronę główną</a>
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
        <title>Zarejestruj Podróżówkę — Podróżówka</title>
        <meta name="description" content="Otrzymałeś Podróżówkę? Zeskanuj kod QR i zarejestruj, kiedy i gdzie dostałeś pocztówkę z Polski." />
        <link rel="canonical" href="https://podrozowka.lovable.app/r" />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content="Zarejestruj Podróżówkę" />
        <meta property="og:description" content="Zarejestruj otrzymaną pocztówkę z Polski i dołącz do globalnej mapy spotkań." />
        <meta property="og:url" content="https://podrozowka.lovable.app/r" />
      </Helmet>
      <RegisterPostcardForm postcard={postcard} onSubmit={handleSubmit} />
    </>
  );
};

export default RegisterPostcard;
