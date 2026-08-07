-- Migration: Card Creator and Language Templates
-- Adds table for country-language template dictionary and updates card_designs with photo_author, crop_settings, and back_qr_label

CREATE TABLE IF NOT EXISTS public.card_language_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  language_name TEXT NOT NULL,
  front_thank_you_text TEXT NOT NULL,
  back_qr_label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT card_language_templates_country_lang_key UNIQUE (country_id, language_code)
);

-- Enable RLS
ALTER TABLE public.card_language_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Everyone can view card_language_templates" ON public.card_language_templates;
CREATE POLICY "Everyone can view card_language_templates"
  ON public.card_language_templates FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage card_language_templates" ON public.card_language_templates;
CREATE POLICY "Admins can manage card_language_templates"
  ON public.card_language_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_card_language_templates_updated_at ON public.card_language_templates;
CREATE TRIGGER trg_card_language_templates_updated_at
  BEFORE UPDATE ON public.card_language_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add creator-specific columns to card_designs if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'card_designs' AND column_name = 'photo_author'
  ) THEN
    ALTER TABLE public.card_designs ADD COLUMN photo_author TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'card_designs' AND column_name = 'crop_settings'
  ) THEN
    ALTER TABLE public.card_designs ADD COLUMN crop_settings JSONB DEFAULT '{"fit": "auto", "zoom": 100, "x": 50, "y": 50}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'card_designs' AND column_name = 'back_qr_label'
  ) THEN
    ALTER TABLE public.card_designs ADD COLUMN back_qr_label TEXT;
  END IF;
END $$;
