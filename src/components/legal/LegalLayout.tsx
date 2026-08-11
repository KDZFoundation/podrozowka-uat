import type { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

type LegalLayoutProps = {
  title: string;
  description: string;
  path: string;
  updatedAt: string;
  children: ReactNode;
};

const LegalLayout = ({ title, description, path, updatedAt, children }: LegalLayoutProps) => (
  <div className="flex min-h-screen flex-col bg-background">
    <Helmet>
      <title>{title} — Podróżówka</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={`https://podrozowka.pl${path}`} />
      <meta property="og:title" content={`${title} — Podróżówka`} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={`https://podrozowka.pl${path}`} />
    </Helmet>
    <Header />
    <main id="main-content" className="flex-1 pb-16 pt-24 md:pt-28">
      <article className="container mx-auto max-w-4xl px-4">
        <header className="mb-10 border-b border-border pb-6">
          <p className="mb-2 text-sm font-medium text-primary">Podróżówka</p>
          <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Ostatnia aktualizacja: {updatedAt}</p>
        </header>
        <div className="prose prose-lg max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground">
          {children}
        </div>
      </article>
    </main>
    <Footer />
  </div>
);

export default LegalLayout;
