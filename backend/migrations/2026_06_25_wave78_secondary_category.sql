-- Wave 78 — printer_listings.secondary_category
-- Lets dealers select up to 2 printer types per listing (e.g. "Laser + LED",
-- "Inkjet + Ink Tank"). Primary `category` is still the canonical filter
-- column; `secondary_category` is purely descriptive metadata.
-- Run once via Supabase SQL Editor.

ALTER TABLE printer_listings
    ADD COLUMN IF NOT EXISTS secondary_category text;

-- Reuse the same allow-list as `category` (extended in Wave 72).
ALTER TABLE printer_listings DROP CONSTRAINT IF EXISTS printer_listings_secondary_category_check;
ALTER TABLE printer_listings
    ADD CONSTRAINT printer_listings_secondary_category_check
    CHECK (
        secondary_category IS NULL OR secondary_category IN (
            'inkjet','laser','tank','thermal','production','digital_press',
            'label_barcode','ink','other','ink-tank','dot-matrix','led'
        )
    );

CREATE INDEX IF NOT EXISTS printer_listings_secondary_category_idx
    ON printer_listings (secondary_category)
    WHERE secondary_category IS NOT NULL;
