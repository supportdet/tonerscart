-- ============================================================================
-- TonersCart — Order tracking flow migration
-- Run this once in the Supabase SQL editor.
-- Adds the columns required for the order lifecycle:
--   Requested -> Confirmed(accepted) -> Dispatched(shipped) -> Delivered -> Completed
-- The backend degrades gracefully until this is applied, but the new tracking
-- fields (courier, timestamps, payout timer) only persist once these exist.
-- ============================================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS courier_name        text,
    ADD COLUMN IF NOT EXISTS delivered_at        timestamptz,
    ADD COLUMN IF NOT EXISTS completed_at        timestamptz,
    ADD COLUMN IF NOT EXISTS payout_eligible_at  timestamptz,
    ADD COLUMN IF NOT EXISTS auto_confirmed      boolean DEFAULT false;

-- Helps the 5-day auto-confirm background job scan delivered orders quickly.
CREATE INDEX IF NOT EXISTS idx_orders_status_delivered_at
    ON public.orders (status, delivered_at);
