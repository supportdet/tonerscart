-- =============================================================
-- TonersCart — Business Logo column (2026-05-22)
--
-- Adds an optional `business_logo` storage path to both the
-- pending-applications table and the approved suppliers table.
-- The path points to an object inside the existing private
-- `supplier-documents` Supabase Storage bucket. The backend
-- service role is responsible for uploads and signed-URL reads.
-- Run from the Supabase SQL editor.
-- =============================================================

alter table public.suppliers_pending
    add column if not exists business_logo text;

alter table public.suppliers
    add column if not exists business_logo text;
