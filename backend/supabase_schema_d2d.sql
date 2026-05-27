-- D2D (Dealer-to-Dealer) marketplace columns — extended in Wave 12 to cover
-- printer_listings and paper_listings as well. Safe to re-run.

ALTER TABLE listings           ADD COLUMN IF NOT EXISTS d2d_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE listings           ADD COLUMN IF NOT EXISTS d2d_price   numeric(10,2);
ALTER TABLE printer_listings   ADD COLUMN IF NOT EXISTS d2d_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE printer_listings   ADD COLUMN IF NOT EXISTS d2d_price   numeric(10,2);
ALTER TABLE paper_listings     ADD COLUMN IF NOT EXISTS d2d_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE paper_listings     ADD COLUMN IF NOT EXISTS d2d_price   numeric(10,2);

CREATE INDEX IF NOT EXISTS listings_d2d_enabled_idx         ON listings(d2d_enabled)         WHERE d2d_enabled = true;
CREATE INDEX IF NOT EXISTS printer_listings_d2d_enabled_idx ON printer_listings(d2d_enabled) WHERE d2d_enabled = true;
CREATE INDEX IF NOT EXISTS paper_listings_d2d_enabled_idx   ON paper_listings(d2d_enabled)   WHERE d2d_enabled = true;
