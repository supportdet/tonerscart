-- =====================================================================
-- TonersCart — Quotations + Featured Suppliers + Featured Applications
-- (run once in Supabase Dashboard → SQL Editor)
-- =====================================================================

-- ---------- 1) spec_pdf_url on listings + printer_listings ------------
alter table public.listings
    add column if not exists spec_pdf_url text;

alter table public.printer_listings
    add column if not exists spec_pdf_url text;


-- ---------- 2) is_featured flag on suppliers --------------------------
alter table public.suppliers
    add column if not exists is_featured boolean not null default false;

create index if not exists suppliers_is_featured_idx
    on public.suppliers (is_featured);


-- ---------- 3) Featured-supplier application tracking table -----------
create table if not exists public.featured_applications (
    id uuid primary key default gen_random_uuid(),
    company text not null,
    contact_person text not null,
    phone text not null,
    email text not null,
    city text,
    pincode text,
    business_type text,
    description text,
    status text not null default 'new'
        check (status in ('new','contacted','active','rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists featured_applications_status_idx
    on public.featured_applications (status);
create index if not exists featured_applications_created_idx
    on public.featured_applications (created_at desc);

alter table public.featured_applications enable row level security;
-- Service-role only (admin reads/writes via backend) — no public policy.


-- ---------- 4) Quotations log (audit trail) ---------------------------
create table if not exists public.quotations (
    id uuid primary key default gen_random_uuid(),
    quote_number text not null unique,
    buyer_id uuid references auth.users(id) on delete set null,
    buyer_email text,
    buyer_name text,
    buyer_phone text,
    buyer_gst text,
    listing_id uuid,
    listing_type text not null check (listing_type in ('toner','printer')),
    brand text,
    model_number text,
    color text,
    unit_price numeric(12,2) not null,
    qty int not null default 1,
    total numeric(14,2) not null,
    supplier_id uuid,
    created_at timestamptz not null default now()
);
create index if not exists quotations_buyer_idx on public.quotations (buyer_id);
create index if not exists quotations_created_idx on public.quotations (created_at desc);

alter table public.quotations enable row level security;
-- Service-role only.


-- ---------- 5) Brochure storage notes ---------------------------------
-- Brochure PDFs are stored under the existing `supplier-documents`
-- bucket (private). Backend signs short-lived URLs on demand. No
-- additional bucket required.
