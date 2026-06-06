-- =============================================================================
-- Admin extras — activity log, order disputes, message read-state, dealer notes
-- Safe to run multiple times (IF NOT EXISTS). The backend degrades gracefully
-- until this is applied (no 500s), so the new admin tabs render empty states.
-- =============================================================================

-- 1) Admin activity log — every admin action recorded with a timestamp.
create table if not exists public.admin_activity_log (
    id          uuid primary key default gen_random_uuid(),
    admin_id    uuid,
    admin_email text,
    action      text not null,
    entity_type text,
    entity_id   text,
    details     jsonb default '{}'::jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists admin_activity_log_created_idx
    on public.admin_activity_log (created_at desc);

-- 2) Order dispute management — flag + status + notes on orders.
alter table public.orders
    add column if not exists is_flagged     boolean default false,
    add column if not exists dispute_status text,           -- open | investigating | resolved
    add column if not exists dispute_notes  text,
    add column if not exists flagged_at     timestamptz,
    add column if not exists flagged_by     uuid;
create index if not exists orders_is_flagged_idx
    on public.orders (is_flagged) where is_flagged = true;

-- 3) Contact messages read/unread state.
alter table public.mps_inquiries
    add column if not exists is_read boolean default false;

-- 4) Admin notes/flags on a dealer.
alter table public.suppliers
    add column if not exists admin_notes text;
