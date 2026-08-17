-- Enum values must be committed before they can be used by subsequent
-- functions and constraints, therefore they live in a separate migration.

ALTER TYPE public.business_status ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE public.fulfillment_status ADD VALUE IF NOT EXISTS 'allocated';
ALTER TYPE public.fulfillment_status ADD VALUE IF NOT EXISTS 'issued';
