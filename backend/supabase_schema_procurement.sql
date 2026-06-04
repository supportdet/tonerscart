-- ============================================================================
-- TonersCart — Government & Corporate Procurement Module
-- PHASE 1 migration: procurement_users (self-contained JWT auth + approval)
-- Apply in the Supabase SQL editor. The backend degrades gracefully (returns
-- 503 "module not migrated") until this is applied.
-- ============================================================================

create table if not exists public.procurement_users (
    id              uuid primary key default gen_random_uuid(),
    type            text not null check (type in ('govt', 'corporate')),
    name            text not null,
    designation     text,
    org_name        text not null,          -- department (govt) OR company (corporate)
    ministry_state  text,                   -- govt only
    employee_id     text,                   -- govt only
    email           text not null unique,
    password_hash   text not null,
    phone           text,
    address         text,
    gst_number      text,                   -- corporate only (mandatory there)
    status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    rejection_reason text,
    credit_limit    numeric not null default 0,
    credit_used     numeric not null default 0,
    -- Placeholders to be filled post-incorporation (admin "Add post-incorporation")
    pan_number      text,
    company_cin     text,
    approved_at     timestamptz,
    reviewed_by     uuid,
    created_at      timestamptz not null default now()
);

create index if not exists procurement_users_status_idx on public.procurement_users (status);
create index if not exists procurement_users_type_idx on public.procurement_users (type);
create index if not exists procurement_users_email_idx on public.procurement_users (lower(email));

-- Writes happen via the service-role key, so RLS can stay on with no public policy.
alter table public.procurement_users enable row level security;
