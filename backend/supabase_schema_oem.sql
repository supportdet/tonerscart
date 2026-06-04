-- ============================================================================
-- TonersCart — OEM (manufacturer) showcase module
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================================

-- 1. Allow the 'oem' role on the existing users table
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
    check (role in ('admin', 'customer', 'supplier', 'oem'));

-- 2. OEM partner applications / accounts
create table if not exists public.oem_partners (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid,                    -- linked Supabase auth user (set on approval)
    company          text not null,
    brand            text not null,
    contact_name     text not null,
    email            text not null,
    phone            text,
    products_note    text,
    logo_url         text,
    status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    rejection_reason text,
    approved_at      timestamptz,
    created_at       timestamptz not null default now()
);
create index if not exists oem_partners_status_idx on public.oem_partners (status);
create index if not exists oem_partners_user_idx   on public.oem_partners (user_id);

-- 3. OEM showcase products (showcase + enquiry only — no checkout)
create table if not exists public.oem_products (
    id            uuid primary key default gen_random_uuid(),
    oem_id        uuid not null,             -- -> oem_partners.id
    brand         text,                      -- official brand snapshot
    name          text not null,
    category      text not null default 'toner' check (category in ('toner', 'printer', 'paper', 'other')),
    model_number  text,
    description   text,
    image_url     text,
    moq           text,                      -- minimum order quantity (free text)
    price_note    text,                      -- optional indicative price
    is_active     boolean not null default true,
    created_at    timestamptz not null default now()
);
create index if not exists oem_products_oem_idx    on public.oem_products (oem_id);
create index if not exists oem_products_active_idx on public.oem_products (is_active);

alter table public.oem_partners enable row level security;
alter table public.oem_products enable row level security;
