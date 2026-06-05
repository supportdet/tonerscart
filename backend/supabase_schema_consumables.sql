-- ============================================================================
-- TonersCart — Wave 19: Consumables product line + buyer segmentation
--                       + direct-order support (papers + consumables)
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================================

-- 1. Consumables catalogue ---------------------------------------------------
create table if not exists public.consumable_listings (
    id                        uuid primary key default gen_random_uuid(),
    supplier_id               uuid not null references public.suppliers(id) on delete cascade,
    subcategory               text not null,   -- Ink Cartridges | Drums | Fusers | Maintenance Kits | Staple Cartridges | Transfer Belts | Other
    subcategory_other         text,            -- free text when subcategory = 'Other'
    brand                     text not null,
    model_number              text not null,
    compatible_models         text,
    condition                 text default 'New',   -- New | Refurbished | Compatible
    price                     numeric(10,2) not null,
    gst_rate                  integer default 18,
    stock                     integer not null default 0,
    description               text,
    city                      text,
    image_url                 text,
    image_urls                jsonb default '[]'::jsonb,
    intercity_delivery_charge numeric(10,2) default 0,
    search_norm               text,
    d2d_enabled               boolean default false,
    d2d_price                 numeric(10,2),
    created_at                timestamptz not null default now()
);
create index if not exists consumable_listings_supplier_idx on public.consumable_listings (supplier_id);
create index if not exists consumable_listings_subcat_idx   on public.consumable_listings (subcategory);
create index if not exists consumable_listings_brand_idx    on public.consumable_listings (brand);
create index if not exists consumable_listings_search_idx   on public.consumable_listings (search_norm);

-- 2. Orders: allow direct (paper / consumable) orders ------------------------
--    listing_id was NOT NULL + FK to listings. Direct orders reference their
--    own table instead, so make listing_id nullable and add denormalised
--    product columns for dashboard rendering.
alter table public.orders alter column listing_id drop not null;
alter table public.orders add column if not exists consumable_listing_id uuid;
alter table public.orders add column if not exists paper_listing_id       uuid;
alter table public.orders add column if not exists product_brand          text;
alter table public.orders add column if not exists product_model          text;
alter table public.orders add column if not exists product_image          text;

-- 3. Buyer segmentation ------------------------------------------------------
--    personal | corporate | referred_to_procurement | dealer
alter table public.users add column if not exists user_type text;

-- RLS (service role bypasses; keep parity with other tables)
alter table public.consumable_listings enable row level security;
