import { FormEvent, useState } from "react";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CONTACT_EMAIL = "kontakt@podrozowka.pl";

const Contact = () => {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const subject = form.subject.trim() || "Wiadomość ze strony Podróżówka";
    const body = [
      `Imię i nazwisko: ${form.name}`,
      `E-mail: ${form.email}`,
      "",
      form.message,
    ].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="pt-16 md:pt-20">
        <section className="bg-secondary/45 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"><Mail className="h-4 w-4" /> Kontakt</span>
              <h1 className="font-display text-4xl font-bold text-foreground md:text-6xl">Napisz do nas</h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">Masz pytanie o Podróżówki, zamówienie lub współpracę? Chętnie pomożemy.</p>
            </div>

            <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <aside className="rounded-3xl bg-foreground p-7 text-primary-foreground md:p-9">
                <h2 className="font-display text-2xl font-bold">Dane kontaktowe</h2>
                <p className="mt-3 text-sm leading-relaxed text-primary-foreground/75">Odpowiadamy na wiadomości dotyczące projektu, zakupów, zwrotów i współpracy.</p>
                <div className="mt-8 space-y-5 text-sm">
                  <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-start gap-3 transition-opacity hover:opacity-80"><Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span><span className="block text-primary-foreground/60">E-mail</span>{CONTACT_EMAIL}</span></a>
                  <a href="tel:+48695181809" className="flex items-start gap-3 transition-opacity hover:opacity-80"><Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span><span className="block text-primary-foreground/60">Telefon</span>+48 695 181 809</span></a>
                  <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span><span className="block text-primary-foreground/60">Adres korespondencyjny</span>Ogrodniki 10E<br />82-316 Milejewo</span></div>
                </div>
              </aside>

              <form onSubmit={handleSubmit} className="rounded-3xl border border-border bg-card p-6 shadow-soft md:p-9">
                <h2 className="font-display text-2xl font-bold text-foreground">Formularz kontaktowy</h2>
                <p className="mt-2 text-sm text-muted-foreground">Po wysłaniu otworzy się Twoja aplikacja pocztowa z gotową wiadomością do nas.</p>
                <div className="mt-7 grid gap-5">
                  <div className="grid gap-2"><Label htmlFor="contact-name">Imię i nazwisko</Label><Input id="contact-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                  <div className="grid gap-2"><Label htmlFor="contact-email">Adres e-mail</Label><Input id="contact-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
                  <div className="grid gap-2"><Label htmlFor="contact-subject">Temat</Label><Input id="contact-subject" required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Np. pytanie o zamówienie" /></div>
                  <div className="grid gap-2"><Label htmlFor="contact-message">Wiadomość</Label><Textarea id="contact-message" required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className="min-h-36 resize-y" placeholder="Jak możemy pomóc?" /></div>
                </div>
                <Button type="submit" className="mt-7 w-full sm:w-auto"><Send className="mr-2 h-4 w-4" />Przygotuj wiadomość</Button>
              </form>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
