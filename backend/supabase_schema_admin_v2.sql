-- =====================================================================
-- TonersCart — Dealer suspension + Order tracking + Site config
-- (run once in Supabase Dashboard → SQL Editor)
-- =====================================================================

-- Dealer suspension flag
alter table public.suppliers
    add column if not exists is_suspended boolean not null default false;
create index if not exists suppliers_is_suspended_idx
    on public.suppliers (is_suspended);

-- Order tracking
alter table public.orders
    add column if not exists tracking_number text;

-- Generic, admin-controlled site config (popular_chips, marquee_brands, …)
create table if not exists public.site_config (
    key text primary key,
    value jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);
