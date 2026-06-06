-- =============================================================================
-- Human-readable dealer / seller IDs  (TC-DLR-YYYY-NNNN)
-- Adds a seller_id column to users (supplier accounts) and suppliers.
-- Auto-generated sequentially by the backend when a dealer is approved.
-- Safe to run multiple times.
--
-- After running this, call POST /api/admin/seller-ids/backfill (as admin) once
-- to assign IDs to dealers that were already approved.
-- =============================================================================

alter table public.users     add column if not exists seller_id text;
alter table public.suppliers add column if not exists seller_id text;

create unique index if not exists users_seller_id_key
  on public.users (seller_id) where seller_id is not null;
create unique index if not exists suppliers_seller_id_key
  on public.suppliers (seller_id) where seller_id is not null;
