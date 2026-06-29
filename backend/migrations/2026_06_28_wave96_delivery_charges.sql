-- Wave 96 — Per-listing delivery charges (Intra-city + Inter-city).
--
-- Adds the dealer-controlled `intracity_delivery_charge` column on all 5
-- product tables and backfills defaults on existing rows for both the new
-- intracity column AND the existing intercity column.
--
-- Same-city default = 0. Intercity default = ₹350 for printers, ₹100 for
-- toners / papers / consumables / scanners (Wave 96 user spec).

-- ── Add intracity column where missing ────────────────────────────────────
ALTER TABLE listings              ADD COLUMN IF NOT EXISTS intracity_delivery_charge NUMERIC(10,2) DEFAULT 0;
ALTER TABLE printer_listings      ADD COLUMN IF NOT EXISTS intracity_delivery_charge NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paper_listings        ADD COLUMN IF NOT EXISTS intracity_delivery_charge NUMERIC(10,2) DEFAULT 0;
ALTER TABLE consumable_listings   ADD COLUMN IF NOT EXISTS intracity_delivery_charge NUMERIC(10,2) DEFAULT 0;
ALTER TABLE scanner_listings      ADD COLUMN IF NOT EXISTS intracity_delivery_charge NUMERIC(10,2) DEFAULT 0;

-- Ensure intercity column exists too (it should from earlier waves; this is a
-- safety net for fresh installs).
ALTER TABLE listings              ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2);
ALTER TABLE printer_listings      ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2);
ALTER TABLE paper_listings        ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2);
ALTER TABLE consumable_listings   ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2);
ALTER TABLE scanner_listings      ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2);

-- ── Backfill intracity = 0 on any row that's still NULL ───────────────────
UPDATE listings            SET intracity_delivery_charge = 0 WHERE intracity_delivery_charge IS NULL;
UPDATE printer_listings    SET intracity_delivery_charge = 0 WHERE intracity_delivery_charge IS NULL;
UPDATE paper_listings      SET intracity_delivery_charge = 0 WHERE intracity_delivery_charge IS NULL;
UPDATE consumable_listings SET intracity_delivery_charge = 0 WHERE intracity_delivery_charge IS NULL;
UPDATE scanner_listings    SET intracity_delivery_charge = 0 WHERE intracity_delivery_charge IS NULL;

-- ── Backfill intercity defaults: ₹350 for printers, ₹100 for everything else
UPDATE listings            SET intercity_delivery_charge = 100 WHERE intercity_delivery_charge IS NULL;
UPDATE printer_listings    SET intercity_delivery_charge = 350 WHERE intercity_delivery_charge IS NULL;
UPDATE paper_listings      SET intercity_delivery_charge = 100 WHERE intercity_delivery_charge IS NULL;
UPDATE consumable_listings SET intercity_delivery_charge = 100 WHERE intercity_delivery_charge IS NULL;
UPDATE scanner_listings    SET intercity_delivery_charge = 100 WHERE intercity_delivery_charge IS NULL;
