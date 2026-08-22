export interface FirestoreCountry {
  id: string; // ISO 2-letter e.g. "PL"
  name: string;
  iso2?: string;
  name_pl?: string;
  english_name?: string;
  native_name?: string;
  flag_emoji?: string;
  flag_url?: string;
  currency_code?: string;
  currency_symbol?: string;
  is_active: boolean;
  is_popular?: boolean;
  created_at?: string;
}

export interface FirestoreCategory {
  id: string;
  slug: string;
  name_pl: string;
  name?: string;
  icon_url?: string | null;
  name_en?: string;
  description_pl?: string;
  icon?: string;
  sort_order?: number;
  is_active: boolean;
}

export interface FirestoreAuthor {
  id: string;
  slug: string;
  name: string;
  bio?: string;
  avatar_url?: string;
  website_url?: string;
  instagram_url?: string;
  is_active: boolean;
  created_at?: string;
}

export interface FirestoreCardDesign {
  id: string;
  title: string | null;
  slug: string;
  description?: string;
  author_id?: string;
  category_id?: string;
  country_id?: string;
  /** Cena jest przechowywana w groszach, aby nie tracić precyzji waluty. */
  price_grosze: number;
  currency: "PLN";
  /** Pozostawione dla zgodności z pierwszymi dokumentami Firebase. */
  price_pln?: number;
  image_front_url?: string | null;
  image_front_storage_path?: string;
  image_back_url?: string;
  images?: FirestoreCardDesignImage[];
  language_code: string;
  view_no: number;
  thank_you_text?: string | null;
  back_qr_label?: string | null;
  photo_author?: string | null;
  crop_settings?: {
    fit: "auto" | "crop";
    zoom: number;
    x: number;
    y: number;
  } | null;
  /** `active` jest kanoniczne; `is_active` obsługuje dane zasiane wcześniej. */
  active: boolean;
  is_active?: boolean;
  is_featured?: boolean;
  stock_quantity?: number;
  inventory_type?: "stock" | "pod" | "hybrid";
  product_code?: string;
  firmino_article_id?: number | null;
  firmino_synced_at?: string | null;
  firmino_sync_error?: string | null;
  created_at?: string;
  updated_at?: string;
  schema_version?: 1;
  migration_source?: "supabase";
}

export interface FirestoreCardDesignImage {
  id: string;
  url: string;
  sort_order: number;
  alt?: string | null;
}

export interface FirestoreLanguageTemplate {
  id: string;
  country_id: string;
  card_design_id?: string;
  language_code: string;
  language_name: string;
  front_thank_you_text: string;
  back_qr_label: string;
}

export interface FirestoreUserProfile {
  id: string;
  user_id?: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  full_name?: string;
  username?: string;
  avatar_url?: string | null;
  role: "admin" | "user" | "traveler";
  gamification_points: number;
  current_tier: string;
  postcards_sent_count: number;
  postcards_registered_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface FirestoreOrderItem {
  card_design_id: string;
  title: string;
  quantity: number;
  unit_price_pln: number;
  total_price_pln: number;
  language_code?: string;
}

export interface FirestoreOrder {
  id: string;
  order_number: string;
  user_id?: string;
  guest_email?: string;
  status: "new" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";
  payment_method: "p24" | "hotpay" | "cod";
  payment_status: "pending" | "paid" | "failed" | "refunded";
  total_amount_pln: number;
  shipping_cost_pln: number;
  items: FirestoreOrderItem[];
  shipping_method?: string;
  shipping_point_id?: string;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    street?: string;
    city?: string;
    postal_code?: string;
    phone?: string;
    email?: string;
  };
  fiscal_document_status?: "pending" | "issued" | "failed";
  fiscal_document_number?: string;
  created_at?: string;
}

export interface FirestoreInventoryUnit {
  id: string;
  card_design_id: string;
  internal_inventory_code: string;
  public_claim_token: string;
  public_claim_token_hash: string;
  status: "printed" | "assigned" | "traveling" | "registered" | "lost";
  order_id?: string;
  traveler_user_id?: string;
  registered_at?: string;
  registered_country_id?: string;
  created_at?: string;
}

export interface FirestoreRecipientRegistration {
  id: string;
  inventory_unit_id: string;
  card_design_id?: string;
  traveler_user_id?: string;
  recipient_name: string;
  recipient_country: string;
  recipient_city?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  message?: string;
  photo_url?: string;
  registered_at: string;
}
