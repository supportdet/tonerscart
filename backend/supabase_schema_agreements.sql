-- ============================================================================
-- TonersCart — User Agreement acceptance tracking
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================================
create table if not exists public.user_agreements (
    id             uuid primary key default gen_random_uuid(),
    user_id        text not null,                 -- Supabase auth uid OR procurement_users.id
    agreement_type text not null check (agreement_type in ('seller', 'oem', 'procurement', 'customer')),
    version        text not null,
    accepted_at    timestamptz not null default now(),
    ip_address     text
);
create unique index if not exists user_agreements_uniq on public.user_agreements (user_id, agreement_type);
create index if not exists user_agreements_user_idx on public.user_agreements (user_id);

alter table public.user_agreements enable row level security;
