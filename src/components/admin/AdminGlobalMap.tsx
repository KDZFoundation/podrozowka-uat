import { useEffect, useRef, useState } from "react";
import { Loader2, Globe2, MapPin, Users } from "lucide-react";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { isFirestoreCatalogEnabled } from "@/integrations/firebase/config";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const countryCoordinates: Record<string, { lat: number; lng: number }> = {
  "Polska": { lat: 52.07, lng: 19.48 },
  "Niemcy": { lat: 51.17, lng: 10.45 },
  "Francja": { lat: 46.23, lng: 2.21 },
  "Włochy": { lat: 41.87, lng: 12.57 },
  "Hiszpania": { lat: 40.46, lng: -3.75 },
  "Portugalia": { lat: 39.40, lng: -8.22 },
  "Grecja": { lat: 39.07, lng: 21.82 },
  "Chorwacja": { lat: 45.10, lng: 15.20 },
  "Czechy": { lat: 49.82, lng: 15.47 },
  "Austria": { lat: 47.52, lng: 14.55 },
  "Szwajcaria": { lat: 46.82, lng: 8.23 },
  "Holandia": { lat: 52.13, lng: 5.29 },
  "Belgia": { lat: 50.50, lng: 4.47 },
  "Szwecja": { lat: 60.13, lng: 18.64 },
  "Norwegia": { lat: 60.47, lng: 8.47 },
  "Dania": { lat: 56.26, lng: 9.50 },
  "Finlandia": { lat: 61.92, lng: 25.75 },
  "Islandia": { lat: 64.96, lng: -19.02 },
  "Irlandia": { lat: 53.14, lng: -7.69 },
  "Wielka Brytania": { lat: 55.38, lng: -3.44 },
  "Turcja": { lat: 38.96, lng: 35.24 },
  "Japonia": { lat: 36.20, lng: 138.25 },
  "Korea Płd.": { lat: 35.91, lng: 127.77 },
  "Tajlandia": { lat: 15.87, lng: 100.99 },
  "Wietnam": { lat: 14.06, lng: 108.28 },
  "Indie": { lat: 20.59, lng: 78.96 },
  "Sri Lanka": { lat: 7.87, lng: 80.77 },
  "Indonezja": { lat: -0.79, lng: 113.92 },
  "Malezja": { lat: 4.21, lng: 101.98 },
  "Filipiny": { lat: 12.88, lng: 121.77 },
  "Chiny": { lat: 35.86, lng: 104.20 },
  "USA": { lat: 37.09, lng: -95.71 },
  "Kanada": { lat: 56.13, lng: -106.35 },
  "Meksyk": { lat: 23.63, lng: -102.55 },
  "Brazylia": { lat: -14.24, lng: -51.93 },
  "Argentyna": { lat: -38.42, lng: -63.62 },
  "Chile": { lat: -35.68, lng: -71.54 },
  "Peru": { lat: -9.19, lng: -75.02 },
  "Kolumbia": { lat: 4.57, lng: -74.30 },
  "Maroko": { lat: 31.79, lng: -7.09 },
  "Egipt": { lat: 26.82, lng: 30.80 },
  "RPA": { lat: -30.56, lng: 22.94 },
  "Tanzania": { lat: -6.37, lng: 34.89 },
  "Kenia": { lat: -0.02, lng: 37.91 },
  "Australia": { lat: -25.27, lng: 133.78 },
  "Nowa Zelandia": { lat: -40.90, lng: 174.89 },
  "Gruzja": { lat: 42.32, lng: 43.36 },
  "Armenia": { lat: 40.07, lng: 45.04 },
  "Rumunia": { lat: 45.94, lng: 24.97 },
  "Węgry": { lat: 47.16, lng: 19.50 },
  "Słowenia": { lat: 46.15, lng: 14.99 },
  "Słowacja": { lat: 48.67, lng: 19.70 },
  "Litwa": { lat: 55.17, lng: 23.88 },
  "Łotwa": { lat: 56.88, lng: 24.60 },
  "Estonia": { lat: 58.60, lng: 25.01 },
  "Ukraina": { lat: 48.38, lng: 31.17 },
  "Bułgaria": { lat: 42.73, lng: 25.49 },
  "Serbia": { lat: 44.02, lng: 21.01 },
  "Czarnogóra": { lat: 42.71, lng: 19.37 },
  "Albania": { lat: 41.15, lng: 20.17 },
  "Macedonia Płn.": { lat: 41.51, lng: 21.75 },
  "Bośnia i Hercegowina": { lat: 43.92, lng: 17.68 },
};

interface RegistrationRow {
  id: string;
  recipient_name: string;
  registered_at: string;
  countryName: string | null;
}

interface AdminGlobalMapJoin {
  id: string;
  recipient_name: string;
  registered_at: string;
  inventory_units: {
    card_designs: {
      countries: {
        name_pl: string;
      } | null;
    } | null;
  } | null;
}

const jitter = (val: number) => val + (Math.random() - 0.5) * 1.5;

const escHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const AdminGlobalMap = () => {
  const [data, setData] = useState<RegistrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const fetch = async () => {
      if (isFirestoreCatalogEnabled) {
        const registrations = await firestoreService.getAdminRegistrations(250);
        if (registrations.length > 0) {
          setData(registrations.map((registration) => ({
            id: registration.id,
            recipient_name: registration.recipient_name,
            registered_at: registration.registered_at,
            countryName: registration.country_name,
          })));
          setIsLoading(false);
          return;
        }
      }

      const { data: rows, error } = await supabase
        .from("recipient_registrations")
        .select("id, recipient_name, registered_at, inventory_units!inner(card_designs!inner(countries!inner(name_pl)))");

      if (!error && rows) {
        const typedRows = rows as unknown as AdminGlobalMapJoin[];
        setData(
          typedRows.map((r: AdminGlobalMapJoin) => ({
            id: r.id,
            recipient_name: r.recipient_name,
            registered_at: r.registered_at,
            countryName: r.inventory_units?.card_designs?.countries?.name_pl ?? null,
          }))
        );
      }
      setIsLoading(false);
    };
    fetch();
  }, []);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [30, 10],
      zoom: 2,
      zoomControl: true,
      scrollWheelZoom: true,
      worldCopyJump: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
      minZoom: 2,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const cluster = (L as unknown as { markerClusterGroup: (options: unknown) => L.LayerGroup }).markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      animate: true,
      zoomToBoundsOnClick: true,
    }).addTo(map);

    mapRef.current = map;
    clusterRef.current = cluster;

    return () => {
      cluster.clearLayers();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Place markers
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster || isLoading) return;
    cluster.clearLayers();

    data.forEach((reg) => {
      const coords = reg.countryName ? countryCoordinates[reg.countryName] : null;
      if (!coords) return;

      const marker = L.marker([jitter(coords.lat), jitter(coords.lng)]);
      marker.bindPopup(
        `<div style="text-align:center;padding:6px;min-width:140px;">
          <div style="font-weight:700;margin-bottom:4px;">${escHtml(reg.countryName ?? "")}</div>
          <div style="font-size:12px;">${escHtml(reg.recipient_name ?? "")}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">${escHtml(new Date(reg.registered_at).toLocaleDateString("pl-PL"))}</div>
        </div>`
      );
      cluster.addLayer(marker);
    });
  }, [data, isLoading]);

  const uniqueCountries = new Set(data.map((d) => d.countryName).filter(Boolean)).size;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-foreground">Mapa Globalna – Rejestracje</h2>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-soft">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{data.length} rejestracji</span>
        </div>
        <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-soft">
          <Globe2 className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground">{uniqueCountries} krajów</span>
        </div>
        <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-soft">
          <MapPin className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-foreground">{data.filter((d) => !d.countryName || !countryCoordinates[d.countryName]).length} bez koordynatów</span>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden shadow-card border border-border">
        <div ref={mapContainerRef} className="h-[500px] md:h-[600px] w-full" />
      </div>

      {data.length === 0 && (
        <p className="text-center text-muted-foreground">Brak rejestracji w bazie danych.</p>
      )}
    </div>
  );
};

export default AdminGlobalMap;
