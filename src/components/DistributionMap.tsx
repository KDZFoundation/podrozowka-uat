import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Globe2 } from "lucide-react";
import L from "leaflet";
import { backendApiUrl } from "@/lib/backendApi";
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

interface CountryCount {
  country: string;
  count: number;
  lat: number;
  lng: number;
}

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
};

const polandIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DistributionMap = () => {
  const [countryData, setCountryData] = useState<CountryCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const leafletColors = useMemo(() => {
    if (typeof window === "undefined") return { primary: "hsl(0 72% 45%)", accent: "hsl(145 35% 32%)" };
    const root = getComputedStyle(document.documentElement);
    const primaryHsl = root.getPropertyValue("--primary").trim();
    const accentHsl = root.getPropertyValue("--accent").trim();
    return {
      primary: primaryHsl ? `hsl(${primaryHsl})` : "hsl(0 72% 45%)",
      accent: accentHsl ? `hsl(${accentHsl})` : "hsl(145 35% 32%)",
    };
  }, []);

  useEffect(() => {
    const fetchDistribution = async () => {
      try {
        const response = await fetch(backendApiUrl("/api/public/distribution"));
        if (!response.ok) throw new Error("distribution_unavailable");
        const data = await response.json() as { country: string; count: number }[];
        setCountryData(data.map(({ country, count }) => {
          const coords = countryCoordinates[country];
          return coords ? { country, count, lat: coords.lat, lng: coords.lng } : null;
        }).filter((item): item is CountryCount => item !== null));
      } catch (error) {
        console.warn("Distribution map data unavailable:", error);
        setCountryData([]);
      }
      setIsLoading(false);
    };
    fetchDistribution();
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [52.07, 19.48], zoom: 3, zoomControl: true, scrollWheelZoom: true,
      worldCopyJump: false, maxBounds: [[-85, -180], [85, 180]], maxBoundsViscosity: 1.0, minZoom: 2,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const layer = (L as unknown as { markerClusterGroup: (options: unknown) => L.LayerGroup }).markerClusterGroup({
      maxClusterRadius: 40, spiderfyOnMaxZoom: true, showCoverageOnHover: false, animate: true, animateAddingMarkers: true, zoomToBoundsOnClick: true,
    }).addTo(map);
    mapRef.current = map;
    markersLayerRef.current = layer;
    return () => { layer.clearLayers(); map.remove(); markersLayerRef.current = null; mapRef.current = null; };
  }, []);

  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    L.marker([52.07, 19.48], { icon: polandIcon })
      .bindPopup(`<div style="text-align:center;padding:8px;"><div style="font-weight:700;">🇵🇱 Polska</div><div style="font-size:12px;">Punkt startu wszystkich Podróżówek</div></div>`)
      .addTo(layer);
    countryData.forEach((c) => {
      L.circleMarker([c.lat, c.lng], { radius: Math.min(Math.max(c.count * 3, 8), 25), color: leafletColors.accent, fillColor: leafletColors.accent, fillOpacity: 0.7, weight: 2 })
        .bindPopup(`<div style="text-align:center;padding:8px;"><div style="font-weight:700;">${c.country}</div><div style="font-size:12px;"><span style="font-weight:700;color:${leafletColors.accent};">${c.count}</span> ${c.count === 1 ? "Podróżówka" : "Podróżówek"}</div></div>`)
        .addTo(layer);
    });
  }, [countryData, leafletColors.accent]);

  const totalRegistered = countryData.reduce((sum, c) => sum + c.count, 0);

  return (
    <section id="distribution-map" className="py-20 md:py-32 bg-background">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} viewport={{ once: true }} className="text-center mb-12">
          <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4">Globalna dystrybucja</span>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">Gdzie są nasze Podróżówki?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Śledź na żywo, do których krajów trafiły Podróżówki zarejestrowane przez obdarowanych.</p>
        </motion.div>
        <div className="flex flex-wrap justify-center gap-6 mb-8">
          <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-soft">
            <Globe2 className="w-5 h-5 text-accent" />
            <span className="text-foreground font-medium">{countryData.length} krajów</span>
          </div>
          <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-full shadow-soft">
            <MapPin className="w-5 h-5 text-primary" />
            <span className="text-foreground font-medium">{totalRegistered} zarejestrowanych</span>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true }} className="rounded-2xl overflow-hidden shadow-card">
          <div ref={mapContainerRef} className="h-[400px] md:h-[500px] w-full" aria-label="Mapa dystrybucji Podróżówek" />
        </motion.div>
        <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm">
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-primary rounded-full" /><span className="text-muted-foreground">Polska - punkt startu</span></div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-accent rounded-full" /><span className="text-muted-foreground">Kraje z zarejestrowanymi Podróżówkami</span></div>
        </div>
        {!isLoading && countryData.length === 0 && (
          <div className="mt-8 text-center"><p className="text-muted-foreground">Brak jeszcze zarejestrowanych Podróżówek. Bądź pierwszy i zarejestruj swoją!</p></div>
        )}
      </div>
    </section>
  );
};

export default DistributionMap;
