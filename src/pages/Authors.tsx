import { useEffect, useState } from "react";
import { ExternalLink, Instagram, UserRound } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

type AuthorProfile = {
  id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  social_handle: string | null;
  website_url: string | null;
};

const Authors = () => {
  const [authors, setAuthors] = useState<AuthorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("author_profiles")
        .select("id, display_name, bio, avatar_url, social_handle, website_url")
        .order("display_name");
      setAuthors((data || []) as AuthorProfile[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main id="main-content" className="flex-1 pt-20 md:pt-24">
        <section className="bg-secondary/45 py-14 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm font-semibold text-primary">Fotografie Polski</p>
            <h1 className="mt-2 font-display text-4xl font-bold md:text-6xl">Autorzy zdjęć</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">Poznaj osoby, których fotografie pomagają opowiadać o Polsce podczas podróży.</p>
          </div>
        </section>
        <section className="py-14 md:py-20">
          <div className="container mx-auto px-4">
            {loading ? <p className="text-center text-muted-foreground">Wczytywanie autorów…</p> : authors.length === 0 ? (
              <p className="text-center text-muted-foreground">Lista autorów będzie dostępna wkrótce.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {authors.map((author) => (
                  <article key={author.id} className="rounded-2xl border bg-card p-6 shadow-soft">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                        {author.avatar_url ? <img src={author.avatar_url} alt={`Portret: ${author.display_name}`} className="h-full w-full object-cover" /> : <UserRound className="h-7 w-7 text-muted-foreground" />}
                      </div>
                      <h2 className="font-display text-2xl font-bold">{author.display_name}</h2>
                    </div>
                    {author.bio && <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{author.bio}</p>}
                    {(author.social_handle || author.website_url) && <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium text-primary">
                      {author.social_handle && <span className="inline-flex items-center gap-1"><Instagram className="h-4 w-4" />{author.social_handle}</span>}
                      {author.website_url && <a href={author.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">Strona autora <ExternalLink className="h-3.5 w-3.5" /></a>}
                    </div>}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Authors;
