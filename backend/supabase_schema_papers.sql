-- =====================================================================
-- TonersCart — Papers product line + Admin 2FA opt-in column
-- (run once in Supabase Dashboard → SQL Editor)
-- =====================================================================

create table if not exists public.paper_listings (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    brand text not null,
    size text not null,                 -- A4 | A3 | A5 | Letter
    gsm integer not null,               -- 70..120
    reams_per_box integer not null default 10,
    price_per_ream numeric(10,2) not null,
    stock integer not null default 0,
    city text,
    image_url text,
    created_at timestamptz not null default now()
);
create index if not exists paper_listings_brand_size_idx
    on public.paper_listings (brand, size);
create index if not exists paper_listings_supplier_idx
    on public.paper_listings (supplier_id);

alter table public.orders
    add column if not exists paper_listing_id uuid;

alter table public.users
    add column if not exists totp_secret text;
