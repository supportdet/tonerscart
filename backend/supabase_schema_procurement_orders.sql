-- ============================================================================
-- TonersCart — Procurement Module · PHASE 3 migration
-- procurement_orders + credit_ledger (order flow, credit, invoices, reminders)
-- Apply in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.procurement_orders (
    id                uuid primary key default gen_random_uuid(),
    ref_number        text not null unique,
    quotation_id      uuid,
    user_id           uuid not null,
    supplier_id       uuid,
    supplier_name     text,
    rank              text,                    -- L1 / L2 / L3 chosen
    items             jsonb not null default '[]'::jsonb,
    qty               integer not null default 1,
    total_amount      numeric not null default 0,   -- inc GST
    user_type         text,                    -- govt | corporate (snapshot)
    status            text not null default 'confirmed',
    status_history    jsonb not null default '[]'::jsonb,
    po_document_url   text,                    -- govt PO upload
    delivered_at      timestamptz,
    payment_due_date  timestamptz,
    payment_status    text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
    paid_at           timestamptz,
    -- reminder de-dupe (which reminder stages already sent)
    reminders_sent    jsonb not null default '[]'::jsonb,
    created_at        timestamptz not null default now()
);

create index if not exists proc_orders_user_idx on public.procurement_orders (user_id, created_at desc);
create index if not exists proc_orders_status_idx on public.procurement_orders (status);
create index if not exists proc_orders_pay_idx on public.procurement_orders (payment_status, payment_due_date);

create table if not exists public.credit_ledger (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null,
    order_id    uuid,
    amount      numeric not null,
    type        text not null check (type in ('debit', 'credit')),
    due_date    timestamptz,
    paid_at     timestamptz,
    note        text,
    created_at  timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

alter table public.procurement_orders enable row level security;
alter table public.credit_ledger enable row level security;
