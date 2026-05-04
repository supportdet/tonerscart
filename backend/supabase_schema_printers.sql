-- TonersCart — Printers + MPS migration
-- Run this once in Supabase Dashboard → SQL Editor.

-- ============================================================
-- 1) printer_listings
-- ============================================================
CREATE TABLE IF NOT EXISTS printer_listings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,

    brand text NOT NULL,
    model_number text NOT NULL,
    description text,
    image_url text,

    condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','refurbished')),
    usage_type text NOT NULL CHECK (usage_type IN ('home','corporate','commercial','print_shop')),
    category text NOT NULL CHECK (category IN ('inkjet','laser','tank','thermal','production','digital_press','label_barcode','ink','other')),
    color text NOT NULL DEFAULT 'color' CHECK (color IN ('color','bw','both')),
    paper_sizes text[] NOT NULL DEFAULT '{}',
    functions text[] NOT NULL DEFAULT '{}',
    connectivity text[] NOT NULL DEFAULT '{}',
    features text[] NOT NULL DEFAULT '{}',

    monthly_volume_min int NOT NULL DEFAULT 0,
    monthly_volume_max int NOT NULL DEFAULT 0,

    price numeric(12,2) NOT NULL CHECK (price >= 0),
    stock int NOT NULL DEFAULT 1 CHECK (stock >= 0),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_printer_listings_supplier ON printer_listings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_printer_listings_usage ON printer_listings(usage_type);
CREATE INDEX IF NOT EXISTS idx_printer_listings_category ON printer_listings(category);
CREATE INDEX IF NOT EXISTS idx_printer_listings_condition ON printer_listings(condition);

ALTER TABLE printer_listings ENABLE ROW LEVEL SECURITY;

-- Public read (anyone can browse)
DROP POLICY IF EXISTS "Public can read printer listings" ON printer_listings;
CREATE POLICY "Public can read printer listings"
    ON printer_listings FOR SELECT
    USING (true);

-- Service role and supplier-owner can write (handled via backend with service role; RLS off-path)

-- ============================================================
-- 2) mps_inquiries
-- ============================================================
CREATE TABLE IF NOT EXISTS mps_inquiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    description text,
    estimated_printers text,
    selections jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mps_inquiries ENABLE ROW LEVEL SECURITY;
-- Only service role writes/reads — no public policy intentionally.

-- ============================================================
-- 3) public bucket for printer images (mirrors product-images)
-- ============================================================
-- Run in dashboard or via Supabase Storage UI:
--   CREATE bucket "printer-images", public = true
