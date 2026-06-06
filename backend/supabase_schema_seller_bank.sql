-- =============================================================================
-- Seller payout bank details + ID proof
-- Adds bank account columns (used to remit seller payouts) and an ID-proof
-- document path to both the pending applications table and the live suppliers
-- table. Safe to run multiple times (IF NOT EXISTS).
--
-- The backend is migration-safe (it strips these columns automatically until
-- this runs), so seller onboarding keeps working — but run this so the data is
-- actually persisted.
-- =============================================================================

alter table public.suppliers_pending
  add column if not exists account_holder_name text,
  add column if not exists account_number      text,
  add column if not exists ifsc_code            text,
  add column if not exists bank_name            text,
  add column if not exists bank_branch          text,
  add column if not exists doc_id_proof         text;

alter table public.suppliers
  add column if not exists account_holder_name text,
  add column if not exists account_number      text,
  add column if not exists ifsc_code            text,
  add column if not exists bank_name            text,
  add column if not exists bank_branch          text,
  add column if not exists doc_id_proof         text;
