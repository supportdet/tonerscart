-- ============================================================================
-- TonersCart — Procurement Module · PHASE 2 migration
-- procurement_quotations (formal L1/L2/L3 quotations, 7-day validity)
-- Apply in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.procurement_quotations (
    id            uuid primary key default gen_random_uuid(),
    ref_number    text not null unique,
    user_id       uuid not null,
    product_label text,
    qty           integer not null default 1,
    items         jsonb not null default '[]'::jsonb,   -- ranked supplier rows (L1, L2, L3 …)
    status        text not null default 'active' check (status in ('active', 'expired', 'converted')),
    converted_order_id uuid,
    created_at    timestamptz not null default now(),
    expires_at    timestamptz not null
);

create index if not exists proc_quotations_user_idx on public.procurement_quotations (user_id, created_at desc);
create index if not exists proc_quotations_status_idx on public.procurement_quotations (status);

alter table public.procurement_quotations enable row level security;
