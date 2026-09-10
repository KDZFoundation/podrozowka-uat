import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { publicPageUrl } from "@/lib/publicAppUrl";
import { backendApiUrl } from "@/lib/backendApi";

import { useAuth } from "@/hooks/useAuth";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { auth, storage } from "@/integrations/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

type DeletionRequest = {
  status: "scheduled" | "processing" | "cancelled" | "completed";
  scheduled_for: string;
};

const Settings = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const accountDeletionApi = async (init?: RequestInit) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Brak aktywnej sesji");
    const idToken = await currentUser.getIdToken();
    const response = await fetch(backendApiUrl("/api/account-deletion"), {
      ...init,
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => null) as { error?: string; request?: DeletionRequest | null } | null;
    if (!response.ok) throw new Error(data?.error || "account_deletion_request_failed");
    return data;
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return await firestoreService.getUserProfile(user.id);
    },
    enabled: !!user,
  });

  const { data: deletionRequest } = useQuery({
    queryKey: ["account-deletion", user?.id],
    queryFn: async () => (await accountDeletionApi()).request ?? null,
    enabled: Boolean(user),
  });

  const requestDeletionMutation = useMutation({
    mutationFn: () => accountDeletionApi({ method: "POST", body: JSON.stringify({ action: "request", confirmed: true }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["account-deletion", user?.id], data.request ?? null);
      toast.success("Wniosek o usunięcie konta został zapisany.");
    },
    onError: () => toast.error("Nie udało się zapisać wniosku o usunięcie konta."),
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: () => accountDeletionApi({ method: "POST", body: JSON.stringify({ action: "cancel" }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["account-deletion", user?.id], data.request ?? null);
      toast.success("Wniosek o usunięcie konta został anulowany.");
    },
    onError: () => toast.error("Nie udało się anulować wniosku."),
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
      if (!user?.id) throw new Error("Brak zalogowanego użytkownika");
      await firestoreService.updateUserProfile(user.id, {
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        display_name: values.display_name || null,
        full_name: [values.first_name, values.last_name].filter(Boolean).join(" ") || values.display_name || "",
        email: user.email || "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profil zaktualizowany!");
    },
    onError: (err: unknown) => {
      console.error("Profile save error:", err);
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
      let avatarUrl = "";
      
      try {
        const storageRef = ref(storage, `avatars/${user.id}/avatar.${ext}`);
        await uploadBytes(storageRef, file);
        avatarUrl = await getDownloadURL(storageRef);
      } catch (storageErr) {
        console.warn("Storage upload fallback to base64 data url:", storageErr);
        // Base64 fallback in case bucket rules need auth
        const reader = new FileReader();
        avatarUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      await firestoreService.updateUserProfile(user.id, {
        avatar_url: avatarUrl,
      });

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
        <link rel="canonical" href={publicPageUrl("/settings")} />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content="Ustawienia profilu — Podróżówka" />
        <meta property="og:description" content="Zarządzaj swoim profilem w Podróżówce." />
        <meta property="og:url" content={publicPageUrl("/settings")} />
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

        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
          <div>
            <h2 className="font-semibold text-foreground">Usunięcie konta</h2>
            {deletionRequest?.status === "scheduled" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Wniosek jest aktywny. Konto i dane profilu zostaną usunięte oraz zanonimizowane
                {" "}{new Date(deletionRequest.scheduled_for).toLocaleDateString("pl-PL")}. Możesz go anulować do tego dnia.
              </p>
            ) : deletionRequest?.status === "processing" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Wniosek jest właśnie przetwarzany. Konto zostanie wylogowane po zakończeniu anonimizacji.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Usunięcie konta uruchamia 30-dniowy okres oczekiwania. Dane profilu zostaną zanonimizowane,
                a dane zamówień zachowane wyłącznie w zakresie wymaganym prawem.
              </p>
            )}
          </div>
          {deletionRequest?.status === "scheduled" ? (
            <Button
              type="button"
              variant="outline"
              disabled={cancelDeletionMutation.isPending}
              onClick={() => cancelDeletionMutation.mutate()}
            >
              {cancelDeletionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Anuluj wniosek o usunięcie
            </Button>
          ) : deletionRequest?.status === "processing" ? null : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={requestDeletionMutation.isPending}>
                  <Trash2 className="mr-2 h-4 w-4" /> Usuń konto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Zaplanować usunięcie konta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Masz 30 dni na anulowanie wniosku. Po tym czasie konto zostanie usunięte,
                    a dane profilu zanonimizowane. Dane dokumentów sprzedaży mogą być zachowane,
                    jeśli wymagają tego przepisy.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Wróć</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => requestDeletionMutation.mutate()}
                  >
                    Zaplanuj usunięcie
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </section>
      </main>
    </div>
  );
};

export default Settings;
