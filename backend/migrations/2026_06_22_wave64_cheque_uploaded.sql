-- Wave 64 — track whether a dealer has uploaded their cancelled cheque.
-- The seller application form makes this document optional (dealers can
-- submit it later, before their first payout). We surface a "Cheque pending"
-- badge in the admin dealer list driven by this flag.
--
-- Backend code (routes/admin.py) is RESILIENT to this column not existing
-- yet: it falls back to `doc_bank_proof IS NOT NULL` until the migration is
-- applied. Run this once in the Supabase SQL editor to flip behaviour to
-- the explicit-flag mode.

ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS cheque_uploaded BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any existing supplier whose cancelled-cheque path is non-null
-- is treated as already-uploaded.
UPDATE public.suppliers
SET cheque_uploaded = TRUE
WHERE doc_bank_proof IS NOT NULL
  AND doc_bank_proof <> '';
