import { doc, setDoc, getDocs, collection } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../config";
import type { FirestoreCardDesign, FirestoreCategory, FirestoreCountry } from "../types";

export const initialCategories: FirestoreCategory[] = [
  { id: "nature", slug: "natura", name_pl: "Natura i Krajobrazy", name_en: "Nature & Landscapes", sort_order: 1, is_active: true },
  { id: "cities", slug: "miasta", name_pl: "Architektura i Miasta", name_en: "Cities & Architecture", sort_order: 2, is_active: true },
  { id: "art", slug: "sztuka", name_pl: "Polska Sztuka i Folklor", name_en: "Polish Art & Folklore", sort_order: 3, is_active: true },
  { id: "history", slug: "historia", name_pl: "Historia i Zabytki", name_en: "History & Heritage", sort_order: 4, is_active: true },
];

export const initialCountries: FirestoreCountry[] = [
  { id: "PL", name: "Polska", english_name: "Poland", flag_emoji: "🇵🇱", currency_code: "PLN", is_active: true, is_popular: true },
  { id: "DE", name: "Niemcy", english_name: "Germany", flag_emoji: "🇩🇪", currency_code: "EUR", is_active: true, is_popular: true },
  { id: "IT", name: "Włochy", english_name: "Italy", flag_emoji: "🇮🇹", currency_code: "EUR", is_active: true, is_popular: true },
  { id: "ES", name: "Hiszpania", english_name: "Spain", flag_emoji: "🇪🇸", currency_code: "EUR", is_active: true, is_popular: true },
  { id: "FR", name: "Francja", english_name: "France", flag_emoji: "🇫🇷", currency_code: "EUR", is_active: true, is_popular: true },
  { id: "JP", name: "Japonia", english_name: "Japan", flag_emoji: "🇯🇵", currency_code: "JPY", is_active: true, is_popular: true },
  { id: "US", name: "Stany Zjednoczone", english_name: "United States", flag_emoji: "🇺🇸", currency_code: "USD", is_active: true, is_popular: true },
];

export const initialCardDesigns: FirestoreCardDesign[] = [
  {
    id: "tatry-morskie-oko",
    title: "Morskie Oko w Tatrach",
    slug: "tatry-morskie-oko",
    description: "Kultowy widok na tatrzańskie jezioro otoczone majestatycznymi szczytami.",
    category_id: "nature",
    price_pln: 8.5,
    is_active: true,
    is_featured: true,
    stock_quantity: 250,
    inventory_type: "stock",
  },
  {
    id: "krakow-sukiennice",
    title: "Kraków – Sukiennice i Rynek Główny",
    slug: "krakow-sukiennice",
    description: "Serce dawnej stolicy Polski z zabytkowymi Sukiennicami i Kościołem Mariackim.",
    category_id: "cities",
    price_pln: 8.5,
    is_active: true,
    is_featured: true,
    stock_quantity: 180,
    inventory_type: "stock",
  },
  {
    id: "gdansk-zuraw",
    title: "Gdańsk – Żuraw nad Motławą",
    slug: "gdansk-zuraw",
    description: "Historyczny portowy Gdańsk z symbolem hanzeatyckiej potęgi morskiej.",
    category_id: "cities",
    price_pln: 8.5,
    is_active: true,
    is_featured: true,
    stock_quantity: 140,
    inventory_type: "stock",
  },
  {
    id: "bialowieza-zubr",
    title: "Puszcza Białowieska – Król Żubr",
    slug: "bialowieza-zubr",
    description: "Ostatni pierwotny las nizinny w Europie i jego majestatyczny władca.",
    category_id: "nature",
    price_pln: 8.5,
    is_active: true,
    is_featured: true,
    stock_quantity: 200,
    inventory_type: "stock",
  },
];

export async function seedFirestoreIfEmpty(): Promise<{ seeded: boolean; message: string }> {
  if (!isFirebaseConfigured) {
    return { seeded: false, message: "Firebase nie jest skonfigurowany." };
  }

  try {
    const existing = await getDocs(collection(db, "categories"));
    if (!existing.empty) {
      return { seeded: false, message: "Baza Firestore posiada już dane (kolekcje nie są puste)." };
    }

    // Seed categories
    for (const cat of initialCategories) {
      await setDoc(doc(db, "categories", cat.id), cat);
    }

    // Seed countries
    for (const country of initialCountries) {
      await setDoc(doc(db, "countries", country.id), country);
    }

    // Seed card designs
    for (const card of initialCardDesigns) {
      await setDoc(doc(db, "card_designs", card.id), card);
    }

    return { seeded: true, message: "Pomyślnie zainicjowano bazę Firestore kategoriami, krajami i kartami!" };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Firestore seed error:", errorMsg);
    return { seeded: false, message: `Błąd inicjalizacji Firestore: ${errorMsg}` };
  }
}
