-- Wave 8 — Featured supplier end-to-end
-- Adds featured_image_url + tagline to suppliers, image_path to featured_applications.

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS featured_image_url TEXT,
    ADD COLUMN IF NOT EXISTS tagline TEXT;

ALTER TABLE featured_applications
    ADD COLUMN IF NOT EXISTS image_path TEXT;
