-- TonersCart v3 migration — Order numbering, page views, dealer-suspension email column, listing/printer/paper spec fields
-- Idempotent: every statement uses IF NOT EXISTS / IF EXISTS guards.
-- Run from Supabase SQL editor.

-- 1. orders.order_number (TC-YYYY-NNNNN) -----------------------------------
ALTER TABLE IF EXISTS orders        ADD COLUMN IF NOT EXISTS order_number TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- 2. Anonymous page_views ---------------------------------------------------
CREATE TABLE IF NOT EXISTS page_views (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page         TEXT NOT NULL,
    timezone     TEXT,
    device_type  TEXT DEFAULT 'desktop',
    referrer     TEXT DEFAULT 'Direct',
    ip_hash      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_page       ON page_views(page);
-- Service role only — analytics are admin-private.
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- 3. Listings — structured specs (replacing PDF brochure) -------------------
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS page_yield         INT;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS compatible_models  TEXT;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS oem_part_number    TEXT;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS cartridge_weight   INT;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS pack_size          INT DEFAULT 1;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS warranty           TEXT;

-- 4. Printer listings — structured specs ------------------------------------
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS print_speed_ppm   INT;
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS duty_cycle        INT;
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS display_type      TEXT;
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS dimensions        TEXT;
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS weight_kg         NUMERIC(6, 2);
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS printer_warranty  TEXT;

-- 5. Paper listings — structured specs --------------------------------------
ALTER TABLE IF EXISTS paper_listings ADD COLUMN IF NOT EXISTS brightness       INT;
ALTER TABLE IF EXISTS paper_listings ADD COLUMN IF NOT EXISTS thickness_microns INT;
ALTER TABLE IF EXISTS paper_listings ADD COLUMN IF NOT EXISTS acid_free        BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS paper_listings ADD COLUMN IF NOT EXISTS suitable_for     TEXT[];

-- 6. Suppliers — small auxiliary fields used by suspend / featured ----------
ALTER TABLE IF EXISTS suppliers       ADD COLUMN IF NOT EXISTS is_featured   BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS suppliers       ADD COLUMN IF NOT EXISTS is_suspended  BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS suppliers       ADD COLUMN IF NOT EXISTS business_logo TEXT;
CREATE INDEX IF NOT EXISTS idx_suppliers_is_featured  ON suppliers(is_featured);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_suspended ON suppliers(is_suspended);

-- 7. Admin 2FA TOTP secret (optional) ---------------------------------------
ALTER TABLE IF EXISTS users     ADD COLUMN IF NOT EXISTS totp_secret TEXT;

-- DONE -----------------------------------------------------------------------
