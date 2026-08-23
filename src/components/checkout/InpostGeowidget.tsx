import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { PickupPoint } from "@/contexts/CheckoutContext";
import { supabase } from "@/integrations/supabase/client";
import { backendApiUrl } from "@/lib/backendApi";

// Web component type declaration
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "inpost-geowidget": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          token?: string;
          language?: string;
          config?: string;
          onpoint?: string;
        },
        HTMLElement
      >;
    }
  }
}

const SCRIPT_ID = "inpost-geowidget-sdk";
const CSS_ID = "inpost-geowidget-css";

let scriptLoadPromise: Promise<void> | null = null;

type GeowidgetEnvironment = "sandbox" | "production";

const geowidgetAssets = (environment: GeowidgetEnvironment) => environment === "production"
  ? {
      js: "https://geowidget.inpost.pl/inpost-geowidget.js",
      css: "https://geowidget.inpost.pl/inpost-geowidget.css",
    }
  : {
      js: "https://sandbox-easy-geowidget-sdk.easypack24.net/inpost-geowidget.js",
      css: "https://sandbox-easy-geowidget-sdk.easypack24.net/inpost-geowidget.css",
    };

const waitForGeowidgetDefinition = () => customElements.whenDefined("inpost-geowidget");

const loadGeowidgetSdk = (environment: GeowidgetEnvironment): Promise<void> => {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (customElements.get("inpost-geowidget")) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  const assets = geowidgetAssets(environment);

  scriptLoadPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement("link");
      link.id = CSS_ID;
      link.rel = "stylesheet";
      link.href = assets.css;
      document.head.appendChild(link);
    }
    // JS
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        void waitForGeowidgetDefinition().then(resolve, reject);
      }, { once: true });
      existing.addEventListener("error", () => reject(new Error("Script error")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = assets.js;
    // The InPost integration examples load this classic script with `defer`.
    // Waiting for the custom element is essential: `load` alone may fire before
    // the SDK has registered <inpost-geowidget>.
    script.defer = true;
    script.onload = () => {
      void waitForGeowidgetDefinition().then(resolve, reject);
    };
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load InPost SDK"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
};

interface GeowidgetPoint {
  name?: string;
  address?: {
    line1?: string;
    line2?: string;
  };
  address_details?: {
    street?: string;
    city?: string;
  };
}

interface GeowidgetEventDetail extends GeowidgetPoint {
  point?: GeowidgetPoint;
}

interface Props {
  onSelect: (point: PickupPoint) => void;
}

const InpostGeowidget = ({ onSelect }: Props) => {
  const configuredToken = import.meta.env.VITE_INPOST_GEOWIDGET_TOKEN as string | undefined;
  const [token, setToken] = useState<string | undefined>(configuredToken);
  const [environment, setEnvironment] = useState<GeowidgetEnvironment>("sandbox");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-token">(
    configuredToken ? "loading" : "no-token",
  );
  const containerRef = useRef<HTMLDivElement>(null);
  
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (configuredToken) return;
    let cancelled = false;

    // Fetch from Node/Express API with fallback
    fetch(backendApiUrl("/api/inpost/geowidget-config"))
      .then((res) => (res.ok ? res.json() : null))
      .then((apiData: { token?: string | null; environment?: GeowidgetEnvironment } | null) => {
        if (cancelled) return;
        if (apiData?.token) {
          setToken(apiData.token);
          setEnvironment(apiData.environment === "production" ? "production" : "sandbox");
          setStatus("loading");
          return;
        }

        // Fallback to Supabase function or env
        const envToken = import.meta.env.VITE_INPOST_GEOWIDGET_TOKEN;
        if (envToken) {
          setToken(envToken);
          setEnvironment("sandbox");
          setStatus("loading");
          return;
        }

        supabase.functions
          .invoke<{ token: string | null; environment?: GeowidgetEnvironment }>("inpost-geowidget-config", { method: "GET" })
          .then(({ data, error }) => {
            if (cancelled) return;
            if (error || !data?.token) {
              setStatus("no-token");
              return;
            }
            setToken(data.token);
            setEnvironment(data.environment === "production" ? "production" : "sandbox");
            setStatus("loading");
          })
          .catch(() => {
            if (!cancelled) setStatus("no-token");
          });
      })
      .catch(() => {
        if (cancelled) return;
        const envToken = import.meta.env.VITE_INPOST_GEOWIDGET_TOKEN;
        if (envToken) {
          setToken(envToken);
          setStatus("loading");
        } else {
          setStatus("no-token");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configuredToken]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setStatus(prev => prev === "loading" ? "error" : prev);
      }
    }, 10000);

    loadGeowidgetSdk(environment)
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [token, environment]);

  useEffect(() => {
    if (status !== "ready") return;
    const el = containerRef.current?.querySelector("inpost-geowidget");
    if (!el) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<GeowidgetEventDetail>).detail;
      const point = detail?.point ?? detail;
      if (!point) return;
      const name: string = point.name ?? "";
      const line1: string = point?.address?.line1 ?? point?.address_details?.street ?? "";
      const line2: string = point?.address?.line2 ?? "";
      const city: string =
        point?.address_details?.city ??
        point?.address?.line2?.split(",")?.[0] ??
        "";
      onSelectRef.current({
        provider: "inpost",
        name,
        address: [line1, line2].filter(Boolean).join(", ").trim(),
        city,
      });
    };

    el.addEventListener("onpoint", handler as EventListener);
    return () => el.removeEventListener("onpoint", handler as EventListener);
  }, [status]);

  if (status === "no-token") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center bg-muted/40 rounded-lg border border-border">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Konfiguracja paczkomatów jest niedostępna. Spróbuj później.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center bg-muted/40 rounded-lg border border-border">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Nie udało się załadować mapy paczkomatów. Odśwież stronę lub spróbuj później.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-[600px] rounded-lg overflow-hidden border border-border relative bg-muted/20">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === "ready" && (
        <inpost-geowidget
          token={token}
          language="pl"
          config="parcelCollect"
          onpoint="onpoint"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      )}
    </div>
  );
};

export default InpostGeowidget;
