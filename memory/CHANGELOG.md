### 2026-02-XX — Wave 3 finalisation (Papers UI, Admin Finance, Supplier Earnings, Reorder, Bulk stock, Duplicate, Load-more, Static SEO)

**Backend hardening:**
- `GET /api/listings/{id}` now gracefully falls back when `suppliers.is_suspended` column is missing (admin_v2 migration not yet run) — eliminates the 500 reported in iteration_8.
- `SellerApplication.agreed_to_terms` field added; `/api/auth/apply-seller` returns 400 if `agreed_to_terms != true` (server-side enforcement of dealer agreement).

**SEO statics:**
- New `/app/frontend/public/sitemap.xml` and `/app/frontend/public/robots.txt`. Served at preview & production root since the k8s ingress only routes `/api/*` to the backend; CRA falls through to `public/*` for unmatched paths.
- Landing page already emits Organization + WebSite JSON-LD via `<PageMeta jsonLd={ldOrg} />`.
- `loading="lazy"` confirmed on toner card + printers result images.

**Papers (buyer + dealer):**
- Buyer `/papers` page already shipped (Wave 2).
- New supplier tab "Papers" in `SupplierDashboard` with `<PaperListings />` (`/app/frontend/src/components/PaperListings.jsx`): list mine + Add SKU dialog (brand, size, GSM, reams/box, ₹/ream, stock) → `POST /api/supplier/papers`.
- "Add paper" CTA dispatches `tc-open-add-paper` event mirroring the printer flow.

**Admin Finance tab:**
- New `/app/frontend/src/pages/admin/FinanceTab.jsx` plugged into AdminDashboard `tab="finance"`. Renders monthly summary + dealer payouts from `/admin/finance/summary` and `/admin/finance/dealers`, with CSV download buttons.

**Supplier "My Earnings":**
- New `<SupplierEarnings />` (`/app/frontend/src/components/SupplierEarnings.jsx`) hits `GET /api/supplier/earnings`. Available as 4th tab in SupplierDashboard alongside Toners / Printers / Papers.

**Dealer dashboard productivity:**
- Inline stock editor on every toner card — click to edit, Enter to save (`PUT /api/supplier/listings/{id}` with `{stock}`).
- "Duplicate" button on each toner card → `POST /api/supplier/listings/{id}/duplicate`.

**Buyer one-click Reorder:**
- For `delivered` and `cancelled` orders in `/customer`, a "Reorder this product" CTA hits `GET /api/listings/{listing_id}`, adds the live product into the cart at the original qty, and routes to `/cart`. Graceful 404 / 410 toasts.

**Search "Load more":**
- `/search` now drives the paginated endpoint (`/listings/search/paginated`, limit=24). "Load more (page X/Y)" button at the bottom merges next page into the grid.

**Dealer agreement** (`SellerApplicationForm.jsx`):
- Sends `agreed_to_terms: <bool>` along with the apply-seller payload. Server returns 400 otherwise.

**Pending (still on the backlog):**
- Admin 2FA (TOTP) setup/verify UI (backend `pyotp` was installed previously but no admin enrolment flow yet).
- Twilio OTP phone login.
- Bulk CSV upload for dealer products.
- Refactor `server.py` (now 2716 lines) into `routes/`.

**Migrations still needed (user runs):**
- `supabase_schema_papers.sql` (paper_listings table)
- `supabase_schema_admin_v2.sql` (suppliers.is_suspended, orders.tracking_number, site_config)

### 2026-02-25 — Wave 4 batch (iteration_10: 18/18 v3 PASS, 21/21 wave3 regression PASS)

**Implemented:**
1. **Empty states everywhere** — Supplier dashboard orders (`seller-orders-empty`), earnings (already), papers (already). No fake numbers shown.
2. **Suspend / unsuspend confirmation modal** in admin → fires dealer notification emails via `email_dealer_suspended` / `email_dealer_unsuspended` (`asyncio.create_task`, non-blocking).
3. **Order numbering** — `_generate_order_number()` produces `TC-YYYY-NNNNNN` (zero-padded to 6 digits), written immediately after order insert. Gracefully no-ops until `supabase_schema_v3.sql` adds `orders.order_number`. Displayed in CustomerDashboard, Admin DealerDetail, Supplier Orders.
4. **Featured supplier rework** — `POST /api/admin/suppliers/{id}/featured-image` (multipart, 5 MB cap, supplier-id validated before upload to prevent orphaned blobs). New AdminDashboard modal (`feature-upload-dialog`) with supplier picker + logo upload sets `is_featured=true` and persists the signed-URL path.
5. **Supplier dashboard: My Stock vs Orders split** — Orders is now its own catalog tab (`#orders` URL hash routes to it). Header links work correctly.
6. **About Us** — new `/about` route with hero, story, mission, Digital Edge Technologies parent block, Bangalore contact card. `data-testid="about-page"`.
7. **Grievance Officer** — footer strip + `/contact` page yellow callout. Mr. Karthik Nair / grievance@tonerscart.com / 48-hour response.
8. **Google sign-in loading** — already implemented in `Login.jsx` (`googleLoading` state, "Connecting to Google…" + spinner).
9. **Dealer-agreement red error** — `data-testid="apply-agreement-error"` shows under the checkbox when step 4 + !agreed. Submit handler also blocks with toast.
10. **Visitor analytics**:
    - `POST /api/analytics/pageview` — public, accepts page/timezone/device_type/referrer, fires-and-forgets via `navigator.sendBeacon` from `VisitorTracker.jsx` on every public navigation. Admin routes are skipped.
    - `page_views` table migration in `supabase_schema_v3.sql` (idempotent).
    - `GET /api/admin/visitor-analytics` returns `{total, today, week, month, unique_estimate, top_pages, devices, referrers}` — empty buckets with valid structure when not migrated.
11. **/api/landing-data** unified endpoint (stats + featured + popular_chips + marquee_brands) with **5-minute in-memory cache** (`_LANDING_CACHE`). Cache bust helper `_bust_landing_cache()` exposed.
12. **Paper bulk stock + Duplicate** — `PUT /api/supplier/papers/{id}` (stock/price patch). Duplicate button copies all fields with stock=1.
13. **Migration**: `supabase_schema_v3.sql` (idempotent ADD COLUMN IF NOT EXISTS) for orders.order_number, page_views table, listings spec columns, printer_listings spec columns, paper_listings spec columns, suppliers.is_featured/business_logo/is_suspended, users.totp_secret.

**Deferred (called out for next batch):**
- **Spec fields replace PDF brochure** in Add Toner / Add Printer / Add Paper forms + product-page Spec table — schema migration ready, but FE forms still use spec_pdf_url.
- **Admin 2FA TOTP enrolment** UI (pyotp + users.totp_secret column ready, no QR-scan flow yet).
- **server.py router refactor** to `routes/` modules (file is now 3004 lines; deferred).
- **BackgroundTasks** migration for non-critical emails (order confirmation, application, quotation, MPS, featured) — only suspend/unsuspend converted to `asyncio.create_task` so far.
- **Image compression** and **AI document check** moved to BackgroundTasks.

**User-side migrations still required** (until they run, endpoints continue to degrade gracefully):
- supabase_schema_papers.sql
- supabase_schema_admin_v2.sql
- supabase_schema_quotation_featured.sql
- supabase_schema_logo.sql
- supabase_schema_buyer_gst.sql
- **NEW**: supabase_schema_v3.sql

### 2026-02-25 — Wave 5 batch (Product detail page, multi-images, variants, cleanup, sticky search)

**Backend:**
- `POST /api/admin/cleanup-test-data?apply=bool` — admin endpoint that detects fake/test/seed/demo/dummy suppliers + listings (model_number regex for random alphanumerics like `99992F5391`) and deletes everything in FK order (orders, quotations, listings, printers, papers, suppliers, users). Dry-run by default.
- `backend/cleanup_test_data.py` — standalone script + `run(apply=bool)` import target.
- `GET /api/listings/{id}/public`, `GET /api/printers/{id}/public`, `GET /api/papers/{id}/public` — browse-without-login product detail endpoints. Include `variants[]` for toners (graceful empty when migration not run).
- `GET /api/listings/{id}` and `GET /api/listings/search` now attach `variants` array per listing (bulk-fetched).
- `ListingCreate` extended with `variants: [{color, price, stock}]`, `image_urls: []`, and structured spec fields (compatible_models, oem_part_number, cartridge_weight, pack_size, warranty). All optional columns degrade gracefully when the v3/v4 migration hasn't been applied.
- `OrderCreate` accepts `variant_id` — when present, stock is deducted from `listing_variants[variant_id]` instead of the parent listing, and `orders.variant_id` is persisted.
- `PrinterListingCreate` extended with `image_urls`, `print_speed_ppm`, `duty_cycle`, `display_type`, `dimensions`, `weight_kg`, `printer_warranty`.
- `PaperCreate` extended with `image_urls`, `brightness`, `thickness_microns`, `acid_free`, `suitable_for[]`.
- New `POST /api/supplier/listing-image` — multi-purpose toner/paper image upload (service-role, auto-compressed to 1200px / quality 85, stored in `printer-images` bucket which has public read).
- New migration `supabase_schema_v4.sql` — `listing_variants` table, `orders.variant_id`, `listings/printer_listings/paper_listings.image_urls`.

**Frontend:**
- `/toner/:id`, `/printer/:id`, `/paper/:id` — new `<ProductDetail />` page with:
  - Sticky breadcrumbs + Back button (44 px tap target on mobile)
  - 5-col / 7-col Apple-style grid (image gallery left, content right)
  - Up to 3-image thumbnail gallery (active highlight)
  - Toner-type badge, printer-condition badge, compatibility callout
  - Colour-variant swatches (uses `lib/colors.js` palette: Black / Cyan / Magenta / Yellow / Red / Blue / Green / Orange / White / Gold / Silver / Tri-color gradient)
  - Live price + stock that update with the selected variant
  - Stock badge: green/orange/red thresholds (>5 / ≤5 / 0)
  - Verified supplier badge
  - Qty stepper, Add to cart (dark), Buy now (yellow), Get quotation (outline)
  - Auto-decoded `Specifications` table — only shows rows the dealer filled in
  - Browse-without-login: clicking Add/Buy/Quote triggers `<AuthRequiredDialog />` → routes to `/auth/login?next=<current>` → returns and auto-resumes the intent
- `/search` sticky search bar (`position:sticky top-[64px]`)
- `/papers` sticky filters
- Toner cards on `/search` now link to `/toner/:id` (image + model_number clickable) + show colour-swatch row + "X colours" count
- Printer cards on `/printers` link to `/printer/:id`
- Paper cards on `/papers` link to `/paper/:id`
- **Add Toner form** (`/supplier`): single-image picker + `Color` swatches replaced with:
  - Multi-image picker (2 to 3 images, auto-compressed, with × remove and "+ add" tile)
  - "Colours & pricing" variant editor: free-text colour name with auto-swatch preview, ₹ price, stock — `+ Add colour` up to 15, `×` to remove (min 1 required)
  - Structured spec inputs: Page yield, OEM part number, Compatible printer models, Cartridge weight, Pack size (1/2/5/10), Warranty (None / 3 mo / 6 mo / 1 yr)
- **Add Printer wizard** Step 1 also accepts 2–3 images (same UI pattern).
- **Add Paper form** also accepts 2–3 images + Brightness, Thickness (microns), Acid-free toggle, Suitable-for multi-select.

**Notes:**
- `Get quotation` calls existing `/api/quotation` endpoint (kept singular, matches existing route).
- `OrderRequestDialog` already supported the order flow; ProductDetail passes `variant_id` so the order body forwards it to `POST /api/orders`.
- Migrations the user must run for full feature parity: `supabase_schema_v3.sql` (specs) and `supabase_schema_v4.sql` (variants + multi-image + variant_id).
