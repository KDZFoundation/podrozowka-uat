-- SNAPSHOT REKONCYLIACYJNY, wygenerowany 2026-08-04.
-- Poprzednie pliki migracji (consolidated_baseline i inne) nie miały
-- odpowiadających wpisów w schema_migrations na DEV — realny schemat
-- bazy powstał częściowo poza mechanizmem CLI. Ten plik odtwarza
-- faktyczny stan schematu na moment wygenerowania, jako nowy, wiarygodny
-- punkt odniesienia dla kolejnych migracji przyrostowych.

-- Create profiles table for user accounts
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    country TEXT,
    city TEXT,
    bio TEXT,
    postcards_given INTEGER NOT NULL DEFAULT 0,
    postcards_received INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles are viewable by everyone
CREATE POLICY "Profiles are viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create postcards table to track all postcards in the system
CREATE TABLE public.postcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_code TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL,
    design_type TEXT NOT NULL DEFAULT 'krajoznawczy',
    language TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'purchased' CHECK (status IN ('purchased', 'in_transit', 'delivered')),
    given_to_name TEXT,
    given_to_country TEXT,
    given_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    receiver_id UUID,
    photo_url TEXT,
    message TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on postcards
ALTER TABLE public.postcards ENABLE ROW LEVEL SECURITY;

-- Everyone can view delivered postcards
CREATE POLICY "Delivered postcards are viewable by everyone" 
ON public.postcards 
FOR SELECT 
USING (status = 'delivered' OR auth.uid() = owner_id OR auth.uid() = receiver_id);

-- Users can update their own postcards
CREATE POLICY "Users can update their own postcards" 
ON public.postcards 
FOR UPDATE 
USING (auth.uid() = owner_id);

-- Users can insert their own postcards
CREATE POLICY "Users can insert their own postcards" 
ON public.postcards 
FOR INSERT 
WITH CHECK (auth.uid() = owner_id);

-- Create platform_stats table for aggregated statistics
CREATE TABLE public.platform_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_members INTEGER NOT NULL DEFAULT 0,
    total_countries INTEGER NOT NULL DEFAULT 0,
    total_given INTEGER NOT NULL DEFAULT 0,
    total_purchased INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on platform_stats
ALTER TABLE public.platform_stats ENABLE ROW LEVEL SECURITY;

-- Everyone can view platform stats
CREATE POLICY "Platform stats are viewable by everyone" 
ON public.platform_stats 
FOR SELECT 
USING (true);

-- Insert initial stats row
INSERT INTO public.platform_stats (total_members, total_countries, total_given, total_purchased)
VALUES (0, 0, 0, 0);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_postcards_updated_at
BEFORE UPDATE ON public.postcards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_stats_updated_at
BEFORE UPDATE ON public.platform_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate unique tracking code
CREATE OR REPLACE FUNCTION public.generate_tracking_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists_count INTEGER;
BEGIN
    LOOP
        code := 'PL-' || upper(substr(md5(random()::text), 1, 8));
        SELECT COUNT(*) INTO exists_count FROM public.postcards WHERE tracking_code = code;
        EXIT WHEN exists_count = 0;
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create function to update platform stats when postcard status changes
CREATE OR REPLACE FUNCTION public.update_platform_stats_on_postcard()
RETURNS TRIGGER AS $$
BEGIN
    -- Update total_purchased on insert
    IF TG_OP = 'INSERT' THEN
        UPDATE public.platform_stats 
        SET total_purchased = total_purchased + 1;
    END IF;
    
    -- Update total_given when status changes to delivered
    IF TG_OP = 'UPDATE' AND OLD.status != 'delivered' AND NEW.status = 'delivered' THEN
        UPDATE public.platform_stats 
        SET total_given = total_given + 1;
        
        -- Update country count if new country
        IF NEW.given_to_country IS NOT NULL THEN
            UPDATE public.platform_stats 
            SET total_countries = (
                SELECT COUNT(DISTINCT given_to_country) 
                FROM public.postcards 
                WHERE status = 'delivered' AND given_to_country IS NOT NULL
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for platform stats updates
CREATE TRIGGER update_platform_stats_trigger
AFTER INSERT OR UPDATE ON public.postcards
FOR EACH ROW
EXECUTE FUNCTION public.update_platform_stats_on_postcard();

-- Create function to update profile stats
CREATE OR REPLACE FUNCTION public.update_profile_stats_on_postcard()
RETURNS TRIGGER AS $$
BEGIN
    -- Update giver stats when postcard is delivered
    IF TG_OP = 'UPDATE' AND OLD.status != 'delivered' AND NEW.status = 'delivered' THEN
        UPDATE public.profiles 
        SET postcards_given = postcards_given + 1
        WHERE user_id = NEW.owner_id;
        
        -- Update receiver stats if receiver exists
        IF NEW.receiver_id IS NOT NULL THEN
            UPDATE public.profiles 
            SET postcards_received = postcards_received + 1
            WHERE user_id = NEW.receiver_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for profile stats updates
CREATE TRIGGER update_profile_stats_trigger
AFTER UPDATE ON public.postcards
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_stats_on_postcard();

-- Create function to update member count
CREATE OR REPLACE FUNCTION public.update_member_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.platform_stats 
    SET total_members = (SELECT COUNT(*) FROM public.profiles);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for member count
CREATE TRIGGER update_member_count_trigger
AFTER INSERT OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_member_count();-- Create storage bucket for postcard photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('postcard-photos', 'postcard-photos', true);

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload postcard photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'postcard-photos');

-- Allow public to view photos
CREATE POLICY "Anyone can view postcard photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'postcard-photos');

-- Allow users to update their own photos
CREATE POLICY "Users can update their own postcard photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'postcard-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own photos
CREATE POLICY "Users can delete their own postcard photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'postcard-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
-- 1. Tabela countries
CREATE TABLE public.countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  flag TEXT,
  language_code TEXT NOT NULL,
  language_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Countries are viewable by everyone"
  ON public.countries FOR SELECT
  USING (true);

-- 2. Tabela designs
CREATE TABLE public.designs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  view_name TEXT NOT NULL,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designs are viewable by everyone"
  ON public.designs FOR SELECT
  USING (true);

-- 3. Usunięcie starej tabeli postcards (triggers, policies zostaną usunięte automatycznie)
DROP TABLE IF EXISTS public.postcards CASCADE;

-- 4. Nowa tabela postcards
CREATE TABLE public.postcards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id UUID NOT NULL REFERENCES public.designs(id) ON DELETE CASCADE,
  serial_number INTEGER NOT NULL,
  qr_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available',
  buyer_id UUID,
  buyer_display_name TEXT,
  purchased_at TIMESTAMPTZ,
  order_reference TEXT,
  recipient_name TEXT,
  recipient_message TEXT,
  recipient_email TEXT,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (design_id, serial_number)
);

-- Validation trigger instead of CHECK constraint for status
CREATE OR REPLACE FUNCTION public.validate_postcard_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('available', 'purchased', 'registered') THEN
    RAISE EXCEPTION 'Invalid postcard status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_postcard_status_trigger
  BEFORE INSERT OR UPDATE ON public.postcards
  FOR EACH ROW EXECUTE FUNCTION public.validate_postcard_status();

-- updated_at trigger
CREATE TRIGGER update_postcards_updated_at
  BEFORE UPDATE ON public.postcards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.postcards ENABLE ROW LEVEL SECURITY;

-- RLS: publiczny SELECT tylko dla kupionych/zarejestrowanych (ograniczone kolumny przez widok)
-- Właściciel widzi swoje kartki w pełni
CREATE POLICY "Buyers can view their own postcards"
  ON public.postcards FOR SELECT
  TO authenticated
  USING (auth.uid() = buyer_id);

-- Publiczny SELECT (ograniczony - dane do widoków/statystyk)
CREATE POLICY "Public can view purchased and registered postcards"
  ON public.postcards FOR SELECT
  USING (status IN ('purchased', 'registered'));

-- Brak INSERT/UPDATE z klienta - tylko edge functions z service_role

-- 5. Aktualizacja platform_stats
ALTER TABLE public.platform_stats ADD COLUMN IF NOT EXISTS total_registered INTEGER NOT NULL DEFAULT 0;

-- 6. Aktualizacja profiles - zmiana nazwy kolumny
ALTER TABLE public.profiles RENAME COLUMN postcards_given TO postcards_purchased;

-- Trigger: update platform stats on postcard status change
CREATE OR REPLACE FUNCTION public.update_platform_stats_on_postcard_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- On purchase
  IF TG_OP = 'UPDATE' AND OLD.status = 'available' AND NEW.status = 'purchased' THEN
    UPDATE public.platform_stats 
    SET total_purchased = total_purchased + 1;
  END IF;

  -- On registration
  IF TG_OP = 'UPDATE' AND OLD.status = 'purchased' AND NEW.status = 'registered' THEN
    UPDATE public.platform_stats 
    SET total_registered = total_registered + 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER update_platform_stats_trigger
  AFTER UPDATE ON public.postcards
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_stats_on_postcard_v2();

-- Trigger: update profile stats on purchase
CREATE OR REPLACE FUNCTION public.update_profile_stats_on_postcard_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'available' AND NEW.status = 'purchased' AND NEW.buyer_id IS NOT NULL THEN
    UPDATE public.profiles 
    SET postcards_purchased = postcards_purchased + 1
    WHERE user_id = NEW.buyer_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profile_stats_trigger
  AFTER UPDATE ON public.postcards
  FOR EACH ROW EXECUTE FUNCTION public.update_profile_stats_on_postcard_v2();

-- Update country count function (called periodically or on registration)
CREATE OR REPLACE FUNCTION public.update_country_count()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.platform_stats
  SET total_countries = (
    SELECT COUNT(DISTINCT c.id)
    FROM public.postcards p
    JOIN public.designs d ON p.design_id = d.id
    JOIN public.countries c ON d.country_id = c.id
    WHERE p.status IN ('purchased', 'registered')
  );
END;
$$;

-- 1. Enum for roles
CREATE TYPE public.app_role AS ENUM ('traveler', 'admin');

-- 2. User roles table (roles MUST be in separate table per security rules)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4. RLS on user_roles: users see their own roles, admins see all
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Add first_name, last_name to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- 6. Trigger to auto-create profile + traveler role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'traveler');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Admin-only RLS for postcards management (full CRUD for admins)
CREATE POLICY "Admins can manage all postcards"
  ON public.postcards FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Admin-only policy for platform_stats updates
CREATE POLICY "Admins can update platform stats"
  ON public.platform_stats FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 9. Admin can manage countries and designs
CREATE POLICY "Admins can manage countries"
  ON public.countries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage designs"
  ON public.designs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 1. Rename designs to card_designs
ALTER TABLE public.designs RENAME TO card_designs;

-- 2. Alter countries: rename columns first
ALTER TABLE public.countries RENAME COLUMN name TO name_pl;
ALTER TABLE public.countries RENAME COLUMN code TO iso2;

-- Add new columns
ALTER TABLE public.countries ADD COLUMN iso3 TEXT;
ALTER TABLE public.countries ADD COLUMN slug TEXT;
ALTER TABLE public.countries ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Drop old columns
ALTER TABLE public.countries DROP COLUMN IF EXISTS language_code;
ALTER TABLE public.countries DROP COLUMN IF EXISTS language_name;
ALTER TABLE public.countries DROP COLUMN IF EXISTS flag;

-- Add constraints
ALTER TABLE public.countries ADD CONSTRAINT countries_slug_unique UNIQUE (slug);

-- 3. Alter card_designs
ALTER TABLE public.card_designs ADD COLUMN language_code TEXT NOT NULL DEFAULT 'en';
ALTER TABLE public.card_designs ADD COLUMN view_no INTEGER;
ALTER TABLE public.card_designs ADD COLUMN title TEXT;
ALTER TABLE public.card_designs ADD COLUMN thank_you_text TEXT;
ALTER TABLE public.card_designs ADD COLUMN image_front_url TEXT;
ALTER TABLE public.card_designs ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Populate from old columns
UPDATE public.card_designs SET view_no = sort_order + 1 WHERE view_no IS NULL;
UPDATE public.card_designs SET title = view_name WHERE title IS NULL;

-- Drop old columns
ALTER TABLE public.card_designs DROP COLUMN IF EXISTS view_name;
ALTER TABLE public.card_designs DROP COLUMN IF EXISTS image_url;
ALTER TABLE public.card_designs DROP COLUMN IF EXISTS sort_order;

-- Unique constraint
ALTER TABLE public.card_designs ADD CONSTRAINT card_designs_country_view_unique UNIQUE (country_id, view_no);
ALTER TABLE public.card_designs ALTER COLUMN view_no SET NOT NULL;

-- 4. RLS: drop old, create new
DROP POLICY IF EXISTS "Countries are viewable by everyone" ON public.countries;
DROP POLICY IF EXISTS "Designs are viewable by everyone" ON public.card_designs;

CREATE POLICY "Public can view active countries"
  ON public.countries FOR SELECT
  USING (active = true);

CREATE POLICY "Public can view active designs"
  ON public.card_designs FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS "Admins can manage designs" ON public.card_designs;
CREATE POLICY "Admins can manage card_designs"
  ON public.card_designs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage countries" ON public.countries;
CREATE POLICY "Admins can manage countries"
  ON public.countries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Enum for business status
CREATE TYPE public.business_status AS ENUM ('purchased', 'registered');

-- Enum for fulfillment status
CREATE TYPE public.fulfillment_status AS ENUM ('in_stock', 'reserved', 'qr_generated', 'qr_applied', 'shipped', 'voided', 'damaged');

-- Stock batches table
CREATE TABLE public.stock_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  card_design_id UUID NOT NULL REFERENCES public.card_designs(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inventory units table
CREATE TABLE public.inventory_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_batch_id UUID NOT NULL REFERENCES public.stock_batches(id) ON DELETE RESTRICT,
  card_design_id UUID NOT NULL REFERENCES public.card_designs(id) ON DELETE RESTRICT,
  internal_inventory_code TEXT NOT NULL UNIQUE,
  business_status public.business_status,
  fulfillment_status public.fulfillment_status NOT NULL DEFAULT 'in_stock',
  traveler_user_id UUID,
  order_id TEXT,
  order_item_id TEXT,
  shipment_id TEXT,
  public_claim_code TEXT UNIQUE,
  public_claim_token_hash TEXT,
  qr_generated_at TIMESTAMP WITH TIME ZONE,
  qr_applied_at TIMESTAMP WITH TIME ZONE,
  shipped_at TIMESTAMP WITH TIME ZONE,
  registered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_inventory_units_batch ON public.inventory_units(stock_batch_id);
CREATE INDEX idx_inventory_units_design ON public.inventory_units(card_design_id);
CREATE INDEX idx_inventory_units_fulfillment ON public.inventory_units(fulfillment_status);
CREATE INDEX idx_inventory_units_business ON public.inventory_units(business_status);
CREATE INDEX idx_inventory_units_claim_code ON public.inventory_units(public_claim_code);

-- Updated_at triggers
CREATE TRIGGER update_stock_batches_updated_at
  BEFORE UPDATE ON public.stock_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_units_updated_at
  BEFORE UPDATE ON public.inventory_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage stock_batches" ON public.stock_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage inventory_units" ON public.inventory_units
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Travelers can view their own units
CREATE POLICY "Travelers can view own units" ON public.inventory_units
  FOR SELECT TO authenticated
  USING (auth.uid() = traveler_user_id);

-- Order status enum
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'fulfilled', 'cancelled');

-- Payment status enum
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'refunded', 'failed');

-- Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  status public.order_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PLN',
  shipping_name TEXT,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_postal_code TEXT,
  shipping_country TEXT,
  notes TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  fulfilled_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Order items table
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  card_design_id UUID NOT NULL REFERENCES public.card_designs(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_payment ON public.orders(payment_status);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_design ON public.order_items(card_design_id);

-- Updated_at trigger
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order number generator
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  num TEXT;
  cnt INTEGER;
BEGIN
  LOOP
    num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));
    SELECT COUNT(*) INTO cnt FROM public.orders WHERE order_number = num;
    EXIT WHEN cnt = 0;
  END LOOP;
  RETURN num;
END;
$$;

-- Auto-generate order number
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT public.generate_order_number();

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Orders: users see own, admins see all
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Order items: accessible via order ownership
CREATE POLICY "Users can view own order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

CREATE POLICY "Users can create own order items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

CREATE POLICY "Admins can manage all order items" ON public.order_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to reserve inventory units for a paid order
-- Returns JSON with success status and details
CREATE OR REPLACE FUNCTION public.reserve_inventory_for_order(_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order RECORD;
  _item RECORD;
  _reserved_count INTEGER;
  _available_count INTEGER;
  _unit_ids UUID[];
  _result JSONB := '{"reserved": []}'::jsonb;
  _errors JSONB := '[]'::jsonb;
BEGIN
  -- Get order and validate
  SELECT * INTO _order FROM public.orders WHERE id = _order_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Zamówienie nie istnieje');
  END IF;
  
  IF _order.payment_status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Zamówienie nie jest opłacone');
  END IF;

  -- Check if already reserved
  SELECT COUNT(*) INTO _reserved_count
  FROM public.inventory_units
  WHERE order_id = _order_id::text;
  
  IF _reserved_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Zamówienie ma już zarezerwowane sztuki (' || _reserved_count || ')');
  END IF;

  -- Loop through order items
  FOR _item IN
    SELECT oi.id AS item_id, oi.card_design_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
  LOOP
    -- Check availability
    SELECT COUNT(*) INTO _available_count
    FROM public.inventory_units
    WHERE card_design_id = _item.card_design_id
      AND fulfillment_status = 'in_stock'
      AND order_id IS NULL;
    
    IF _available_count < _item.quantity THEN
      _errors := _errors || jsonb_build_array(jsonb_build_object(
        'card_design_id', _item.card_design_id,
        'requested', _item.quantity,
        'available', _available_count
      ));
    END IF;
  END LOOP;

  -- If any errors, abort
  IF jsonb_array_length(_errors) > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Brak wystarczającej ilości sztuk w magazynie',
      'shortages', _errors
    );
  END IF;

  -- All checks passed, reserve units
  FOR _item IN
    SELECT oi.id AS item_id, oi.card_design_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
  LOOP
    -- Select and lock units
    SELECT ARRAY_AGG(id) INTO _unit_ids
    FROM (
      SELECT id
      FROM public.inventory_units
      WHERE card_design_id = _item.card_design_id
        AND fulfillment_status = 'in_stock'
        AND order_id IS NULL
      ORDER BY created_at ASC
      LIMIT _item.quantity
      FOR UPDATE SKIP LOCKED
    ) sub;

    -- Update units
    UPDATE public.inventory_units
    SET fulfillment_status = 'reserved',
        business_status = 'purchased',
        traveler_user_id = _order.user_id,
        order_id = _order_id::text,
        order_item_id = _item.item_id::text
    WHERE id = ANY(_unit_ids);

    _result := jsonb_set(_result, '{reserved}', 
      (_result->'reserved') || jsonb_build_array(jsonb_build_object(
        'order_item_id', _item.item_id,
        'card_design_id', _item.card_design_id,
        'count', array_length(_unit_ids, 1)
      ))
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'details', _result);
END;
$$;

-- QR print job status enum
CREATE TYPE public.qr_print_job_status AS ENUM ('pending', 'generating', 'ready', 'printed', 'failed');

-- QR print jobs table
CREATE TABLE public.qr_print_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  shipment_id TEXT,
  order_id UUID REFERENCES public.orders(id),
  status public.qr_print_job_status NOT NULL DEFAULT 'pending',
  total_items INTEGER NOT NULL DEFAULT 0,
  generated_items INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- QR print job items - links a print job to specific inventory units
CREATE TABLE public.qr_print_job_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  print_job_id UUID NOT NULL REFERENCES public.qr_print_jobs(id) ON DELETE CASCADE,
  inventory_unit_id UUID NOT NULL REFERENCES public.inventory_units(id) ON DELETE RESTRICT,
  public_claim_code TEXT NOT NULL,
  qr_url TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(print_job_id, inventory_unit_id)
);

-- Indexes
CREATE INDEX idx_qr_print_jobs_order ON public.qr_print_jobs(order_id);
CREATE INDEX idx_qr_print_jobs_status ON public.qr_print_jobs(status);
CREATE INDEX idx_qr_print_job_items_job ON public.qr_print_job_items(print_job_id);
CREATE INDEX idx_qr_print_job_items_unit ON public.qr_print_job_items(inventory_unit_id);

-- Updated_at trigger
CREATE TRIGGER update_qr_print_jobs_updated_at
  BEFORE UPDATE ON public.qr_print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.qr_print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_print_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage qr_print_jobs" ON public.qr_print_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage qr_print_job_items" ON public.qr_print_job_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to generate a public claim code in PDZ-XXXX-XXXX format
CREATE OR REPLACE FUNCTION public.generate_claim_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  code TEXT;
  cnt INTEGER;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i INTEGER;
  part1 TEXT := '';
  part2 TEXT := '';
BEGIN
  LOOP
    part1 := '';
    part2 := '';
    FOR i IN 1..4 LOOP
      part1 := part1 || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      part2 := part2 || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    code := 'PDZ-' || part1 || '-' || part2;
    SELECT COUNT(*) INTO cnt FROM public.inventory_units WHERE public_claim_code = code;
    EXIT WHEN cnt = 0;
  END LOOP;
  RETURN code;
END;
$$;

-- Shipment status enum
CREATE TYPE public.shipment_status AS ENUM ('pending', 'packed', 'shipped', 'delivered', 'returned');

-- Shipments table
CREATE TABLE public.shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  status public.shipment_status NOT NULL DEFAULT 'pending',
  tracking_number TEXT,
  carrier TEXT,
  shipping_method TEXT,
  shipped_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_shipments_order ON public.shipments(order_id);
CREATE INDEX idx_shipments_user ON public.shipments(user_id);
CREATE INDEX idx_shipments_status ON public.shipments(status);

-- Updated_at trigger
CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shipments" ON public.shipments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all shipments" ON public.shipments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function: when shipment marked as shipped, update inventory_units
CREATE OR REPLACE FUNCTION public.on_shipment_shipped()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'shipped' AND (OLD.status IS DISTINCT FROM 'shipped') THEN
    -- Update shipped_at on shipment
    NEW.shipped_at := COALESCE(NEW.shipped_at, now());

    -- Update all inventory_units linked to this order
    UPDATE public.inventory_units
    SET fulfillment_status = 'shipped',
        shipped_at = now(),
        shipment_id = NEW.id::text
    WHERE order_id = NEW.order_id::text
      AND fulfillment_status IN ('reserved', 'qr_generated', 'qr_applied');
  END IF;

  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shipment_shipped
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.on_shipment_shipped();

-- Table for recipient registrations
CREATE TABLE public.recipient_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_unit_id UUID NOT NULL REFERENCES public.inventory_units(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_message TEXT,
  recipient_email TEXT,
  contact_opt_in BOOLEAN NOT NULL DEFAULT false,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add unique constraint so one unit = one registration
ALTER TABLE public.recipient_registrations
  ADD CONSTRAINT uq_recipient_registrations_unit UNIQUE (inventory_unit_id);

-- RLS
ALTER TABLE public.recipient_registrations ENABLE ROW LEVEL SECURITY;

-- Public can insert (anonymous registration via QR)
CREATE POLICY "Anyone can register a postcard"
  ON public.recipient_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Admins can manage all
CREATE POLICY "Admins can manage registrations"
  ON public.recipient_registrations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Travelers can view registrations for their own units
CREATE POLICY "Travelers can view own registrations"
  ON public.recipient_registrations
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_units iu
    WHERE iu.id = recipient_registrations.inventory_unit_id
      AND iu.traveler_user_id = auth.uid()
  ));

-- Event types enum
CREATE TYPE public.inventory_event_type AS ENUM (
  'created_in_stock', 'reserved_for_order', 'qr_generated', 'qr_applied',
  'shipped', 'registered', 'voided', 'damaged'
);

-- Actor types enum
CREATE TYPE public.event_actor_type AS ENUM ('system', 'admin', 'traveler', 'recipient');

-- Events table
CREATE TABLE public.inventory_unit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_unit_id UUID NOT NULL REFERENCES public.inventory_units(id) ON DELETE CASCADE,
  event_type public.inventory_event_type NOT NULL,
  actor_type public.event_actor_type NOT NULL DEFAULT 'system',
  actor_id UUID,
  payload_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_unit_events_unit ON public.inventory_unit_events(inventory_unit_id);
CREATE INDEX idx_inventory_unit_events_type ON public.inventory_unit_events(event_type);

-- RLS
ALTER TABLE public.inventory_unit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage events"
  ON public.inventory_unit_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Travelers can view own unit events"
  ON public.inventory_unit_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_units iu
    WHERE iu.id = inventory_unit_events.inventory_unit_id
      AND iu.traveler_user_id = auth.uid()
  ));

-- Allow system inserts (for triggers using SECURITY DEFINER)
-- Trigger function to auto-log events
CREATE OR REPLACE FUNCTION public.log_inventory_unit_event()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _event_type inventory_event_type;
  _actor_type event_actor_type := 'system';
  _actor_id UUID;
  _payload JSONB := '{}'::jsonb;
BEGIN
  -- INSERT = created
  IF TG_OP = 'INSERT' THEN
    _event_type := 'created_in_stock';
    _payload := jsonb_build_object(
      'stock_batch_id', NEW.stock_batch_id,
      'card_design_id', NEW.card_design_id,
      'internal_inventory_code', NEW.internal_inventory_code
    );

    INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, actor_id, payload_json)
    VALUES (NEW.id, _event_type, _actor_type, _actor_id, _payload);

    RETURN NEW;
  END IF;

  -- UPDATE: detect what changed
  IF TG_OP = 'UPDATE' THEN
    -- Reserved
    IF OLD.fulfillment_status = 'in_stock' AND NEW.fulfillment_status = 'reserved' THEN
      INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, payload_json)
      VALUES (NEW.id, 'reserved_for_order', 'system', jsonb_build_object(
        'order_id', NEW.order_id,
        'traveler_user_id', NEW.traveler_user_id
      ));
    END IF;

    -- QR generated
    IF OLD.fulfillment_status IN ('in_stock', 'reserved') AND NEW.fulfillment_status = 'qr_generated' THEN
      INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, payload_json)
      VALUES (NEW.id, 'qr_generated', 'admin', jsonb_build_object(
        'public_claim_code', NEW.public_claim_code
      ));
    END IF;

    -- QR applied
    IF OLD.fulfillment_status != 'qr_applied' AND NEW.fulfillment_status = 'qr_applied' THEN
      INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, payload_json)
      VALUES (NEW.id, 'qr_applied', 'admin', '{}'::jsonb);
    END IF;

    -- Shipped
    IF OLD.fulfillment_status != 'shipped' AND NEW.fulfillment_status = 'shipped' THEN
      INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, payload_json)
      VALUES (NEW.id, 'shipped', 'system', jsonb_build_object(
        'shipment_id', NEW.shipment_id
      ));
    END IF;

    -- Registered (business_status change)
    IF (OLD.business_status IS DISTINCT FROM 'registered') AND NEW.business_status = 'registered' THEN
      INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, payload_json)
      VALUES (NEW.id, 'registered', 'recipient', '{}'::jsonb);
    END IF;

    -- Voided
    IF OLD.fulfillment_status != 'voided' AND NEW.fulfillment_status = 'voided' THEN
      INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, payload_json)
      VALUES (NEW.id, 'voided', 'admin', jsonb_build_object(
        'previous_status', OLD.fulfillment_status
      ));
    END IF;

    -- Damaged
    IF OLD.fulfillment_status != 'damaged' AND NEW.fulfillment_status = 'damaged' THEN
      INSERT INTO public.inventory_unit_events (inventory_unit_id, event_type, actor_type, payload_json)
      VALUES (NEW.id, 'damaged', 'admin', jsonb_build_object(
        'previous_status', OLD.fulfillment_status
      ));
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER trg_inventory_unit_events
  AFTER INSERT OR UPDATE ON public.inventory_units
  FOR EACH ROW
  EXECUTE FUNCTION public.log_inventory_unit_event();
-- 1. Drop the permissive INSERT policy on recipient_registrations
DROP POLICY IF EXISTS "Anyone can register a postcard" ON public.recipient_registrations;

-- 2. Add validation triggers for input length on profiles
CREATE OR REPLACE FUNCTION public.validate_profile_input()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF length(NEW.display_name) > 100 THEN
    RAISE EXCEPTION 'display_name too long (max 100)';
  END IF;
  IF length(NEW.first_name) > 50 THEN
    RAISE EXCEPTION 'first_name too long (max 50)';
  END IF;
  IF length(NEW.last_name) > 50 THEN
    RAISE EXCEPTION 'last_name too long (max 50)';
  END IF;
  IF length(NEW.bio) > 1000 THEN
    RAISE EXCEPTION 'bio too long (max 1000)';
  END IF;
  IF length(NEW.city) > 100 THEN
    RAISE EXCEPTION 'city too long (max 100)';
  END IF;
  IF length(NEW.country) > 100 THEN
    RAISE EXCEPTION 'country too long (max 100)';
  END IF;
  IF length(NEW.avatar_url) > 500 THEN
    RAISE EXCEPTION 'avatar_url too long (max 500)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_profile_input
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_input();

-- 3. Add validation trigger for recipient_registrations
CREATE OR REPLACE FUNCTION public.validate_registration_input()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF length(NEW.recipient_name) > 100 THEN
    RAISE EXCEPTION 'recipient_name too long (max 100)';
  END IF;
  IF length(NEW.recipient_message) > 500 THEN
    RAISE EXCEPTION 'recipient_message too long (max 500)';
  END IF;
  IF length(NEW.recipient_email) > 255 THEN
    RAISE EXCEPTION 'recipient_email too long (max 255)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_registration_input
BEFORE INSERT OR UPDATE ON public.recipient_registrations
FOR EACH ROW EXECUTE FUNCTION public.validate_registration_input();-- Fix 1: Restrict orders INSERT policy to only allow unpaid/pending orders
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
CREATE POLICY "Users can create own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND payment_status = 'unpaid' AND status = 'pending');

-- Fix 2: Add admin check to reserve_inventory_for_order RPC
CREATE OR REPLACE FUNCTION public.reserve_inventory_for_order(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order RECORD;
  _item RECORD;
  _reserved_count INTEGER;
  _available_count INTEGER;
  _unit_ids UUID[];
  _result JSONB := '{"reserved": []}'::jsonb;
  _errors JSONB := '[]'::jsonb;
BEGIN
  -- Admin-only check
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  SELECT * INTO _order FROM public.orders WHERE id = _order_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Zamówienie nie istnieje');
  END IF;
  
  IF _order.payment_status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Zamówienie nie jest opłacone');
  END IF;

  SELECT COUNT(*) INTO _reserved_count
  FROM public.inventory_units
  WHERE order_id = _order_id::text;
  
  IF _reserved_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Zamówienie ma już zarezerwowane sztuki (' || _reserved_count || ')');
  END IF;

  FOR _item IN
    SELECT oi.id AS item_id, oi.card_design_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
  LOOP
    SELECT COUNT(*) INTO _available_count
    FROM public.inventory_units
    WHERE card_design_id = _item.card_design_id
      AND fulfillment_status = 'in_stock'
      AND order_id IS NULL;
    
    IF _available_count < _item.quantity THEN
      _errors := _errors || jsonb_build_array(jsonb_build_object(
        'card_design_id', _item.card_design_id,
        'requested', _item.quantity,
        'available', _available_count
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(_errors) > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Brak wystarczającej ilości sztuk w magazynie',
      'shortages', _errors
    );
  END IF;

  FOR _item IN
    SELECT oi.id AS item_id, oi.card_design_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
  LOOP
    SELECT ARRAY_AGG(id) INTO _unit_ids
    FROM (
      SELECT id
      FROM public.inventory_units
      WHERE card_design_id = _item.card_design_id
        AND fulfillment_status = 'in_stock'
        AND order_id IS NULL
      ORDER BY created_at ASC
      LIMIT _item.quantity
      FOR UPDATE SKIP LOCKED
    ) sub;

    UPDATE public.inventory_units
    SET fulfillment_status = 'reserved',
        business_status = 'purchased',
        traveler_user_id = _order.user_id,
        order_id = _order_id::text,
        order_item_id = _item.item_id::text
    WHERE id = ANY(_unit_ids);

    _result := jsonb_set(_result, '{reserved}', 
      (_result->'reserved') || jsonb_build_array(jsonb_build_object(
        'order_item_id', _item.item_id,
        'card_design_id', _item.card_design_id,
        'count', array_length(_unit_ids, 1)
      ))
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'details', _result);
END;
$function$;

-- Fix 3: Remove PII-leaking public SELECT on postcards table
DROP POLICY IF EXISTS "Public can view purchased and registered postcards" ON public.postcards;-- Drop existing trigger if it exists (on auth.users)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Updated handle_new_user to also store first_name, last_name from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'traveler');

  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- 1. Add gamification columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_rank text NOT NULL DEFAULT 'Zwiadowca';

-- 2. Create the gamification stats view
CREATE OR REPLACE VIEW public.user_gamification_stats AS
SELECT
  p.user_id,
  p.display_name,
  COALESCE(unit_stats.unit_count, 0) AS unit_count,
  COALESCE(unit_stats.unique_countries, 0) AS unique_countries,
  COALESCE(reg_stats.registration_count, 0) AS registration_count,
  (
    COALESCE(unit_stats.unit_count, 0) * 10
    + COALESCE(unit_stats.unique_countries, 0) * 50
    + COALESCE(reg_stats.registration_count, 0) * 100
  ) AS total_points,
  CASE
    WHEN (
      COALESCE(unit_stats.unit_count, 0) * 10
      + COALESCE(unit_stats.unique_countries, 0) * 50
      + COALESCE(reg_stats.registration_count, 0) * 100
    ) >= 7500 THEN 'Legenda Podróżówki'
    WHEN (
      COALESCE(unit_stats.unit_count, 0) * 10
      + COALESCE(unit_stats.unique_countries, 0) * 50
      + COALESCE(reg_stats.registration_count, 0) * 100
    ) >= 2500 THEN 'Misjonarz Kultury'
    WHEN (
      COALESCE(unit_stats.unit_count, 0) * 10
      + COALESCE(unit_stats.unique_countries, 0) * 50
      + COALESCE(reg_stats.registration_count, 0) * 100
    ) >= 500 THEN 'Ambasador'
    ELSE 'Zwiadowca'
  END AS impact_rank
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS unit_count,
    COUNT(DISTINCT cd.country_id)::int AS unique_countries
  FROM public.inventory_units iu
  JOIN public.card_designs cd ON cd.id = iu.card_design_id
  WHERE iu.traveler_user_id = p.user_id
) unit_stats ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS registration_count
  FROM public.recipient_registrations rr
  JOIN public.inventory_units iu ON iu.id = rr.inventory_unit_id
  WHERE iu.traveler_user_id = p.user_id
) reg_stats ON true;

-- 3. Create function to recalculate gamification points for a user
CREATE OR REPLACE FUNCTION public.recalculate_user_gamification(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _unit_count int;
  _unique_countries int;
  _reg_count int;
  _total int;
  _rank text;
BEGIN
  SELECT
    COUNT(*)::int,
    COUNT(DISTINCT cd.country_id)::int
  INTO _unit_count, _unique_countries
  FROM public.inventory_units iu
  JOIN public.card_designs cd ON cd.id = iu.card_design_id
  WHERE iu.traveler_user_id = _user_id;

  SELECT COUNT(*)::int INTO _reg_count
  FROM public.recipient_registrations rr
  JOIN public.inventory_units iu ON iu.id = rr.inventory_unit_id
  WHERE iu.traveler_user_id = _user_id;

  _total := (_unit_count * 10) + (_unique_countries * 50) + (_reg_count * 100);

  _rank := CASE
    WHEN _total >= 7500 THEN 'Legenda Podróżówki'
    WHEN _total >= 2500 THEN 'Misjonarz Kultury'
    WHEN _total >= 500 THEN 'Ambasador'
    ELSE 'Zwiadowca'
  END;

  UPDATE public.profiles
  SET total_points = _total,
      current_rank = _rank
  WHERE user_id = _user_id;
END;
$$;

-- 4. Trigger function on recipient_registrations insert
CREATE OR REPLACE FUNCTION public.on_registration_recalc_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _traveler_id uuid;
BEGIN
  SELECT traveler_user_id INTO _traveler_id
  FROM public.inventory_units
  WHERE id = NEW.inventory_unit_id;

  IF _traveler_id IS NOT NULL THEN
    PERFORM public.recalculate_user_gamification(_traveler_id);
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Create the trigger
CREATE TRIGGER trg_registration_gamification
AFTER INSERT ON public.recipient_registrations
FOR EACH ROW
EXECUTE FUNCTION public.on_registration_recalc_gamification();

-- Fix: recreate the view with SECURITY INVOKER (default, explicit)
DROP VIEW IF EXISTS public.user_gamification_stats;

CREATE VIEW public.user_gamification_stats
WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.display_name,
  COALESCE(unit_stats.unit_count, 0) AS unit_count,
  COALESCE(unit_stats.unique_countries, 0) AS unique_countries,
  COALESCE(reg_stats.registration_count, 0) AS registration_count,
  (
    COALESCE(unit_stats.unit_count, 0) * 10
    + COALESCE(unit_stats.unique_countries, 0) * 50
    + COALESCE(reg_stats.registration_count, 0) * 100
  ) AS total_points,
  CASE
    WHEN (
      COALESCE(unit_stats.unit_count, 0) * 10
      + COALESCE(unit_stats.unique_countries, 0) * 50
      + COALESCE(reg_stats.registration_count, 0) * 100
    ) >= 7500 THEN 'Legenda Podróżówki'
    WHEN (
      COALESCE(unit_stats.unit_count, 0) * 10
      + COALESCE(unit_stats.unique_countries, 0) * 50
      + COALESCE(reg_stats.registration_count, 0) * 100
    ) >= 2500 THEN 'Misjonarz Kultury'
    WHEN (
      COALESCE(unit_stats.unit_count, 0) * 10
      + COALESCE(unit_stats.unique_countries, 0) * 50
      + COALESCE(reg_stats.registration_count, 0) * 100
    ) >= 500 THEN 'Ambasador'
    ELSE 'Zwiadowca'
  END AS impact_rank
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS unit_count,
    COUNT(DISTINCT cd.country_id)::int AS unique_countries
  FROM public.inventory_units iu
  JOIN public.card_designs cd ON cd.id = iu.card_design_id
  WHERE iu.traveler_user_id = p.user_id
) unit_stats ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS registration_count
  FROM public.recipient_registrations rr
  JOIN public.inventory_units iu ON iu.id = rr.inventory_unit_id
  WHERE iu.traveler_user_id = p.user_id
) reg_stats ON true;

-- 1. Replace the existing function with the canonical name and full logic
CREATE OR REPLACE FUNCTION public.calculate_user_impact_points(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _unit_count int;
  _unique_countries int;
  _reg_count int;
  _total int;
  _rank text;
BEGIN
  SELECT
    COUNT(*)::int,
    COUNT(DISTINCT cd.country_id)::int
  INTO _unit_count, _unique_countries
  FROM public.inventory_units iu
  JOIN public.card_designs cd ON cd.id = iu.card_design_id
  WHERE iu.traveler_user_id = _user_id;

  SELECT COUNT(*)::int INTO _reg_count
  FROM public.recipient_registrations rr
  JOIN public.inventory_units iu ON iu.id = rr.inventory_unit_id
  WHERE iu.traveler_user_id = _user_id;

  _total := (_unit_count * 10) + (_unique_countries * 50) + (_reg_count * 100);

  _rank := CASE
    WHEN _total >= 7500 THEN 'Legenda Podróżówki'
    WHEN _total >= 2500 THEN 'Misjonarz Kultury'
    WHEN _total >= 500 THEN 'Ambasador'
    ELSE 'Zwiadowca'
  END;

  UPDATE public.profiles
  SET total_points = _total,
      current_rank = _rank
  WHERE user_id = _user_id;
END;
$$;

-- 2. Update the existing registration trigger to use canonical function name
CREATE OR REPLACE FUNCTION public.on_registration_recalc_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _traveler_id uuid;
BEGIN
  SELECT traveler_user_id INTO _traveler_id
  FROM public.inventory_units
  WHERE id = NEW.inventory_unit_id;

  IF _traveler_id IS NOT NULL THEN
    PERFORM public.calculate_user_impact_points(_traveler_id);
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger on inventory_units INSERT to recalculate for the assigned traveler
CREATE OR REPLACE FUNCTION public.on_inventory_unit_recalc_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.traveler_user_id IS NOT NULL THEN
    PERFORM public.calculate_user_impact_points(NEW.traveler_user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_unit_gamification ON public.inventory_units;
CREATE TRIGGER trg_inventory_unit_gamification
AFTER INSERT ON public.inventory_units
FOR EACH ROW
EXECUTE FUNCTION public.on_inventory_unit_recalc_gamification();

-- 1. Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Index for fast user lookups
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- 3. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS: users can read own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. RLS: users can mark own notifications as read
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. RLS: system (via security definer functions) inserts - no direct user inserts
-- Notifications are created only by triggers (SECURITY DEFINER), not by users directly.

-- 7. Admins can manage all notifications
CREATE POLICY "Admins can manage notifications"
  ON public.notifications
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 9. Trigger: notify on rank change
CREATE OR REPLACE FUNCTION public.notify_on_rank_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  IF OLD.current_rank IS DISTINCT FROM NEW.current_rank AND NEW.current_rank != 'Zwiadowca' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Awansowałeś!',
      'Gratulacje, Twoja nowa ranga to ' || NEW.current_rank || '!',
      'rank_up'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_rank_change
  AFTER UPDATE OF current_rank ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_rank_change();

-- 10. Trigger: notify traveler on new registration
CREATE OR REPLACE FUNCTION public.notify_on_new_registration()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE
  _traveler_id uuid;
BEGIN
  SELECT traveler_user_id INTO _traveler_id
  FROM public.inventory_units
  WHERE id = NEW.inventory_unit_id;

  IF _traveler_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      _traveler_id,
      'Nowa relacja!',
      'Ktoś właśnie zarejestrował Twoją Podróżówkę. Zdobywasz punkty Wpływu Kulturowego!',
      'new_registration'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_registration
  AFTER INSERT ON public.recipient_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_registration();

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatars (path: user_id/*)
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own avatars
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own avatars
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Feature Flags table
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT false
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Anyone can read feature flags"
  ON public.feature_flags
  FOR SELECT
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert feature flags"
  ON public.feature_flags
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update feature flags"
  ON public.feature_flags
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete feature flags"
  ON public.feature_flags
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed default flags
INSERT INTO public.feature_flags (key, name, description, is_enabled) VALUES
  ('travel_stats', 'Statystyki Kilometrów', 'Liczenie dystansu kartek od Warszawy', false),
  ('wall_of_connections', 'Ściana Relacji', 'Galeria zdjęć z rejestracji', false),
  ('travelers_journal', 'Dziennik Ambasadora', 'Oś czasu relacji', false),
  ('cultural_missions', 'Misje Kulturowe', 'Wyzwania dla podróżników', false);

-- 1. Add lat/lng to recipient_registrations
ALTER TABLE public.recipient_registrations
  ADD COLUMN latitude numeric,
  ADD COLUMN longitude numeric;

-- 2. Add total_kilometers to profiles
ALTER TABLE public.profiles
  ADD COLUMN total_kilometers integer NOT NULL DEFAULT 0;

-- 3. Haversine distance function (km)
CREATE OR REPLACE FUNCTION public.calculate_distance(
  lat1 numeric, lon1 numeric,
  lat2 numeric, lon2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  r numeric := 6371;
  dlat numeric;
  dlon numeric;
  a numeric;
  c numeric;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ^ 2;
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  RETURN round(r * c);
END;
$$;

-- 4. Trigger function: on registration with coords, add distance to traveler's profile
CREATE OR REPLACE FUNCTION public.on_registration_add_kilometers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _traveler_id uuid;
  _dist integer;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT traveler_user_id INTO _traveler_id
  FROM public.inventory_units
  WHERE id = NEW.inventory_unit_id;

  IF _traveler_id IS NULL THEN
    RETURN NEW;
  END IF;

  _dist := public.calculate_distance(52.2297, 21.0122, NEW.latitude, NEW.longitude)::integer;

  UPDATE public.profiles
  SET total_kilometers = total_kilometers + _dist
  WHERE user_id = _traveler_id;

  RETURN NEW;
END;
$$;

-- 5. Attach trigger
CREATE TRIGGER trg_registration_kilometers
  AFTER INSERT ON public.recipient_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.on_registration_add_kilometers();
-- Create a view that masks recipient_email when contact_opt_in is false
-- This enforces privacy at the database level, preventing API bypasses
CREATE OR REPLACE VIEW public.traveler_registrations_view
WITH (security_invoker = true) AS
SELECT
  id,
  inventory_unit_id,
  recipient_name,
  recipient_message,
  CASE WHEN contact_opt_in = true THEN recipient_email ELSE NULL END AS recipient_email,
  contact_opt_in,
  registered_at,
  latitude,
  longitude,
  created_at
FROM public.recipient_registrations;-- Step 1: Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Step 2: Authenticated users can view their own full profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 3: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Step 4: Create a public view with ONLY non-PII fields
-- Default security_invoker=false so it bypasses RLS - the view itself controls access
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  user_id,
  display_name,
  avatar_url,
  total_points,
  current_rank,
  total_kilometers
FROM public.profiles;-- Fix: Convert to security_invoker view and add a narrow public policy
-- Drop the definer view
DROP VIEW IF EXISTS public.profiles_public;

-- Recreate with security_invoker = true
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT
  user_id,
  display_name,
  avatar_url,
  total_points,
  current_rank,
  total_kilometers
FROM public.profiles;

-- Add a public SELECT policy that only exposes what's needed for ranking
-- The view already limits columns; RLS allows the read
CREATE POLICY "Public can view profiles for ranking"
  ON public.profiles FOR SELECT
  USING (total_points > 0);-- Fix 1: Revoke public EXECUTE on gamification functions (they're only called by triggers)
REVOKE EXECUTE ON FUNCTION public.recalculate_user_gamification(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_user_impact_points(uuid) FROM PUBLIC, anon, authenticated;

-- Fix 2: Secure profiles_public view - enable RLS and restrict to authenticated users
ALTER VIEW public.profiles_public SET (security_invoker = false);
DROP POLICY IF EXISTS "Public can view profiles for ranking" ON public.profiles;

-- Recreate the public ranking policy scoped to authenticated only
CREATE POLICY "Authenticated can view profiles for ranking"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (total_points > 0);-- Fix profiles_public view: recreate with security_invoker = true
DROP VIEW IF EXISTS public.profiles_public;

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT
  user_id,
  display_name,
  avatar_url,
  total_points,
  current_rank,
  total_kilometers
FROM public.profiles;DROP POLICY IF EXISTS "Anyone can register a postcard" ON public.recipient_registrations;
-- 1. Drop the overly broad ranking policy that exposes PII (first_name, last_name, etc.)
DROP POLICY IF EXISTS "Authenticated can view profiles for ranking" ON public.profiles;

-- 2. Recreate profiles_public view as SECURITY DEFINER (security_invoker=false)
--    so it bypasses RLS with its own controlled column projection (no PII columns).
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = false) AS
SELECT
  id,
  user_id,
  display_name,
  avatar_url,
  total_points,
  current_rank,
  total_kilometers,
  postcards_purchased,
  postcards_received
FROM public.profiles;

-- 3. Grant SELECT to authenticated and anon so ranking/community features work
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

-- Recreate profiles_public as SECURITY DEFINER and re-grant access
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = false) AS
SELECT
  id,
  user_id,
  display_name,
  avatar_url,
  total_points,
  current_rank,
  total_kilometers,
  postcards_purchased,
  postcards_received
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

-- Trigger: recalculate gamification when inventory_unit is assigned to a traveler
CREATE OR REPLACE TRIGGER trg_inventory_unit_recalc_gamification
  AFTER INSERT OR UPDATE ON public.inventory_units
  FOR EACH ROW
  EXECUTE FUNCTION public.on_inventory_unit_recalc_gamification();

-- Trigger: recalculate gamification when a new registration happens
CREATE OR REPLACE TRIGGER trg_registration_recalc_gamification
  AFTER INSERT ON public.recipient_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.on_registration_recalc_gamification();

-- Trigger: add kilometers on registration
CREATE OR REPLACE TRIGGER trg_registration_add_kilometers
  AFTER INSERT ON public.recipient_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.on_registration_add_kilometers();

-- Trigger: notify traveler on new registration
CREATE OR REPLACE TRIGGER trg_notify_on_new_registration
  AFTER INSERT ON public.recipient_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_registration();

-- Trigger: notify on rank change
CREATE OR REPLACE TRIGGER trg_notify_on_rank_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_rank_change();

-- Trigger: log inventory unit events
CREATE OR REPLACE TRIGGER trg_log_inventory_unit_event
  AFTER INSERT OR UPDATE ON public.inventory_units
  FOR EACH ROW
  EXECUTE FUNCTION public.log_inventory_unit_event();

-- Trigger: shipment status changes
CREATE OR REPLACE TRIGGER trg_on_shipment_shipped
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.on_shipment_shipped();

-- Trigger: update member count on new profile
CREATE OR REPLACE TRIGGER trg_update_member_count
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_member_count();

-- Trigger: update updated_at on profiles
CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update updated_at on inventory_units
CREATE OR REPLACE TRIGGER trg_inventory_units_updated_at
  BEFORE UPDATE ON public.inventory_units
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update updated_at on orders
CREATE OR REPLACE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: validate profile input
CREATE OR REPLACE TRIGGER trg_validate_profile_input
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_input();

-- Trigger: validate registration input
CREATE OR REPLACE TRIGGER trg_validate_registration_input
  BEFORE INSERT OR UPDATE ON public.recipient_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_registration_input();

CREATE OR REPLACE FUNCTION public.calculate_user_impact_points(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _unit_count int;
  _unique_countries int;
  _reg_count int;
  _total int;
  _rank text;
  _ppu int;
  _ppc int;
  _ppr int;
BEGIN
  -- Dynamically fetch scoring config
  SELECT points_per_unit, points_per_country, points_per_registration
  INTO _ppu, _ppc, _ppr
  FROM public.gamification_config
  WHERE id = 1;

  -- Fallback defaults
  _ppu := COALESCE(_ppu, 10);
  _ppc := COALESCE(_ppc, 50);
  _ppr := COALESCE(_ppr, 100);

  SELECT
    COUNT(*)::int,
    COUNT(DISTINCT cd.country_id)::int
  INTO _unit_count, _unique_countries
  FROM public.inventory_units iu
  JOIN public.card_designs cd ON cd.id = iu.card_design_id
  WHERE iu.traveler_user_id = _user_id;

  SELECT COUNT(*)::int INTO _reg_count
  FROM public.recipient_registrations rr
  JOIN public.inventory_units iu ON iu.id = rr.inventory_unit_id
  WHERE iu.traveler_user_id = _user_id;

  _total := (_unit_count * _ppu) + (_unique_countries * _ppc) + (_reg_count * _ppr);

  -- Dynamically determine rank from gamification_tiers
  SELECT name INTO _rank
  FROM public.gamification_tiers
  WHERE min_points <= _total
  ORDER BY min_points DESC
  LIMIT 1;

  _rank := COALESCE(_rank, 'Zwiadowca');

  UPDATE public.profiles
  SET total_points = _total,
      current_rank = _rank
  WHERE user_id = _user_id;
END;
$function$;

-- 1. PROFILES
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. RECIPIENT_REGISTRATIONS
DROP POLICY IF EXISTS "Travelers can view own registrations" ON public.recipient_registrations;
REVOKE SELECT ON public.recipient_registrations FROM authenticated, anon;
GRANT SELECT (id, inventory_unit_id, recipient_name, recipient_message, contact_opt_in, registered_at, created_at)
  ON public.recipient_registrations TO authenticated;
CREATE POLICY "Travelers can view own registrations (limited)" ON public.recipient_registrations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_units iu
    WHERE iu.id = recipient_registrations.inventory_unit_id
      AND iu.traveler_user_id = auth.uid()
  ));

-- 3. View
DROP VIEW IF EXISTS public.traveler_registrations_view;
CREATE VIEW public.traveler_registrations_view
WITH (security_invoker = true) AS
SELECT
  rr.id, rr.inventory_unit_id, rr.recipient_name, rr.recipient_message,
  CASE WHEN rr.contact_opt_in THEN rr.recipient_email ELSE NULL END AS recipient_email,
  rr.contact_opt_in, rr.registered_at, rr.created_at
FROM public.recipient_registrations rr
WHERE EXISTS (
  SELECT 1 FROM public.inventory_units iu
  WHERE iu.id = rr.inventory_unit_id AND iu.traveler_user_id = auth.uid()
);
GRANT SELECT ON public.traveler_registrations_view TO authenticated;

-- 4. Admin RPC
CREATE OR REPLACE FUNCTION public.admin_list_recipient_registrations()
RETURNS SETOF public.recipient_registrations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.recipient_registrations
  WHERE public.has_role(auth.uid(), 'admin');
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_recipient_registrations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_recipient_registrations() TO authenticated;

-- 5. POSTCARDS legacy: revoke sensitive cols
REVOKE SELECT ON public.postcards FROM authenticated, anon;
GRANT SELECT (id, design_id, serial_number, qr_token, status, buyer_id, buyer_display_name, purchased_at, order_reference, registered_at, created_at, updated_at)
  ON public.postcards TO authenticated;

-- 6. STORAGE listing policies
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view postcard photos" ON storage.objects;

-- 7. STORAGE postcard-photos INSERT folder check
DROP POLICY IF EXISTS "Authenticated users can upload postcard photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload postcard photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'postcard-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 8. Revoke EXECUTE on SECURITY DEFINER funcs from clients
REVOKE EXECUTE ON FUNCTION public.reserve_inventory_for_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_user_gamification(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_user_impact_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_country_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_distance(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_claim_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_order_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_tracking_code() FROM PUBLIC, anon, authenticated;

-- Revoke EXECUTE from anon/authenticated on all trigger / internal SECURITY DEFINER funcs
REVOKE EXECUTE ON FUNCTION public.on_registration_add_kilometers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_rank_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_platform_stats_on_postcard_v2() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_profile_stats_on_postcard_v2() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_inventory_unit_recalc_gamification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_new_registration() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_shipment_shipped() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_inventory_unit_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_registration_recalc_gamification() FROM PUBLIC, anon, authenticated;

-- Switch shared views to security_invoker so they enforce caller's RLS
ALTER VIEW public.profiles_public SET (security_invoker = true);
ALTER VIEW public.user_gamification_stats SET (security_invoker = true);

-- Fix #1, #4: Tighten profiles RLS — drop the overly-broad ranking SELECT policy.
-- "Users can view own profile" already exists and is correct. Public ranking
-- reads must go through the profiles_public view.
DROP POLICY IF EXISTS "Authenticated can view profiles for ranking" ON public.profiles;

-- Fix #8: profiles_public is not meant for anon; revoke that grant.
REVOKE SELECT ON public.profiles_public FROM anon;

-- Fix #2: Lock down direct INSERT to orders / order_items. From now on,
-- orders are created exclusively through the create_order RPC, which
-- computes price server-side from the catalog (no client manipulation).
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create own order items" ON public.order_items;

CREATE OR REPLACE FUNCTION public.create_order(
  _items jsonb,
  _shipping_name text,
  _shipping_address text,
  _shipping_city text,
  _shipping_postal_code text,
  _shipping_country text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _order_id uuid;
  _item jsonb;
  _design_id uuid;
  _qty int;
  _unit_price numeric(10,2) := 9.99;
  _total numeric(10,2) := 0;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Too many items';
  END IF;
  IF coalesce(length(_shipping_name), 0) = 0
     OR coalesce(length(_shipping_address), 0) = 0
     OR coalesce(length(_shipping_city), 0) = 0
     OR coalesce(length(_shipping_postal_code), 0) = 0
     OR coalesce(length(_shipping_country), 0) = 0 THEN
    RAISE EXCEPTION 'Shipping address required';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _design_id := (_item->>'card_design_id')::uuid;
    _qty := (_item->>'quantity')::int;
    IF _qty IS NULL OR _qty < 1 OR _qty > 1000 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.card_designs WHERE id = _design_id AND active = true)
      INTO _exists;
    IF NOT _exists THEN
      RAISE EXCEPTION 'Invalid card_design_id';
    END IF;
    _total := _total + (_qty * _unit_price);
  END LOOP;

  INSERT INTO public.orders(
    user_id, total_amount,
    shipping_name, shipping_address, shipping_city, shipping_postal_code, shipping_country
  ) VALUES (
    _uid, _total,
    _shipping_name, _shipping_address, _shipping_city, _shipping_postal_code, _shipping_country
  )
  RETURNING id INTO _order_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _design_id := (_item->>'card_design_id')::uuid;
    _qty := (_item->>'quantity')::int;
    INSERT INTO public.order_items(order_id, card_design_id, quantity, unit_price, total_price)
    VALUES (_order_id, _design_id, _qty, _unit_price, _qty * _unit_price);
  END LOOP;

  RETURN jsonb_build_object('id', _order_id, 'total_amount', _total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, text, text) TO authenticated;

-- Fix #11: Explicit Forbidden in admin RPC
CREATE OR REPLACE FUNCTION public.admin_list_recipient_registrations()
RETURNS SETOF public.recipient_registrations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.recipient_registrations;
END;
$$;

-- Fix #3 + #5: Atomic register_recipient RPC (no race, saves lat/lon)
CREATE OR REPLACE FUNCTION public.register_recipient(
  _unit_id uuid,
  _recipient_name text,
  _recipient_message text,
  _recipient_email text,
  _contact_opt_in boolean,
  _latitude numeric,
  _longitude numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
BEGIN
  SELECT business_status INTO _status
  FROM public.inventory_units
  WHERE id = _unit_id
  FOR UPDATE;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF _status = 'registered' THEN
    RAISE EXCEPTION 'already_registered';
  END IF;
  IF _status <> 'purchased' THEN
    RAISE EXCEPTION 'not_activated';
  END IF;

  INSERT INTO public.recipient_registrations(
    inventory_unit_id, recipient_name, recipient_message, recipient_email,
    contact_opt_in, latitude, longitude
  ) VALUES (
    _unit_id, _recipient_name, _recipient_message, _recipient_email,
    _contact_opt_in, _latitude, _longitude
  );

  UPDATE public.inventory_units
  SET business_status = 'registered', registered_at = now()
  WHERE id = _unit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_recipient(uuid, text, text, text, boolean, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_recipient(uuid, text, text, text, boolean, numeric, numeric) TO service_role;

-- Restrict direct SELECT on sensitive recipient columns; force access via view/RPC
REVOKE SELECT (recipient_email, latitude, longitude) ON public.recipient_registrations FROM authenticated;
REVOKE SELECT (recipient_email, latitude, longitude) ON public.recipient_registrations FROM anon;

-- Ensure travelers can read the safe, opt-in aware view
GRANT SELECT ON public.traveler_registrations_view TO authenticated;

-- Fix 1: recipient_registrations — drop traveler SELECT on base table; access only via traveler_registrations_view
DROP POLICY IF EXISTS "Travelers can view own registrations (limited)" ON public.recipient_registrations;

-- Fix 2: postcards — drop buyer SELECT policy that exposes recipient_email. Legacy table; admin-only.
DROP POLICY IF EXISTS "Buyers can view their own postcards" ON public.postcards;

-- Fix 3: storage buckets are intentionally public; add explicit public SELECT policies for clarity.
CREATE POLICY "Public read access to avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Public read access to postcard-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'postcard-photos');
DROP POLICY IF EXISTS "Public read access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to postcard-photos" ON storage.objects;