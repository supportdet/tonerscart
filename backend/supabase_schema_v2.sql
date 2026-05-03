-- =====================================================================
-- TonersCart — Schema additions for v2 supplier onboarding
-- Run once in Supabase SQL editor. Idempotent.
-- =====================================================================

-- 1) Allow Refilled toner type (originally only Original/Compatible)
alter table public.listings drop constraint if exists listings_toner_type_check;
alter table public.listings
    add constraint listings_toner_type_check
    check (toner_type in ('Original','Compatible','Refilled'));

-- 2) Add new supplier-onboarding fields to suppliers_pending
alter table public.suppliers_pending add column if not exists pan_number text;
alter table public.suppliers_pending add column if not exists state text;
alter table public.suppliers_pending add column if not exists pincode text;
alter table public.suppliers_pending add column if not exists cities_served text[] default '{}';
alter table public.suppliers_pending add column if not exists seller_types text[] default '{}';
alter table public.suppliers_pending add column if not exists compatible_brands text[] default '{}';
alter table public.suppliers_pending add column if not exists years_in_business int;
alter table public.suppliers_pending add column if not exists testing_before_delivery boolean default false;
alter table public.suppliers_pending add column if not exists doc_brand_authorization text;
alter table public.suppliers_pending add column if not exists doc_shop_photo text;
alter table public.suppliers_pending add column if not exists doc_gst text;
alter table public.suppliers_pending add column if not exists doc_pan text;
alter table public.suppliers_pending add column if not exists doc_bank_proof text;
alter table public.suppliers_pending add column if not exists doc_address_proof text;
alter table public.suppliers_pending add column if not exists ai_check jsonb;

-- 3) Mirror onto approved suppliers
alter table public.suppliers add column if not exists pan_number text;
alter table public.suppliers add column if not exists state text;
alter table public.suppliers add column if not exists pincode text;
alter table public.suppliers add column if not exists cities_served text[] default '{}';
alter table public.suppliers add column if not exists seller_types text[] default '{}';
alter table public.suppliers add column if not exists compatible_brands text[] default '{}';
alter table public.suppliers add column if not exists years_in_business int;
alter table public.suppliers add column if not exists testing_before_delivery boolean default false;

-- 4) PRIVATE bucket for supplier documents
insert into storage.buckets (id, name, public)
values ('supplier-documents', 'supplier-documents', false)
on conflict (id) do nothing;

-- Storage policies for supplier-documents (private)
drop policy if exists "Owner upload supplier-documents" on storage.objects;
create policy "Owner upload supplier-documents" on storage.objects
    for insert with check (
        bucket_id = 'supplier-documents'
        and auth.role() = 'authenticated'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Owner read supplier-documents" on storage.objects;
create policy "Owner read supplier-documents" on storage.objects
    for select using (
        bucket_id = 'supplier-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Owner delete supplier-documents" on storage.objects;
create policy "Owner delete supplier-documents" on storage.objects
    for delete using (
        bucket_id = 'supplier-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
