-- D2D (Dealer-to-Dealer) marketplace columns
-- Adds optional D2D pricing toggle to toner listings.
-- Safe to re-run; uses IF NOT EXISTS guards.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS d2d_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS d2d_price numeric(10,2);

CREATE INDEX IF NOT EXISTS listings_d2d_enabled_idx
  ON listings(d2d_enabled)
  WHERE d2d_enabled = true;
