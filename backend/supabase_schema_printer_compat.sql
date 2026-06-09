-- ============================================================================
-- TonersCart — add compatible_models to printer_listings
-- Run this once in the Supabase SQL editor.
-- Lets dealers tag the compatible cartridges/toners for a printer listing via
-- the new searchable dropdown. Backend degrades gracefully until applied
-- (the column is dropped on write if missing, so printer uploads never break).
-- ============================================================================

ALTER TABLE public.printer_listings
    ADD COLUMN IF NOT EXISTS compatible_models text;
