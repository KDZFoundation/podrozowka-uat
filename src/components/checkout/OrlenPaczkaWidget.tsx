import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import type { PickupPoint } from "@/contexts/CheckoutContext";
import { backendApiUrl } from "@/lib/backendApi";

type WidgetConfig = { token: string | null; map_url: string };
type OrlenPoint = { id?: string; name?: string; addressLine?: string; city?: string; destinationCode?: string; postalCode?: string };

export default function OrlenPaczkaWidget({ onSelect }: { onSelect: (point: PickupPoint) => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const tokenRef = useRef<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let disposed = false;
    const select = (event: Event) => {
      const point = (event as CustomEvent<{ marker?: { options?: OrlenPoint } }>).detail?.marker?.options;
      if (!point?.destinationCode || disposed) return;
      onSelect({ provider: "orlen", name: point.name || point.id || point.destinationCode, address: [point.addressLine, point.postalCode].filter(Boolean).join(", "), city: point.city || "", code: point.destinationCode });
    };
    const attachListeners = () => document.querySelectorAll(".orlen-widget-modal").forEach((node) => {
      const element = node as HTMLElement & { dataset: DOMStringMap };
      if (element.dataset.podrozowkaListener === "1") return;
      element.dataset.podrozowkaListener = "1";
      element.addEventListener("orlenSelectPoint", select);
    });
    const observer = new MutationObserver(attachListeners);
    const start = async () => {
      const response = await fetch(backendApiUrl("/api/orlen/widget-config"));
      const data = response.ok ? await response.json() as WidgetConfig : null;
      if (!data?.token || disposed) { if (!disposed) setState("error"); return; }
      tokenRef.current = data.token;
      const current = document.querySelector<HTMLScriptElement>("script[data-orlen-paczka-widget]");
      if (current) { setState("ready"); attachListeners(); observer.observe(document.body, { childList: true, subtree: true }); return; }
      const script = document.createElement("script");
      script.async = true; script.dataset.orlenPaczkaWidget = "true";
      script.src = `${data.map_url.replace(/\/?$/, "/")}widget.js?token=${encodeURIComponent(data.token)}&v=1.0.0&t=${Math.floor(Date.now() / 1000)}`;
      script.onload = () => { if (!disposed) { setState("ready"); attachListeners(); observer.observe(document.body, { childList: true, subtree: true }); } };
      script.onerror = () => { if (!disposed) setState("error"); };
      document.head.appendChild(script);
    };
    void start();
    return () => { disposed = true; observer.disconnect(); document.querySelectorAll(".orlen-widget-modal").forEach((node) => node.removeEventListener("orlenSelectPoint", select)); };
  }, [onSelect]);

  if (state === "loading") return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Ładowanie mapy ORLEN Paczka…</div>;
  if (state === "error") return <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center"><AlertCircle className="h-6 w-6 text-destructive" /><p className="font-medium">Mapa ORLEN Paczka jest niedostępna.</p><p className="text-sm text-muted-foreground">Sprawdź w panelu administratora token Widgetu przypisany do tej domeny.</p></div>;
  return <div className="rounded-xl border border-border bg-muted/20 p-5"><p className="mb-3 text-sm text-muted-foreground">Otwórz mapę i wybierz automat, stację ORLEN lub punkt partnerski.</p><button ref={buttonRef} type="button" className="orlen-widget orlen-widget-button inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" data-type="dropoff" data-modal="true"><MapPin className="mr-2 h-4 w-4" />Wybierz punkt ORLEN Paczka</button></div>;
}
