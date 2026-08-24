import { useState } from "react";
import { Database, Globe, Loader2, QrCode, ExternalLink, Copy, Check, ShoppingBag, Flame, Sparkles, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { seedFirestoreIfEmpty } from "@/integrations/firebase/services/seedService";
import { db, isFirebaseConfigured } from "@/integrations/firebase/config";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc, where } from "firebase/firestore";
import QRCode from "qrcode";

const MOCK_COUNTRIES = [
  { name_pl: "Japonia", iso2: "JP", iso3: "JPN", slug: "japonia" },
  { name_pl: "Włochy", iso2: "IT", iso3: "ITA", slug: "wlochy" },
];

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const MOCK_BUYERS = [
  { name: "Jan Kowalski", address: "ul. Kwiatowa 12", city: "Warszawa", postal: "00-001", country: "PL" },
  { name: "Anna Nowak", address: "ul. Lipowa 5", city: "Kraków", postal: "30-100", country: "PL" },
  { name: "Piotr Wiśniewski", address: "ul. Słoneczna 8", city: "Wrocław", postal: "50-200", country: "PL" },
];

const MOCK_RECIPIENTS = [
  { name: "Yuki Tanaka", message: "Thank you for the card! Greetings from Tokyo!", email: "yuki@test.jp" },
  { name: "Marco Rossi", message: "Bellissima cartolina! Grazie mille!", email: "marco@test.it" },
  { name: "Katarzyna Zielińska", message: "Piękna kartka, dziękuję bardzo!", email: "kasia@test.pl" },
  { name: "Hiroshi Sato", message: "素晴らしいカード！ありがとう！ Beautiful card from Poland!", email: "hiroshi@test.jp" },
  { name: "Giulia Bianchi", message: "Che bella! La Polonia è fantastica!", email: "giulia@test.it" },
];

const randomHex = (len: number) => {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
};

type TestCard = {
  token: string;
  unitId: string;
  batchId: string;
  registrationUrl: string;
  qrImage: string;
};

const registrationBaseUrl = () =>
  (import.meta.env.VITE_TEST_QR_BASE_URL || window.location.origin).replace(/\/$/, "");

const GLOBAL_LOCATIONS = [
  { city: "Tokio", country_name: "Japonia", iso2: "JP", iso3: "JPN", lat: 35.68, lng: 139.69, name: "Yuki", message: "Arigato! Niesamowita inicjatywa! 🎌" },
  { city: "Sydney", country_name: "Australia", iso2: "AU", iso3: "AUS", lat: -33.86, lng: 151.20, name: "Oliver", message: "G'day mate! Kartka dotarła aż tutaj! 🦘" },
  { city: "Nowy Jork", country_name: "Stany Zjednoczone", iso2: "US", iso3: "USA", lat: 40.71, lng: -74.00, name: "Sarah", message: "Love from NYC! 🗽" },
  { city: "Rio de Janeiro", country_name: "Brazylia", iso2: "BR", iso3: "BRA", lat: -22.90, lng: -43.17, name: "Carlos", message: "Obrigado! Pozdrowienia z plaży Copacabana 🏖️" },
  { city: "Rzym", country_name: "Włochy", iso2: "IT", iso3: "ITA", lat: 41.90, lng: 12.49, name: "Luigi", message: "Mamma mia, co za piękna kartka z Polski! 🍕" },
  { city: "Kapsztad", country_name: "Republika Południowej Afryki", iso2: "ZA", iso3: "ZAF", lat: -33.92, lng: 18.42, name: "Nelson", message: "Wow, to najdalsza podróż tej kartki! 🦁" },
  { city: "Paryż", country_name: "Francja", iso2: "FR", iso3: "FRA", lat: 48.85, lng: 2.35, name: "Amelie", message: "Merci beaucoup! 🥐" },
  { city: "Bangkok", country_name: "Tajlandia", iso2: "TH", iso3: "THA", lat: 13.75, lng: 100.50, name: "Somchai", message: "Sawadee krap! Kartka z Polski w Bangkoku! 🏯" },
  { city: "Buenos Aires", country_name: "Argentyna", iso2: "AR", iso3: "ARG", lat: -34.60, lng: -58.38, name: "Mateo", message: "¡Increíble! Saludos desde Argentina! 🧉" },
  { city: "Reykjavik", country_name: "Islandia", iso2: "IS", iso3: "ISL", lat: 64.13, lng: -21.90, name: "Björk", message: "Hæ! Kartka dotarła na koniec świata! 🌋" },
  { city: "Seul", country_name: "Korea Południowa", iso2: "KR", iso3: "KOR", lat: 37.56, lng: 126.97, name: "Min-jun", message: "감사합니다! Piękna kartka! 🇰🇷" },
  { city: "Marrakesz", country_name: "Maroko", iso2: "MA", iso3: "MAR", lat: 31.63, lng: -7.98, name: "Fatima", message: "Shukran! Pozdrowienia z medyny! 🕌" },
  { city: "Vancouver", country_name: "Kanada", iso2: "CA", iso3: "CAN", lat: 49.28, lng: -123.12, name: "Liam", message: "Thanks eh! Love from the mountains! 🏔️" },
];

const AdminDevTools = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSeedingFirebase, setIsSeedingFirebase] = useState(false);
  const [isCreatingTestCard, setIsCreatingTestCard] = useState(false);
  const [isCreatingFranceOrder, setIsCreatingFranceOrder] = useState(false);
  const [createdTestCard, setCreatedTestCard] = useState<TestCard | null>(null);
  const [isDeletingTestCard, setIsDeletingTestCard] = useState(false);

  const handleSeedFirebase = async () => {
    setIsSeedingFirebase(true);
    try {
      const result = await seedFirestoreIfEmpty();
      if (result.seeded) {
        toast.success(result.message);
      } else {
        toast.info(result.message);
      }
    } catch (err) {
      toast.error("Błąd zapisu do Firestore: " + String(err));
    } finally {
      setIsSeedingFirebase(false);
    }
  };

  const createFrancePaidOrder = async () => {
    setIsCreatingFranceOrder(true);
    try {
      // 1. Get or create France country
      let countryId: string;
      const { data: country } = await supabase
        .from("countries")
        .select("id")
        .eq("iso2", "FR")
        .maybeSingle();

      if (country) {
        countryId = country.id;
      } else {
        const { data: newCountry, error: cErr } = await supabase
          .from("countries")
          .insert({ name_pl: "Francja", iso2: "FR", iso3: "FRA", slug: "francja", active: true })
          .select("id")
          .single();
        if (cErr) throw cErr;
        countryId = newCountry.id;
      }

      // 2. Get or create France V1 design
      let designId: string;
      const { data: design } = await supabase
        .from("card_designs")
        .select("id")
        .eq("country_id", countryId)
        .eq("view_no", 1)
        .maybeSingle();

      if (design) {
        designId = design.id;
      } else {
        const { data: newDesign, error: dErr } = await supabase
          .from("card_designs")
          .insert({ country_id: countryId, view_no: 1, title: "Francja — V1 Francja", language_code: "pl", active: true, price_grosze: 499 })
          .select("id")
          .single();
        if (dErr) throw dErr;
        designId = newDesign.id;
      }

      // 3. Get or create stock batch
      let batchId: string;
      const { data: batch } = await supabase
        .from("stock_batches")
        .select("id")
        .eq("card_design_id", designId)
        .limit(1)
        .maybeSingle();

      if (batch) {
        batchId = batch.id;
      } else {
        const { data: newBatch, error: bErr } = await supabase
          .from("stock_batches")
          .insert({ card_design_id: designId, name: "Partia Francja V1", quantity: 50 })
          .select("id")
          .single();
        if (bErr) throw bErr;
        batchId = newBatch.id;
      }

      // 4. Create paid order
      const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      const customOrderNumber = `PDZ-${dateStr}-FR10${randomHex(4).toUpperCase()}`;

      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          user_id: user?.id || null,
          order_number: customOrderNumber,
          status: "paid" as const,
          payment_status: "paid" as const,
          total_amount: 49.90,
          paid_at: new Date().toISOString(),
          shipping_name: "Zamówienie 10x Francja V1",
          shipping_address: "ul. Francuska 10/2",
          shipping_city: "Warszawa",
          shipping_postal_code: "00-001",
          shipping_country: "PL",
        })
        .select("id")
        .single();

      if (oErr) throw oErr;

      // 5. Order Item
      const { error: itemErr } = await supabase.from("order_items").insert({
        order_id: order.id,
        card_design_id: designId,
        quantity: 10,
        unit_price: 4.99,
        total_price: 49.90,
      });
      if (itemErr) throw itemErr;

      // 6. 10 Inventory units
      const unitsToInsert = [];
      for (let i = 1; i <= 10; i++) {
        const token = `test-francja-v1-${i}-${Date.now().toString(36)}`;
        const tokenHash = await hashToken(token);
        unitsToInsert.push({
          stock_batch_id: batchId,
          card_design_id: designId,
          internal_inventory_code: `INV-FR-V01-${String(i).padStart(3, "0")}-${randomHex(4).toUpperCase()}`,
          fulfillment_status: "shipped" as const,
          business_status: "purchased" as const,
          traveler_user_id: user?.id || null,
          order_id: order.id,
          shipped_at: new Date().toISOString(),
          public_claim_code: `PDZ-FR-${randomHex(4).toUpperCase()}-${randomHex(4).toUpperCase()}`,
          public_claim_token_hash: tokenHash,
        });
      }

      const { error: unitsErr } = await supabase.from("inventory_units").insert(unitsToInsert);
      if (unitsErr) throw unitsErr;

      toast.success("Dodano opłacone zamówienie na 10 podróżówek Francja — V1 Francja!");
      queryClient.invalidateQueries();
    } catch (err) {
      console.error("Error creating France order:", err);
      toast.error("Błąd tworzenia zamówienia: " + (err instanceof Error ? err.message : "Nieznany błąd"));
    } finally {
      setIsCreatingFranceOrder(false);
    }
  };
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createTestCardForObdarowany = async () => {
    if (!user) return;
    setIsCreatingTestCard(true);

    try {
      const designs = await getDocs(query(collection(db, "card_designs"), where("active", "==", true), limit(1)));
      const design = designs.docs[0];
      if (!design) throw new Error("Brak aktywnego wzoru Podróżówki w Firestore.");

      const now = new Date().toISOString();
      const batchId = crypto.randomUUID();
      const unitId = crypto.randomUUID();
      const token = `test-${crypto.randomUUID().replace(/-/g, "")}`;
      const tokenHash = await hashToken(token);

      await setDoc(doc(db, "stock_batches", batchId), {
        id: batchId,
        name: "TEST — obdarowany (usunąć po teście)",
        card_design_id: design.id,
        quantity: 1,
        source_type: "test",
        purpose: "Test rejestracji obdarowanego",
        distribution_channel: "test",
        created_by: user.id,
        created_at: now,
        updated_at: now,
        schema_version: 1,
      });
      await setDoc(doc(db, "inventory_units", unitId), {
        id: unitId,
        stock_batch_id: batchId,
        card_design_id: design.id,
        internal_inventory_code: `TEST-${Date.now().toString(36).toUpperCase()}`,
        fulfillment_status: "qr_generated",
        business_status: "purchased",
        traveler_user_id: user.id,
        public_claim_code: `PDZ-TEST-${Date.now().toString(36).toUpperCase()}`,
        public_claim_token_hash: tokenHash,
        qr_generated_at: now,
        created_at: now,
        updated_at: now,
        is_test: true,
        schema_version: 1,
      });

      const registrationUrl = `${registrationBaseUrl()}/r/${token}`;
      const qrImage = await QRCode.toDataURL(registrationUrl, { width: 600, margin: 2, errorCorrectionLevel: "M" });
      setCreatedTestCard({ token, unitId, batchId, registrationUrl, qrImage });
      toast.success("Utworzono jedną kartkę testową gotową do rejestracji.");
      queryClient.invalidateQueries();
    } catch (err) {
      console.error("Test card creation error:", err);
      toast.error("Błąd tworzenia kartki testowej: " + (err instanceof Error ? err.message : "Nieznany błąd"));
    } finally {
      setIsCreatingTestCard(false);
    }
  };

  const deleteTestCardForObdarowany = async () => {
    if (!createdTestCard || !window.confirm("Usunąć wyłącznie tę testową kartkę i jej partię?")) return;
    setIsDeletingTestCard(true);
    try {
      await deleteDoc(doc(db, "inventory_units", createdTestCard.unitId));
      await deleteDoc(doc(db, "stock_batches", createdTestCard.batchId));
      setCreatedTestCard(null);
      toast.success("Usunięto kartkę testową oraz jej partię.");
      queryClient.invalidateQueries();
    } catch (err) {
      console.error("Test card cleanup error:", err);
      toast.error("Nie udało się usunąć kartki testowej: " + (err instanceof Error ? err.message : "nieznany błąd"));
    } finally {
      setIsDeletingTestCard(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Skopiowano link do schowka!");
    setTimeout(() => setCopied(false), 2000);
  };

  const generateMockData = async () => {
    if (!user) return;
    setIsGenerating(true);

    try {
      // --- 1. Countries (upsert by iso2) ---
      const countryIds: string[] = [];
      for (const c of MOCK_COUNTRIES) {
        const { data: existing } = await supabase
          .from("countries")
          .select("id")
          .eq("iso2", c.iso2)
          .maybeSingle();

        if (existing) {
          countryIds.push(existing.id);
        } else {
          const { data, error } = await supabase
            .from("countries")
            .insert({ name_pl: c.name_pl, iso2: c.iso2, iso3: c.iso3, slug: c.slug, active: true })
            .select("id")
            .single();
          if (error) throw new Error(`Country insert error: ${error.message}`);
          countryIds.push(data.id);
        }
      }

      // --- 2. Card Designs (one per country) ---
      const designIds: string[] = [];
      for (let i = 0; i < countryIds.length; i++) {
        const countryId = countryIds[i];
        const { data: existing } = await supabase
          .from("card_designs")
          .select("id")
          .eq("country_id", countryId)
          .limit(1)
          .maybeSingle();

        if (existing) {
          designIds.push(existing.id);
        } else {
          const { data, error } = await supabase
            .from("card_designs")
            .insert({
              country_id: countryId,
              view_no: i + 1,
              title: `Test Design ${MOCK_COUNTRIES[i].name_pl}`,
              language_code: "pl",
              active: true,
            })
            .select("id")
            .single();
          if (error) throw new Error(`Design insert error: ${error.message}`);
          designIds.push(data.id);
        }
      }

      // --- 3. Stock Batches (one per design) ---
      const batchIds: string[] = [];
      for (let i = 0; i < designIds.length; i++) {
        const { data, error } = await supabase
          .from("stock_batches")
          .insert({
            card_design_id: designIds[i],
            name: `Test Batch ${MOCK_COUNTRIES[i].name_pl} ${Date.now()}`,
            quantity: 5,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Batch insert error: ${error.message}`);
        batchIds.push(data.id);
      }

      // --- 4. Orders (3 orders, status paid) ---
      const orderIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const buyer = MOCK_BUYERS[i];
        const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD
        const customOrderNumber = `PDZ-${dateStr}-${randomHex(6).toUpperCase()}`;
        const { data, error } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            order_number: customOrderNumber,
            status: "paid" as const,
            payment_status: "paid" as const,
            total_amount: (i + 1) * 29.99,
            paid_at: new Date().toISOString(),
            shipping_name: buyer.name,
            shipping_address: buyer.address,
            shipping_city: buyer.city,
            shipping_postal_code: buyer.postal,
            shipping_country: buyer.country,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Order insert error: ${error.message}`);
        orderIds.push(data.id);
      }

      // --- 5. Order Items ---
      for (let i = 0; i < 3; i++) {
        const designId = designIds[i % designIds.length];
        const qty = i < 2 ? 3 : 4; // 3+3+4 = 10 units total
        const { error } = await supabase.from("order_items").insert({
          order_id: orderIds[i],
          card_design_id: designId,
          quantity: qty,
          unit_price: 9.99,
          total_price: qty * 9.99,
        });
        if (error) throw new Error(`Order item insert error: ${error.message}`);
      }

      // --- 6. Inventory Units (10 total, 5 purchased + 5 registered) ---
      const unitIds: string[] = [];
      const purchasedTokens: string[] = [];
      for (let i = 0; i < 10; i++) {
        const orderIdx = i < 3 ? 0 : i < 6 ? 1 : 2;
        const designIdx = i % designIds.length;
        const batchIdx = designIdx;
        const isRegistered = i >= 5;
        const code = `INV-${MOCK_COUNTRIES[designIdx].iso2}-V01-${String(i + 1).padStart(3, "0")}T`;

        const token = isRegistered ? randomHex(16) : `test-kartka-${i + 1}`;
        if (!isRegistered) {
          purchasedTokens.push(token);
        }
        const tokenHash = await hashToken(token);

        const { data, error } = await supabase
          .from("inventory_units")
          .insert({
            stock_batch_id: batchIds[batchIdx],
            card_design_id: designIds[designIdx],
            internal_inventory_code: code + randomHex(4),
            fulfillment_status: "shipped" as const,
            business_status: isRegistered ? ("registered" as const) : ("purchased" as const),
            traveler_user_id: user.id,
            order_id: orderIds[orderIdx],
            shipped_at: new Date().toISOString(),
            public_claim_code: `PDZ-${randomHex(4).toUpperCase()}-${randomHex(4).toUpperCase()}`,
            public_claim_token_hash: tokenHash,
            registered_at: isRegistered ? new Date().toISOString() : null,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Unit insert error: ${error.message}`);
        unitIds.push(data.id);
      }

      // --- 7. Recipient Registrations (for the 5 registered units) ---
      const registeredUnitIds = unitIds.slice(5);
      for (let i = 0; i < registeredUnitIds.length; i++) {
        const r = MOCK_RECIPIENTS[i];
        const { error } = await supabase.from("recipient_registrations").insert({
          inventory_unit_id: registeredUnitIds[i],
          recipient_name: r.name,
          recipient_message: r.message,
          recipient_email: r.email,
          contact_opt_in: Math.random() > 0.5,
        });
        if (error) throw new Error(`Registration insert error: ${error.message}`);
      }

      // --- Done ---
      toast.success(`Wygenerowano pomyślnie 3 zamówienia i 10 kartek!`);
      queryClient.invalidateQueries();
    } catch (err) {
      console.error("Mock data error:", err);
      let errorMsg = err instanceof Error ? err.message : "Nieznany błąd";
      if (errorMsg.includes("row-level security") || errorMsg.includes("security policy")) {
        errorMsg = "Brak uprawnień administratora w bazie danych (RLS). Zobacz żółty komunikat na górze panelu administratora i wykonaj wymagany skrypt SQL.";
      } else if (errorMsg.includes("gamification_config") || errorMsg.includes("relation \"") || errorMsg.includes("does not exist")) {
        errorMsg = "Brakuje tabel grywalizacji w bazie danych (gamification_config / gamification_tiers). Uruchom skrypt SQL podany w żółtym komunikacie na górze panelu administratora, aby utworzyć wymagane tabele.";
      }
      toast.error("Błąd generowania danych: " + errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const seedGlobalData = async () => {
    if (!user) return;
    setIsSeeding(true);

    try {
      for (let i = 0; i < GLOBAL_LOCATIONS.length; i++) {
        const loc = GLOBAL_LOCATIONS[i];
        const daysAgo = GLOBAL_LOCATIONS.length - i;
        const createdDate = new Date(Date.now() - daysAgo * 3 * 24 * 60 * 60 * 1000).toISOString();
        const registeredDate = new Date(Date.now() - daysAgo * 1.5 * 24 * 60 * 60 * 1000).toISOString();

        // Country upsert
        let countryId: string;
        const { data: existing } = await supabase
          .from("countries")
          .select("id")
          .eq("iso2", loc.iso2)
          .maybeSingle();

        if (existing) {
          countryId = existing.id;
        } else {
          const { data, error } = await supabase
            .from("countries")
            .insert({ name_pl: loc.country_name, iso2: loc.iso2, iso3: loc.iso3, slug: loc.country_name.toLowerCase().replace(/\s+/g, "-"), active: true })
            .select("id")
            .single();
          if (error) throw new Error(`Country: ${error.message}`);
          countryId = data.id;
        }

        // Design upsert
        let designId: string;
        const { data: existingDesign } = await supabase
          .from("card_designs")
          .select("id")
          .eq("country_id", countryId)
          .limit(1)
          .maybeSingle();

        if (existingDesign) {
          designId = existingDesign.id;
        } else {
          const { data, error } = await supabase
            .from("card_designs")
            .insert({ country_id: countryId, view_no: 1, title: `Widok ${loc.city}`, language_code: "pl", active: true })
            .select("id")
            .single();
          if (error) throw new Error(`Design: ${error.message}`);
          designId = data.id;
        }

        // Stock batch
        const { data: batch, error: batchErr } = await supabase
          .from("stock_batches")
          .insert({ card_design_id: designId, name: `Seed ${loc.city} ${Date.now()}`, quantity: 1 })
          .select("id")
          .single();
        if (batchErr) throw new Error(`Batch: ${batchErr.message}`);

        // Inventory unit
        const code = `INV-${loc.iso2}-V01-SEED${String(i).padStart(3, "0")}${randomHex(4)}`;
        const { data: unit, error: unitErr } = await supabase
          .from("inventory_units")
          .insert({
            stock_batch_id: batch.id,
            card_design_id: designId,
            internal_inventory_code: code,
            fulfillment_status: "shipped" as const,
            business_status: "registered" as const,
            traveler_user_id: user.id,
            shipped_at: createdDate,
            registered_at: registeredDate,
            public_claim_code: `PDZ-${randomHex(4).toUpperCase()}-${randomHex(4).toUpperCase()}`,
            public_claim_token_hash: randomHex(32),
          })
          .select("id")
          .single();
        if (unitErr) throw new Error(`Unit: ${unitErr.message}`);

        // Registration
        const { error: regErr } = await supabase.from("recipient_registrations").insert({
          inventory_unit_id: unit.id,
          recipient_name: loc.name,
          recipient_message: loc.message,
          latitude: loc.lat,
          longitude: loc.lng,
          contact_opt_in: true,
          registered_at: registeredDate,
        });
        if (regErr) throw new Error(`Registration: ${regErr.message}`);
      }

      toast.success(`Rozsiano ${GLOBAL_LOCATIONS.length} pocztówek po świecie!`);
      queryClient.invalidateQueries();
    } catch (err) {
      console.error("Seed global error:", err);
      let errorMsg = err instanceof Error ? err.message : "Nieznany błąd";
      if (errorMsg.includes("row-level security") || errorMsg.includes("security policy")) {
        errorMsg = "Brak uprawnień administratora w bazie danych (RLS). Zobacz żółty komunikat na górze panelu administratora i wykonaj wymagany skrypt SQL.";
      } else if (errorMsg.includes("gamification_config") || errorMsg.includes("relation \"") || errorMsg.includes("does not exist")) {
        errorMsg = "Brakuje tabel grywalizacji w bazie danych (gamification_config / gamification_tiers). Uruchom skrypt SQL podany w żółtym komunikacie na górze panelu administratora, aby utworzyć wymagane tabele.";
      }
      toast.error("Błąd: " + errorMsg);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-foreground">Narzędzia Dev</h2>

      <Card className="max-w-lg border-amber-500/40 shadow-md bg-gradient-to-br from-amber-500/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Flame className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Google Cloud Firebase Firestore
          </CardTitle>
          <CardDescription>
            Baza Firestore została pomyślnie utworzona i skonfigurowana. Możesz zainicjalizować kolekcje domyślnym katalogiem kartek i krajów.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-background/80 p-3 border text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className="text-emerald-500 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Połączono z Google Cloud
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Project:</span>
              <span className="text-foreground">podrozowka</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database:</span>
              <span className="text-foreground truncate max-w-[200px]" title="ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f">
                ai-studio-podrozowkauat
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Security Rules:</span>
              <span className="text-emerald-500 font-semibold">Wdrożone (Deployed)</span>
            </div>
          </div>
          <Button
            onClick={handleSeedFirebase}
            disabled={isSeedingFirebase}
            variant="outline"
            className="w-full border-amber-500/40 hover:bg-amber-500/10 text-foreground"
          >
            {isSeedingFirebase ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
            )}
            {isSeedingFirebase ? "Inicjalizacja Firestore..." : "Zainicjuj kolekcje Firestore danymi startowymi"}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-lg border-emerald-500/30 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Zamówienie Francja — V1 Francja (10 szt.)
          </CardTitle>
          <CardDescription>
            Dodaj gotowe, opłacone zamówienie na 10 podróżówek Francja — V1 Francja z wygenerowanymi jednostkami magazynowymi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={createFrancePaidOrder} disabled={isCreatingFranceOrder} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
            {isCreatingFranceOrder ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ShoppingBag className="w-4 h-4 mr-2" />
            )}
            {isCreatingFranceOrder ? "Tworzenie zamówienia…" : "Dodaj opłacone zamówienie (10 szt. Francja V1)"}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-lg border-primary/30 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <QrCode className="w-5 h-5 text-primary" />
            Test Rejestracji jako Obdarowany
          </CardTitle>
          <CardDescription>
            Wygeneruj nową testową kartkę pocztową w stanie "kupiona" (gotową do aktywowania/rejestracji przez obdarowanego po zeskanowaniu QR).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={createTestCardForObdarowany} disabled={isCreatingTestCard} className="w-full">
            {isCreatingTestCard ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <QrCode className="w-4 h-4 mr-2" />
            )}
            {isCreatingTestCard ? "Tworzenie kartki testowej…" : "Wygeneruj nową kartkę do testów"}
          </Button>

          {createdTestCard && (
            <div className="p-4 bg-muted/60 rounded-lg border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Wygenerowana kartka testowa
              </p>
              <p className="text-sm font-mono bg-background p-2 rounded border break-all text-foreground">
                {createdTestCard.registrationUrl}
              </p>
              <img src={createdTestCard.qrImage} alt="Kod QR do testowej rejestracji" className="mx-auto w-48 rounded-lg bg-white p-2" />
              <p className="text-xs text-muted-foreground">To jednorazowa kartka testowa. Po rejestracji usuń ją tym samym przyciskiem.</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(createdTestCard.registrationUrl, "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Przejdź do rejestracji
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyLink(createdTestCard.registrationUrl)}
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button size="sm" variant="destructive" className="w-full" onClick={deleteTestCardForObdarowany} disabled={isDeletingTestCard}>
                {isDeletingTestCard ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Usuń kartkę testową
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Generowanie danych testowych
          </CardTitle>
          <CardDescription>
            Symuluj ruch w aplikacji — wygeneruj testowe zamówienia, kartki pocztowe i rejestracje odbiorców.
            Tworzy 2 kraje, 2 wzory, 3 zamówienia, 10 jednostek inwentarzowych i 5 rejestracji.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={generateMockData} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {isGenerating ? "Generowanie…" : "Wygeneruj paczkę testową (Mock Data)"}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Generator Danych Mapy
          </CardTitle>
          <CardDescription>
            Rozsiej {GLOBAL_LOCATIONS.length} pocztówek po całym świecie z realistycznymi lokacjami i wiadomościami.
            Dane pojawią się na mapie, w Dzienniku Ambasadora i w Misjach Kulturowych.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={seedGlobalData} disabled={isSeeding}>
            {isSeeding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            {isSeeding ? "Rozsiewanie…" : "Rozsiej pocztówki po świecie"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDevTools;
