-- =====================================================================
-- TonersCart — Supabase schema (run once in Supabase SQL editor)
-- =====================================================================

-- ----------- Tables ------------------------------------------------------

-- Public profile for every authenticated user (mirrors auth.users.id)
create table if not exists public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    name text not null,
    role text not null check (role in ('admin','customer','supplier')),
    phone text,
    company text,
    city text,
    created_at timestamptz default now()
);

-- Toner catalog (read-only for clients, written via service role)
create table if not exists public.toner_master (
    id uuid primary key default gen_random_uuid(),
    brand text not null,
    model_number text not null,
    model_normalized text not null,
    search_norm text not null,
    printer_compatibility text,
    color text default 'Black',
    page_yield int,
    created_at timestamptz default now(),
    unique (brand, model_number)
);
create index if not exists toner_master_search_idx on public.toner_master (search_norm);
create index if not exists toner_master_brand_idx on public.toner_master (brand);

-- Pending supplier applications (created at signup)
create table if not exists public.suppliers_pending (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade unique,
    business_name text not null,
    contact_person text not null,
    phone text not null,
    email text not null,
    city text not null,
    gst_number text,
    annual_turnover text,
    business_address text not null,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    rejection_reason text,
    submitted_at timestamptz default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references auth.users(id)
);
create index if not exists suppliers_pending_status_idx on public.suppliers_pending (status);

-- Approved suppliers (only approved ones live here)
create table if not exists public.suppliers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade unique,
    business_name text not null,
    contact_person text not null,
    phone text not null,
    email text not null,
    city text not null,
    gst_number text,
    annual_turnover text,
    business_address text not null,
    approved_at timestamptz default now(),
    approved_by uuid references auth.users(id)
);
create index if not exists suppliers_city_idx on public.suppliers (city);

-- Product listings posted by approved suppliers
create table if not exists public.listings (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    toner_id uuid not null references public.toner_master(id) on delete restrict,
    brand text not null,
    model_number text not null,
    search_norm text not null,
    color text default 'Black',
    toner_type text not null check (toner_type in ('Original','Compatible')),
    price numeric(10,2) not null check (price >= 0),
    stock int not null default 0 check (stock >= 0),
    image_url text,
    city text not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
create index if not exists listings_search_idx on public.listings (search_norm);
create index if not exists listings_brand_idx on public.listings (brand);
create index if not exists listings_city_idx on public.listings (city);
create index if not exists listings_supplier_idx on public.listings (supplier_id);

-- Buyer order requests (no payments, just request flow)
create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references auth.users(id) on delete cascade,
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    listing_id uuid not null references public.listings(id) on delete restrict,
    qty int not null default 1 check (qty > 0),
    unit_price numeric(10,2) not null,
    total numeric(10,2) not null,
    customer_name text not null,
    customer_phone text not null,
    delivery_address text not null,
    notes text,
    status text not null default 'requested' check (status in ('requested','accepted','shipped','delivered','rejected','cancelled')),
    tracking_number text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_supplier_idx on public.orders (supplier_id);
create index if not exists orders_status_idx on public.orders (status);


-- ----------- Storage bucket -----------------------------------------------
-- Public-read, authenticated-write bucket for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Storage policies
drop policy if exists "Public read on product-images" on storage.objects;
create policy "Public read on product-images" on storage.objects
    for select using (bucket_id = 'product-images');

drop policy if exists "Authenticated upload to product-images" on storage.objects;
create policy "Authenticated upload to product-images" on storage.objects
    for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "Owner delete on product-images" on storage.objects;
create policy "Owner delete on product-images" on storage.objects
    for delete using (bucket_id = 'product-images' and auth.uid() = owner);


-- ----------- Row Level Security -------------------------------------------
alter table public.users              enable row level security;
alter table public.toner_master       enable row level security;
alter table public.suppliers_pending  enable row level security;
alter table public.suppliers          enable row level security;
alter table public.listings           enable row level security;
alter table public.orders             enable row level security;

-- users: each user reads/updates their own row; admins read all
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select using (auth.uid() = id);
drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users for update using (auth.uid() = id);

-- toner_master: anyone (incl. anon) can read
drop policy if exists tm_public_read on public.toner_master;
create policy tm_public_read on public.toner_master for select using (true);

-- suppliers_pending: applicant reads own row only (admin uses service role)
drop policy if exists sp_self_read on public.suppliers_pending;
create policy sp_self_read on public.suppliers_pending for select using (auth.uid() = user_id);

-- suppliers (approved): public read (so buyers see who supplies what)
drop policy if exists s_public_read on public.suppliers;
create policy s_public_read on public.suppliers for select using (true);

-- listings: public read; supplier can insert/update/delete own listings
drop policy if exists l_public_read on public.listings;
create policy l_public_read on public.listings for select using (true);

drop policy if exists l_supplier_write on public.listings;
create policy l_supplier_write on public.listings for insert
    with check (supplier_id in (select id from public.suppliers where user_id = auth.uid()));
drop policy if exists l_supplier_update on public.listings;
create policy l_supplier_update on public.listings for update
    using (supplier_id in (select id from public.suppliers where user_id = auth.uid()));
drop policy if exists l_supplier_delete on public.listings;
create policy l_supplier_delete on public.listings for delete
    using (supplier_id in (select id from public.suppliers where user_id = auth.uid()));

-- orders: customer reads own, supplier reads orders for their listings
drop policy if exists o_customer_read on public.orders;
create policy o_customer_read on public.orders for select using (auth.uid() = customer_id);
drop policy if exists o_supplier_read on public.orders;
create policy o_supplier_read on public.orders for select
    using (supplier_id in (select id from public.suppliers where user_id = auth.uid()));
drop policy if exists o_customer_create on public.orders;
create policy o_customer_create on public.orders for insert
    with check (auth.uid() = customer_id);
drop policy if exists o_supplier_update on public.orders;
create policy o_supplier_update on public.orders for update
    using (supplier_id in (select id from public.suppliers where user_id = auth.uid()));
