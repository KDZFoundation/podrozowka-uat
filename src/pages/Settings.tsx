import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const profileSchema = z.object({
  first_name: z.string().max(50, "Maks. 50 znaków").nullable(),
  last_name: z.string().max(50, "Maks. 50 znaków").nullable(),
  display_name: z.string().max(100, "Maks. 100 znaków").nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const Settings = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: null,
      last_name: null,
      display_name: null,
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        first_name: profile.first_name ?? null,
        last_name: profile.last_name ?? null,
        display_name: profile.display_name ?? null,
      });
    }
  }, [profile, form]);

  const updateProfileMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: values.first_name || null,
          last_name: values.last_name || null,
          display_name: values.display_name || null,
        })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profil zaktualizowany!");
    },
    onError: () => {
      toast.error("Nie udało się zapisać zmian.");
    },
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Dozwolone są tylko pliki graficzne.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Maksymalny rozmiar pliku to 2 MB.");
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Awatar zaktualizowany!");
    } catch (err) {
      console.error("Avatar upload error:", err);
      toast.error("Nie udało się wgrać zdjęcia.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getInitials = () => {
    const first = profile?.first_name?.[0] ?? "";
    const last = profile?.last_name?.[0] ?? "";
    if (first || last) return `${first}${last}`.toUpperCase();
    return profile?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Ustawienia profilu — Podróżówka</title>
        <meta name="description" content="Zarządzaj swoim profilem Podróżówki: imię, nazwisko, nazwa wyświetlana i zdjęcie profilowe." />
        <link rel="canonical" href="https://podrozowka.lovable.app/settings" />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content="Ustawienia profilu — Podróżówka" />
        <meta property="og:description" content="Zarządzaj swoim profilem w Podróżówce." />
        <meta property="og:url" content="https://podrozowka.lovable.app/settings" />
      </Helmet>
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Powrót</span>
            </button>
            <h1 className="font-display text-xl font-semibold text-foreground">
              Ustawienia profilu
            </h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-lg space-y-8">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <Avatar className="w-24 h-24 border-2 border-border">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt="Awatar" />
              <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-primary hover:underline disabled:opacity-50"
          >
            {isUploading ? "Wgrywanie…" : "Zmień zdjęcie"}
          </button>
        </div>

        {/* Profile Form */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => updateProfileMutation.mutate(v))}
            className="space-y-5"
          >
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wyświetlana nazwa</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="np. Janek_Explorer"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Adres e-mail konta</FormLabel>
              <FormControl>
                <Input type="email" value={user.email ?? ""} readOnly disabled />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Ten adres jest używany do potwierdzania konta i zostanie zapisany przy nowych zamówieniach.
              </p>
            </FormItem>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Imię</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Jan"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwisko</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Kowalski"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={updateProfileMutation.isPending}
            >
              {updateProfileMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Zapisz zmiany
            </Button>
          </form>
        </Form>
      </main>
    </div>
  );
};

export default Settings;
