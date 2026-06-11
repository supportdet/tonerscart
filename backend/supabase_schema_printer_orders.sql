-- Wave 22 — wire printers into the direct-order flow.
-- Printers live in `printer_listings` (outside the toner `listings` table), so
-- orders for them store a `printer_listing_id` + denormalised product_* columns,
-- exactly like papers/consumables/scanners.
--
-- Safe to re-run. The backend also gracefully drops this column on insert if the
-- migration hasn't been applied yet, but applying it preserves the reference.

alter table public.orders add column if not exists printer_listing_id uuid;
create index if not exists orders_printer_listing_idx on public.orders (printer_listing_id);
