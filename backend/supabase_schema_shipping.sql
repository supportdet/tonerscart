-- TonersCart v5 — Shipping + structured address (idempotent)
ALTER TABLE IF EXISTS listings         ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2) DEFAULT 0;
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2) DEFAULT 0;
ALTER TABLE IF EXISTS paper_listings   ADD COLUMN IF NOT EXISTS intercity_delivery_charge NUMERIC(10,2) DEFAULT 0;

-- Structured address columns on orders
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS area           TEXT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS order_city     TEXT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS order_state    TEXT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS pincode        TEXT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(10,2) DEFAULT 0;

-- Toner new structured fields
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS print_technology TEXT;

-- Printer new spec fields
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS max_resolution TEXT;
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS mobile_printing TEXT[] DEFAULT '{}';
ALTER TABLE IF EXISTS printer_listings ADD COLUMN IF NOT EXISTS monthly_volume_recommended INT;
