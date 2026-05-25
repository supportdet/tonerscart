-- TonersCart v4 — Multi-color variants + multi-image upload + variant orders
-- Idempotent. Run from the Supabase SQL editor.

-- 1. listings.image_urls (2-3 images) ---------------------------------------
ALTER TABLE IF EXISTS listings         ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
ALTER TABLE IF EXISTS paper_listings   ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- 2. listing_variants -------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_variants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    color       TEXT NOT NULL,
    price       NUMERIC(12, 2) NOT NULL,
    stock       INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listing_variants_listing_id ON listing_variants(listing_id);
ALTER TABLE listing_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read variants" ON listing_variants;
CREATE POLICY "Public read variants" ON listing_variants FOR SELECT USING (true);

-- 3. orders.variant_id ------------------------------------------------------
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES listing_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_variant_id ON orders(variant_id);
