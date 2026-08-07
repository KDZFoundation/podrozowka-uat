-- Migration to enable CASCADE deletion on card_designs child relationships

-- 1. card_design_images
ALTER TABLE IF EXISTS public.card_design_images
  DROP CONSTRAINT IF EXISTS card_design_images_card_design_id_fkey,
  ADD CONSTRAINT card_design_images_card_design_id_fkey
    FOREIGN KEY (card_design_id) REFERENCES public.card_designs(id) ON DELETE CASCADE;

-- 2. inventory_units
ALTER TABLE IF EXISTS public.inventory_units
  DROP CONSTRAINT IF EXISTS inventory_units_card_design_id_fkey,
  ADD CONSTRAINT inventory_units_card_design_id_fkey
    FOREIGN KEY (card_design_id) REFERENCES public.card_designs(id) ON DELETE CASCADE;

-- 3. stock_batches
ALTER TABLE IF EXISTS public.stock_batches
  DROP CONSTRAINT IF EXISTS stock_batches_card_design_id_fkey,
  ADD CONSTRAINT stock_batches_card_design_id_fkey
    FOREIGN KEY (card_design_id) REFERENCES public.card_designs(id) ON DELETE CASCADE;
