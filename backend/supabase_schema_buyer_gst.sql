-- =============================================================
-- TonersCart — Buyer GST column (2026-05-23)
-- Optional 15-character GSTIN stored on the user's profile so we
-- can render a B2B-compliant invoice header on every order.
-- =============================================================
alter table public.users
    add column if not exists gst_number text;
