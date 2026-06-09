-- ============================================================================
-- TonersCart — "Notify me when available" email capture (compatible SEO pages)
-- Run this once in the Supabase SQL editor.
-- Until applied, POST /api/compat/notify still returns 200 but won't persist.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notify_requests (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    printer_slug  text NOT NULL,
    printer_name  text,
    email         text NOT NULL,
    created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notify_requests_slug ON public.notify_requests (printer_slug);
CREATE INDEX IF NOT EXISTS idx_notify_requests_created ON public.notify_requests (created_at DESC);
