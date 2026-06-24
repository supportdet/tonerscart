-- Wave 72 — extend printer_listings.category CHECK constraint to add the
-- three canonical types the dealer-facing UI now exposes:
--   ink-tank   (replaces the old split between 'ink' and 'tank' in the UI;
--               existing 'tank' rows are preserved for backward compat)
--   dot-matrix (new)
--   led        (new)
--
-- Old values are kept in the constraint so historical rows keep loading.
-- Run this once via Supabase SQL Editor.

ALTER TABLE printer_listings DROP CONSTRAINT IF EXISTS printer_listings_category_check;
ALTER TABLE printer_listings
    ADD CONSTRAINT printer_listings_category_check
    CHECK (category IN (
        'inkjet','laser','tank','thermal','production','digital_press',
        'label_barcode','ink','other',
        'ink-tank','dot-matrix','led'
    ));
