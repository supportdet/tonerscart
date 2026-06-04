-- Wave 15 — Listing view analytics (location-based insights for dealers)
-- Records anonymous product-detail views with the viewer's selected city so
-- suppliers can see how many buyers viewed their listings and from where.
--
-- Apply this in the Supabase SQL editor. Until applied, the backend degrades
-- gracefully: view pings no-op and the dealer Insights tab shows an empty state.

create table if not exists public.listing_views (
    id           uuid primary key default gen_random_uuid(),
    listing_id   uuid not null,
    listing_kind text not null default 'toner',   -- toner | printer | paper
    viewer_city  text,
    viewer_id    uuid,                              -- nullable (guests)
    created_at   timestamptz not null default now()
);

create index if not exists listing_views_listing_idx on public.listing_views (listing_id);
create index if not exists listing_views_kind_idx on public.listing_views (listing_kind);
create index if not exists listing_views_created_idx on public.listing_views (created_at desc);

-- RLS: writes happen via the backend service-role key, so RLS can stay enabled
-- with no public policies (service role bypasses RLS).
alter table public.listing_views enable row level security;
