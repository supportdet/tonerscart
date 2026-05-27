-- Wave 9 — GST + Printer multi-select + Cascading filters
-- All ADD COLUMN IF NOT EXISTS so safe to re-run.

ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS gst_rate INT DEFAULT 18;

ALTER TABLE printer_listings
    ADD COLUMN IF NOT EXISTS gst_rate INT DEFAULT 18,
    ADD COLUMN IF NOT EXISTS usage_types TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS special_features TEXT[] DEFAULT '{}';

ALTER TABLE paper_listings
    ADD COLUMN IF NOT EXISTS gst_rate INT DEFAULT 18;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS gst_rate INT,
    ADD COLUMN IF NOT EXISTS gst_amount NUMERIC;
