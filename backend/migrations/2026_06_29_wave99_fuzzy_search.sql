-- Wave 99 — Fuzzy / normalised search infrastructure.
--
-- 1) Add `search_norm` to printer_listings and paper_listings (the two product
--    tables that don't have it yet) so the universal search endpoint can do
--    space / hyphen / case-insensitive matches via a single ILIKE column.
-- 2) Backfill existing rows.
-- 3) Add INSERT/UPDATE triggers so future rows keep search_norm in sync.
-- 4) Enable pg_trgm + create GIN indexes on every search_norm column so
--    similarity()-based typo-tolerant fuzzy search is fast.

-- ── 1. pg_trgm extension ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. printer_listings.search_norm ──────────────────────────────────────
ALTER TABLE printer_listings ADD COLUMN IF NOT EXISTS search_norm text;
UPDATE printer_listings
   SET search_norm = lower(regexp_replace(
         coalesce(brand,'') || coalesce(model_number,'') || coalesce(description,''),
         '[^a-z0-9]', '', 'gi'))
 WHERE search_norm IS NULL;

CREATE OR REPLACE FUNCTION sync_printer_search_norm() RETURNS trigger AS $$
BEGIN
  NEW.search_norm := lower(regexp_replace(
    coalesce(NEW.brand,'') || coalesce(NEW.model_number,'') || coalesce(NEW.description,''),
    '[^a-z0-9]', '', 'gi'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_printer_search_norm ON printer_listings;
CREATE TRIGGER trg_printer_search_norm
  BEFORE INSERT OR UPDATE OF brand, model_number, description ON printer_listings
  FOR EACH ROW EXECUTE FUNCTION sync_printer_search_norm();

CREATE INDEX IF NOT EXISTS printer_listings_search_norm_trgm_idx
  ON printer_listings USING gin (search_norm gin_trgm_ops);

-- ── 3. paper_listings.search_norm ────────────────────────────────────────
ALTER TABLE paper_listings ADD COLUMN IF NOT EXISTS search_norm text;
UPDATE paper_listings
   SET search_norm = lower(regexp_replace(
         coalesce(brand,'') || coalesce(size,'') || coalesce(cast(gsm as text),''),
         '[^a-z0-9]', '', 'gi'))
 WHERE search_norm IS NULL;

CREATE OR REPLACE FUNCTION sync_paper_search_norm() RETURNS trigger AS $$
BEGIN
  NEW.search_norm := lower(regexp_replace(
    coalesce(NEW.brand,'') || coalesce(NEW.size,'') || coalesce(cast(NEW.gsm as text),''),
    '[^a-z0-9]', '', 'gi'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_paper_search_norm ON paper_listings;
CREATE TRIGGER trg_paper_search_norm
  BEFORE INSERT OR UPDATE OF brand, size, gsm ON paper_listings
  FOR EACH ROW EXECUTE FUNCTION sync_paper_search_norm();

CREATE INDEX IF NOT EXISTS paper_listings_search_norm_trgm_idx
  ON paper_listings USING gin (search_norm gin_trgm_ops);

-- ── 4. trgm indexes on the 3 tables that already have search_norm ─────────
CREATE INDEX IF NOT EXISTS listings_search_norm_trgm_idx
  ON listings USING gin (search_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS consumable_listings_search_norm_trgm_idx
  ON consumable_listings USING gin (search_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS scanner_listings_search_norm_trgm_idx
  ON scanner_listings USING gin (search_norm gin_trgm_ops);

-- ── 5. RPC: tonerscart_fuzzy_search ──────────────────────────────────────
-- Returns matching ids+similarity from a given table by similarity() >= 0.2.
-- The backend calls this once per table when ILIKE has < N hits, so typos
-- like "Lasejet" → "LaserJet" or "Epsen" → "Epson" still resolve.
CREATE OR REPLACE FUNCTION tonerscart_fuzzy_search(
  tbl text,
  needle text,
  threshold real DEFAULT 0.2,
  max_rows int DEFAULT 30
) RETURNS TABLE (id uuid, score real) AS $$
BEGIN
  IF tbl NOT IN ('listings','printer_listings','paper_listings','consumable_listings','scanner_listings') THEN
    RAISE EXCEPTION 'Unsupported table: %', tbl USING ERRCODE = '22023';
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT id, similarity(search_norm, $1)::real AS score
       FROM %I
      WHERE search_norm %% $1
        AND similarity(search_norm, $1) >= $2
        AND stock > 0
      ORDER BY similarity(search_norm, $1) DESC
      LIMIT $3', tbl)
  USING needle, threshold, max_rows;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION tonerscart_fuzzy_search(text, text, real, int) TO anon, authenticated, service_role;
