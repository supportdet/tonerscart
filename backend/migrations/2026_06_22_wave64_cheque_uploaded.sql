-- Wave 64 (revised) — admin-side dealer document management.
--
-- Why the original migration failed: `public.suppliers` historically carried
-- ONLY the `doc_id_proof` column. Every other KYC document (GST, PAN, cancelled
-- cheque, address proof, brand authorization, shop photo) stayed on
-- `public.suppliers_pending`, even after approval. The admin "upload doc on
-- dealer's behalf" feature writes the new path back to `suppliers.{field}`, so
-- those columns now need to exist on `suppliers` too.
--
-- This migration is idempotent — safe to re-run.

-- 1) Add the missing KYC document columns on `suppliers`.
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS doc_gst                 TEXT,
    ADD COLUMN IF NOT EXISTS doc_pan                 TEXT,
    ADD COLUMN IF NOT EXISTS doc_bank_proof          TEXT,
    ADD COLUMN IF NOT EXISTS doc_address_proof       TEXT,
    ADD COLUMN IF NOT EXISTS doc_brand_authorization TEXT,
    ADD COLUMN IF NOT EXISTS doc_shop_photo          TEXT;

-- 2) Explicit "has the dealer uploaded a cancelled cheque yet?" flag.
--    Drives the "Cheque pending" badge on the admin dealer list and unblocks
--    first-payout eligibility checks downstream.
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS cheque_uploaded BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) Backfill the new document columns from the original application row.
--    `suppliers_pending` is keyed by the same `user_id`, so we join on that.
UPDATE public.suppliers s
SET doc_gst                 = COALESCE(s.doc_gst,                 sp.doc_gst),
    doc_pan                 = COALESCE(s.doc_pan,                 sp.doc_pan),
    doc_bank_proof          = COALESCE(s.doc_bank_proof,          sp.doc_bank_proof),
    doc_address_proof       = COALESCE(s.doc_address_proof,       sp.doc_address_proof),
    doc_brand_authorization = COALESCE(s.doc_brand_authorization, sp.doc_brand_authorization),
    doc_shop_photo          = COALESCE(s.doc_shop_photo,          sp.doc_shop_photo)
FROM public.suppliers_pending sp
WHERE sp.user_id = s.user_id;

-- 4) Backfill `cheque_uploaded` — any dealer whose cancelled-cheque path is
--    non-empty (on suppliers, or on suppliers_pending) is treated as already
--    uploaded.
UPDATE public.suppliers s
SET cheque_uploaded = TRUE
WHERE COALESCE(s.doc_bank_proof, '') <> ''
   OR EXISTS (
        SELECT 1
        FROM public.suppliers_pending sp
        WHERE sp.user_id = s.user_id
          AND COALESCE(sp.doc_bank_proof, '') <> ''
   );
