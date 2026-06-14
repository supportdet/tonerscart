-- Wave 53 — add the three "spec coverage" columns to consumable_listings so
-- ink cartridges / drums / fusers can carry the same metadata toners get
-- (warranty terms, page yield, cartridge weight). All three are optional at
-- the DB layer; the FastAPI layer (`routes/products.create_consumable`)
-- enforces them as required.
--
-- Run from Supabase SQL editor. Idempotent (safe to re-run).

alter table consumable_listings
    add column if not exists warranty text,
    add column if not exists page_yield int,
    add column if not exists cartridge_weight int;

-- Light, non-unique indexes so future filter tabs ("page yield 5000+") stay fast.
create index if not exists consumable_listings_page_yield_idx
    on consumable_listings (page_yield);
