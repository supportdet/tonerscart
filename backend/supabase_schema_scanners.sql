-- ============================================================================
-- TonersCart — Wave 21: Scanners product line + direct-order support
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================================

-- 1. Scanners catalogue ------------------------------------------------------
create table if not exists public.scanner_listings (
    id                        uuid primary key default gen_random_uuid(),
    supplier_id               uuid not null references public.suppliers(id) on delete cascade,
    brand                     text not null,
    model_number              text not null,
    scanner_type              text not null default 'Flatbed',  -- Flatbed | ADF | Sheet-fed | Drum | Photo | All-in-one
    condition                 text default 'New',                -- New | Refurbished
    scan_resolution           text,                              -- 600dpi | 1200dpi | 2400dpi | 4800dpi | 9600dpi
    connectivity              jsonb default '[]'::jsonb,         -- ["USB","WiFi","Ethernet","Bluetooth"]
    scan_speed_ppm            numeric(10,2),                     -- pages per minute
    color_mode                text,                              -- Color | Mono
    warranty                  text default 'No warranty',        -- No warranty | 6 months | 1 year | 2 years | 3 years
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
create index if not exists scanner_listings_supplier_idx on public.scanner_listings (supplier_id);
create index if not exists scanner_listings_type_idx     on public.scanner_listings (scanner_type);
create index if not exists scanner_listings_brand_idx    on public.scanner_listings (brand);
create index if not exists scanner_listings_search_idx   on public.scanner_listings (search_norm);

-- 2. Orders: allow direct scanner orders -------------------------------------
alter table public.orders add column if not exists scanner_listing_id uuid;

-- RLS (service role bypasses; keep parity with other tables)
alter table public.scanner_listings enable row level security;
