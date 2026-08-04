import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Loader2, User, MessageSquare, Mail, MapPin, Globe } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { PostcardInfo } from "@/pages/RegisterPostcard";

const formSchema = z.object({
  recipientName: z.string().min(1, "Podaj swoje imię").max(100, "Maksymalnie 100 znaków"),
  recipientMessage: z.string().max(500, "Maksymalnie 500 znaków").default(""),
  recipientEmail: z.union([z.literal(""), z.string().email("Podaj prawidłowy adres email")]).default(""),
  registeredCountryIso2: z.string().optional(),
  contactOptIn: z.boolean().default(false),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  postcard: PostcardInfo;
  onSubmit: (data: FormValues) => Promise<void>;
}

const RegisterPostcardForm = ({ postcard, onSubmit }: Props) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Twoja przeglądarka nie obsługuje geolokalizacji", variant: "destructive" });
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setValue('latitude', pos.coords.latitude);
        form.setValue('longitude', pos.coords.longitude);
        setGeoStatus('done');
      },
      () => {
        setGeoStatus('error');
        toast({ title: "Nie udało się pobrać lokalizacji", variant: "destructive" });
      },
      { timeout: 10000 }
    );
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      recipientName: "",
      recipientMessage: "",
      recipientEmail: "",
      registeredCountryIso2: postcard.design.country_iso2 || "",
      contactOptIn: false,
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      toast({
        title: "Wystąpił błąd",
        description: err instanceof Error ? err.message : "Spróbuj ponownie",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const messageValue = form.watch("recipientMessage");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="bg-card rounded-2xl p-6 md:p-8 shadow-soft">
          <div className="text-center mb-6">
            <span className="text-4xl mb-2 block">🇵🇱</span>
            <h1 className="font-display text-2xl font-bold text-foreground mb-1">
              Masz Podróżówkę!
            </h1>
            <p className="text-muted-foreground">
              {postcard.design.country_name} — {postcard.design.title}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Od: <strong className="text-foreground">{postcard.traveler_name || "Podróżnik"}</strong>
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="recipientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Twoje imię *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input placeholder="Jak masz na imię?" className="pl-10" maxLength={100} {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recipientMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Krótka wiadomość (opcjonalnie)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                        <Textarea placeholder="Napisz coś do Podróżnika..." className="pl-10" rows={3} maxLength={500} {...field} />
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{messageValue.length}/500</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {postcard.available_countries && postcard.available_countries.length > 0 && (
                <FormField
                  control={form.control}
                  name="registeredCountryIso2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kraj otrzymania kartki</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-muted-foreground" />
                              <SelectValue placeholder="Wybierz kraj..." />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {postcard.available_countries?.map((c) => (
                            <SelectItem key={c.iso2} value={c.iso2}>
                              {c.name_pl}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="recipientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (opcjonalnie)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input type="email" placeholder="twoj@email.com" className="pl-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactOptIn"
                render={({ field }) => (
                  <FormItem className="flex items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                    </FormControl>
                    <FormLabel className="text-sm text-muted-foreground font-normal cursor-pointer">
                      Wyrażam zgodę na kontakt ze strony Podróżnika, który wysłał tę kartkę
                    </FormLabel>
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={geoStatus === 'loading' || geoStatus === 'done'}
                onClick={handleGeolocation}
              >
                {geoStatus === 'loading' ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Pobieranie lokalizacji...</>
                ) : geoStatus === 'done' ? (
                  <><MapPin className="w-4 h-4 mr-2 text-green-500" />Lokalizacja dodana!</>
                ) : (
                  <><MapPin className="w-4 h-4 mr-2" />Udostępnij swoją lokalizację (opcjonalnie)</>
                )}
              </Button>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rejestrowanie...</>
                ) : (
                  <><CheckCircle className="w-4 h-4 mr-2" />Zarejestruj kartkę</>
                )}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <a href="/" className="hover:text-foreground transition-colors">podrozowka.pl</a> — Kartki z Polski dla świata
        </p>
      </motion.div>
    </div>
  );
};

export default RegisterPostcardForm;
