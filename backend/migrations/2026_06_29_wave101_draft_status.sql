-- Wave 101 — Extend suppliers_pending.status CHECK constraint to include 'draft'.
--
-- Background: from Wave 101 onwards, dealers save their business details
-- as `status='draft'` while still filling out KYC docs/bank details inside
-- the dashboard. They flip it to `status='pending'` (the admin-queue state)
-- only when they click "Submit for verification" at the end of Step 3.
--
-- Existing CHECK only allowed pending/approved/rejected, so /auth/apply-seller
-- 500s with `violates check constraint suppliers_pending_status_check`.
--
-- Run this once in Supabase SQL Editor.

DO $$
BEGIN
    -- Drop any older variant first (idempotent).
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'suppliers_pending_status_check'
          AND conrelid = 'public.suppliers_pending'::regclass
    ) THEN
        ALTER TABLE public.suppliers_pending
            DROP CONSTRAINT suppliers_pending_status_check;
    END IF;

    ALTER TABLE public.suppliers_pending
        ADD CONSTRAINT suppliers_pending_status_check
        CHECK (status IN ('draft', 'pending', 'approved', 'rejected'));
END$$;

-- Reset the default to 'pending' (legacy behaviour preserved — apply-seller
-- explicitly sets the value either way).
ALTER TABLE public.suppliers_pending ALTER COLUMN status SET DEFAULT 'pending';
