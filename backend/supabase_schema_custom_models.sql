-- Custom printer / toner models submitted by dealers when their model isn't
-- in the central compatibility DB. Surfaced as "Added by dealer" suggestions
-- in upload dropdowns and listed in the Admin Messages tab for review.
--
-- Run from Supabase SQL editor. Idempotent (safe to re-run).

create table if not exists custom_printer_models (
    id uuid primary key default gen_random_uuid(),
    brand text not null,
    model text not null,
    type text default '',
    full_name text not null,
    created_by uuid references users(id) on delete set null,
    created_at timestamptz default now(),
    status text default 'pending' check (status in ('pending','approved','rejected'))
);

create unique index if not exists custom_printer_models_brand_model_uq
    on custom_printer_models (lower(brand), lower(model));

create index if not exists custom_printer_models_search_idx
    on custom_printer_models (lower(model));

create table if not exists custom_toner_models (
    id uuid primary key default gen_random_uuid(),
    brand text not null,
    model text not null,
    type text default 'toner',
    created_by uuid references users(id) on delete set null,
    created_at timestamptz default now(),
    status text default 'pending' check (status in ('pending','approved','rejected'))
);

create unique index if not exists custom_toner_models_brand_model_uq
    on custom_toner_models (lower(brand), lower(model));

create index if not exists custom_toner_models_search_idx
    on custom_toner_models (lower(model));

-- RLS: only service role writes/reads. Frontend uses backend endpoints.
alter table custom_printer_models enable row level security;
alter table custom_toner_models enable row level security;
