import { useMemo, useState } from "react";
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
import { getLocalizedCountryName, getRegistrationCopy } from "@/lib/registrationI18n";

const makeFormSchema = (copy: ReturnType<typeof getRegistrationCopy>) => z.object({
  recipientName: z.string().min(1, copy.nameRequired).max(100, copy.nameTooLong),
  recipientMessage: z.string().max(500, copy.messageTooLong).default(""),
  recipientEmail: z.union([z.literal(""), z.string().email(copy.emailInvalid)]).default(""),
  registeredCountryIso2: z.string().optional(),
  contactOptIn: z.boolean().default(false),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

interface Props {
  postcard: PostcardInfo;
  onSubmit: (data: FormValues) => Promise<void>;
}

const RegisterPostcardForm = ({ postcard, onSubmit }: Props) => {
  const { toast } = useToast();
  const copy = getRegistrationCopy(postcard.design.language_code);
  const formSchema = useMemo(() => makeFormSchema(copy), [copy]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      toast({ title: copy.locationUnsupported, variant: "destructive" });
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
        toast({ title: copy.locationFailed, variant: "destructive" });
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
        title: copy.genericErrorTitle,
        description: err instanceof Error ? err.message : copy.genericErrorText,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const messageValue = form.watch("recipientMessage");
  const designCountryName = getLocalizedCountryName(postcard.design.country_iso2, postcard.design.country_name, copy.locale);

  return (
    <div className="min-h-screen bg-gradient-hero px-4 py-8 md:py-12" lang={copy.locale}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="mb-4 text-center">
          <a href="/" className="font-display text-xl font-semibold text-foreground">Podróżówka</a>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{copy.registration}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border/70 p-6 shadow-card md:p-8">
          <div className="text-center mb-6">
            {postcard.design.image_front_url ? (
              <img src={postcard.design.image_front_url} alt="" className="mx-auto mb-4 h-32 w-full max-w-xs rounded-xl object-cover shadow-soft" referrerPolicy="no-referrer" />
            ) : (
              <span className="mb-2 block text-4xl">🇵🇱</span>
            )}
            <span className="mb-2 inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{copy.qrRecognized}</span>
            <h1 className="font-display text-2xl font-bold text-foreground mb-1">
              {copy.heading}
            </h1>
            <p className="text-muted-foreground">
              {designCountryName} — {postcard.design.title}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {copy.from} <strong className="text-foreground">{postcard.traveler_name || "Podróżnik"}</strong>
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="recipientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{copy.yourName}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input placeholder={copy.namePlaceholder} className="pl-10" maxLength={100} {...field} />
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
                    <FormLabel>{copy.shortMessage}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                        <Textarea placeholder={copy.messagePlaceholder} className="pl-10" rows={3} maxLength={500} {...field} />
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
                      <FormLabel>{copy.receivedCountry}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-muted-foreground" />
                              <SelectValue placeholder={copy.chooseCountry} />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {postcard.available_countries?.map((c) => (
                            <SelectItem key={c.iso2} value={c.iso2}>
                              {getLocalizedCountryName(c.iso2, c.name_pl, copy.locale)}
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
                    <FormLabel>{copy.email}</FormLabel>
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
                      {copy.contactConsent}
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
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{copy.gettingLocation}</>
                ) : geoStatus === 'done' ? (
                  <><MapPin className="w-4 h-4 mr-2 text-green-500" />{copy.locationAdded}</>
                ) : (
                  <><MapPin className="w-4 h-4 mr-2" />{copy.shareLocation}</>
                )}
              </Button>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{copy.registering}</>
                ) : (
                  <><CheckCircle className="w-4 h-4 mr-2" />{copy.register}</>
                )}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <a href="/" className="hover:text-foreground transition-colors">podrozowka.pl</a> — {copy.footer}
        </p>
      </motion.div>
    </div>
  );
};

export default RegisterPostcardForm;
