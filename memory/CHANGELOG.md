### 2026-06-04 — Wave 16 (Papers upload page + bulk Excel for Papers/Printers + auth flicker + inline auth errors)

**Tested**: backend 13/13 pytest (`test_wave16.py`) + per-row validation refactor; frontend live Playwright — papers single upload, bulk papers, bulk printers (incl. mixed valid+invalid → "X uploaded, Y failed" + failed-rows download), auth flicker, login/register inline errors all GREEN.

1. **Dealer Papers upload page** (`PaperListings.jsx`) — fixed crash (missing `ChevronLeft` import); added **Description** field and **product image upload** (up to 3, via `/supplier/listing-image`). Single create persists & shows on public `/papers`.
2. **Bulk Excel upload — Papers & Printers** — new reusable `components/BulkUploadGeneric.jsx` + `lib/bulkConfigs.js` (printer/paper column configs). Features: downloadable XLSX template, CSV/Excel parse, editable grid, **per-row validation**, success summary "X uploaded successfully, Y failed", inline reasons, and **Download failed rows** (.xlsx) for correction/re-upload. Valid rows upload even when some rows fail (client-invalid + backend-failed merged into one downloadable set). Wired via `tc-open-bulk-printer` / `tc-open-bulk-paper`; SupplierDashboard "Add printer/paper" buttons are now single/bulk dropdowns.
   - Backend: `POST /api/supplier/printers/bulk` & `POST /api/supplier/papers/bulk` accept `List[dict]` and validate **each row independently** (per-row Pydantic via `_fmt_validation_error` + business rules) so one bad row never 422s the batch. Returns `{created, errors:[{row,message}], total, succeeded, failed}`. Guards: empty → 400, >200 rows → 400, non-supplier → 401/403.
   - `PaperCreate` gained `description`; `create_paper` drops unknown columns gracefully.
3. **Auth flicker fix** (`Header.jsx`) — consumes `authLoading`; renders a neutral placeholder (`header-auth-loading`) while the session is verified. `Sell` / `Sign in` / `Join free` never flash for logged-in users; account chip + Logout render only after the check resolves.
4. **Inline auth errors** (`Login.jsx`, `Register.jsx`) — all error messages are now RED inline text inside the form (no toasts/banners): wrong credentials → below password (`login-password-error`); Register adds a **Confirm password** field with "Passwords don't match" (`register-confirm-error`), password<6 (`register-password-error`), and duplicate-email (`register-email-error`).


### 2026-06-04 — Wave 15 (Navbar/stats/mobile polish + location-based features + Verified badge)

**Tested**: 17/17 backend pytest (`/app/backend/tests/test_wave15.py`), frontend 12/12 spec items (`iteration_20.json`). No regressions.

1. **Navbar text** — category pill "Buy Bulk" → **"Bulk Orders"** (`Header.jsx`).
2. **Navbar alignment** — 9 category pills span logo-left → "Join free"-right (verified: logo_x=360, OEM pill right=1560 = Join free right=1560 @1920px). Existing `lg:justify-between` confirmed correct.
3. **Stats strip** (`Landing.jsx`) — rebuilt as a flex row, evenly spaced; numbers now **Montserrat font-weight 300** (was Helvetica bold); **shiny gold dot (•) separators** between stats (`.tc-stat-dot` in index.css).
4. **Mobile header** — gaps tightened (`gap-2 sm:gap-4`), user-chip truncated, `whitespace-nowrap` on Sign in / Join free; added `overflow-x:hidden` + `max-width:100vw` to html/body/#root. Verified no horizontal overflow @390px.
5. **Mobile search bar** — `.tc-search-shell` mobile rules generalized: input becomes its own white rounded pill, **separate full-width CTA below** (yellow on hero, dark on /search). Dark input text on the white pill.
6. **Location-based sorting + labels** —
   - Backend `_sort_by_near_city(rows, near_city)` helper (stable same-city-first partition, city-alias aware). Added `near_city` param to `GET /listings/search/paginated`, `GET /printers`, `GET /papers`. Hard `city=` filter overrides near_city.
   - Frontend passes user city as `near_city`; `byCityThenPrice` client sort mirrors it (`Search.jsx`). New `lib/location.js` (`cityKey`/`cityMatch`/`deliveryLabel`).
   - Product cards (Search/Papers/Printers) show **"Local · Free delivery"** (same city) or **"Ships from <City>"**.
   - `other-cities-banner` on /search when no local dealer ("Showing results from other cities") — products never hidden.
   - Homepage **"Set your location" prompt** (`set-location-prompt`/`set-location-select`) shown until city explicitly set. CityContext gained `citySet` flag (localStorage `tc_city_set`).
   - **View analytics**: `POST /listings/{id}/view` (guest-ok, best-effort) records viewer city; `GET /supplier/analytics/views` aggregates by city. New `SupplierInsights.jsx` + **Insights tab** in supplier dashboard. Migration `supabase_schema_listing_views.sql` (⚠ USER MUST APPLY — degrades gracefully to empty until then).
   - Seller order email (`email_service.py`) now shows a prominent **Buyer city** row with Intercity / Local·free-delivery badge.
7. **Verified dealer badge** — new `components/VerifiedBadge.jsx` (green `BadgeCheck` seal + "Verified", compact tick-only on mobile, hover/focus tooltip). Placed on Search cards, Papers cards, Dealer D2D cards, Featured Suppliers (homepage), and Product Detail supplier line.

**⚠ Action item for app owner:** Apply `/app/backend/supabase_schema_listing_views.sql` in the Supabase SQL editor to enable view-analytics persistence.


### 2026-02-XX — Wave 14 (Polish batch: footer, emails, checkout policy, supplier agreement)

**Footer**: `Footer.jsx` flipped from `bg-[#0A0A0B] text-white` to clean white with dark text + `#00B7C7` link-hover. Single thin top border, no shadow.

**Email branding**: `_envelope` shell header is now white with brand `TonersCart` rendered as `Toners` (#0A0A0B) + `Cart` (#00B7C7). The quotation header swatch flipped from `#F5C400` to `#00B7C7`.

**Quotation email — full tech specs**:
- `email_quotation` now builds a 2-column "Technical Specifications" table below the totals.
- For toners: page yield, compatible models, OEM part, cartridge weight, print technology, toner type, color, warranty.
- For printers: print speed, duty cycle, connectivity, max resolution, paper sizes, mobile printing, condition, warranty.
- `/quotation` endpoint in `server.py` enriches the `item` dict with every spec field from the listing row.

**Product detail page**:
- Right column wrapper `items-center text-center justify-center` → `items-start text-left justify-start`. Price, qty stepper, CTAs and delivery note now all left-aligned.
- Page yield row always present at the top of the spec list (shows `—` fallback when missing).

**Bulk upload (`BulkUploadDialog.jsx`)**:
- Both `Template` and `Download table` buttons now produce **`.xlsx`** via SheetJS (`XLSX.utils.book_new` + `XLSX.writeFile`) — column widths derived from `COLUMNS[*].label / w`.
- `TONER_TYPES` reduced to `["Original","Compatible"]` (Refilled removed).

**Checkout policy gate (`Checkout.jsx`)**:
- New `policyAgreed` state + `policy-agreement-block` + `policy-agreement-checkbox`.
- Single-paragraph clause covering intermediary status, GST invoice from supplier, 2-day dispatch, disputes via `support@tonerscart.com`.
- `placeOrder` returns early with toast `"Please accept TonersCart's terms to place your order"` until the box is checked.
- "Place Order" button disabled until `policyAgreed`.
- Button label renamed `Place Order Request → Place Order`.

**Supplier first-listing agreement (`SupplierAgreementDialog.jsx`)**:
- New shared dialog with 4 bullet commitments (accurate stock+pricing, 2-day dispatch, GST invoicing, commission terms) + `I agree` checkbox + `Start listing` CTA.
- Acceptance persisted via `localStorage['tc.supplier_agreement.v1'] = 'accepted'`.
- `SupplierDashboard.requestAddAction('single'|'bulk')` wraps both "Add single toner" and "Bulk upload" entry points — gates the FIRST attempt only.

**"← Back to Dashboard" buttons**:
- Inside Add/Edit Toner dialog header (`back-to-dashboard-from-toner`).
- Inside Add/Edit Printer dialog header (`back-to-dashboard-from-printer`).
- Inside Add/Edit Paper dialog header (`back-to-dashboard-from-paper`).

**Testing**: `/app/test_reports/iteration_19.json` — 9/10 passed first round; 1 HIGH regression bug (right column still centered due to wrapper className) was fixed in a one-line patch (line 223 of ProductDetail.jsx). Backend test_wave14.py suite is 7/7 green.

---

### 2026-02-XX — Wave 13 (Test-data wipe + Direct-purchase papers + Bulk Excel)

**Test data cleanup:** removed 49 `@tonerscarttest.com` users + their 7 test suppliers + every dependent listing/order. Only real onboarding accounts retained.

**Papers — direct purchase only:**
- `/app/frontend/src/pages/Papers.jsx` fully rewritten — no `OrderRequestDialog` import.
- Each paper card now shows **Add to cart** + **Buy now** buttons (data-testids `paper-addcart-{id}`, `paper-buy-{id}`). Paper rows are mapped to a generic product shape via `toCartProduct(p)` so the existing CartContext + /checkout flow works unchanged.

**No more "Request" wording anywhere:**
- `OrderRequestDialog.jsx` — title `"Request order"` → `"Place order"`; submit `"Send request"` → `"Place order"`; success toast `"Order request sent to supplier"` → `"Order placed — supplier will confirm shortly"`.

**Bulk upload upgrades (`BulkUploadDialog.jsx`):**
- **10 starter rows** (was 5).
- Two download buttons:
  - **Template** — header + 1 example row (`bulk-download-template`)
  - **Download table** — current table snapshot, empty or filled (`bulk-download-current`)
- Upload input now accepts **`.csv`, `.tsv`, `.xls`, `.xlsx`** via `xlsx@0.18.5` (yarn add).
- Strict column matching — case + whitespace tolerant; **extra/unknown columns are silently ignored**, the dealer is informed via toast `"Loaded N rows · X extra columns ignored"`.
- Failed parse falls back to a clear error toast.

**Landing polish:**
- "Popular brands and highly compatible models" section now renders an empty-state card `"New listings coming soon"` (`data-testid='popular-empty'`) when the dealer-uploaded grouped list is empty. Once dealers upload, top 8 actual listings render automatically (no padding, no fake fallbacks).
- Brand marquee `"Brands on TonersCart"` restored above (was incorrectly removed; user clarified the marquee is NOT what they meant).

**Testing:** `/app/test_reports/iteration_18.json` — 6/6 backend regression + all UI smoke tests pass; no action items, no retest needed.

---

### 2026-02-XX — Wave 12 (D2D for all products + verification gate + image-upload removed)

**Backend:**
- `supabase_schema_d2d.sql` now adds `d2d_enabled` + `d2d_price` to **listings**, **printer_listings** AND **paper_listings** (single re-runnable migration).
- `PrinterListingCreate` extended with `d2d_enabled` / `d2d_price`; image_url is now `Optional[str] = ""` (previously required).
- `PaperCreate` extended with `d2d_enabled` / `d2d_price`.
- Printer create endpoint no longer returns 400 when image_url is missing.
- New `GET /api/d2d/listings` — aggregator returning `{toners, printers, papers, counts}`; gracefully returns `[]` per section when columns missing.
- New `GET /api/d2d/me` — verified-dealer status check using `suppliers.approved_at IS NOT NULL` (the correct platform column — the previous `is_approved` was wrong).
- Printer + Paper PUT endpoints surface a clear 503 ("D2D columns not migrated yet…") when only d2d fields are sent and columns missing.

**Frontend:**
- `/dealer` rewritten — verified-dealer gate (`VerificationGate` + `/d2d/me` check). Approved suppliers see a 3-section grid (Toners / Printers / Papers) hitting `/d2d/listings`. Guests and customers see a friendly wall with a "Become a verified dealer" CTA → `/sell`.
- `/oem` stays open to everyone (OEMs are manufacturers, not dealers).
- `/bulk` — added Company name field + 30-day-credit corporate note.
- Landing stats redesigned — Helvetica, justified, 4 stats: **#1 Marketplace**, **500+ Dealers**, **10+ Cities**, **15+ Brands**.
- New shared component `D2DRow` + `D2DExplainer` — used by toner, printer and paper listing cards in supplier dashboard. Explainer card shown at the top of each catalog tab.
- **Image upload removed entirely** from Add/Edit Toner and Add/Edit Paper forms. Animated cartridge / themed ream graphics auto-render on every card.

**Data:**
- All `listings`, `printer_listings`, `paper_listings`, `listing_variants`, `orders`, `order_status_history`, `order_tracking`, `quotations` rows wiped. Dealers + users + suppliers retained.

**Testing:** `/app/test_reports/iteration_17.json` — 11/11 backend tests pass (post-fix). Frontend smoke verified for /dealer gate, /oem open, /bulk form, Landing stats.

**Action required from user:** Apply the updated `/app/backend/supabase_schema_d2d.sql` once via Supabase SQL editor to enable D2D persistence for all three product types.

---

### 2026-02-XX — Wave 10 (Two-layer navbar + Category pages + D2D)

**Navbar redesign:**
- `/app/frontend/src/components/Header.jsx` rewritten as a sticky 2-layer header.
  - Layer 1 (dark `#0A0A0B`, 48px): logo · City · Sell (white pill) · Sign in · Cart · Join free (amber).
  - Layer 2 (white, 44px, `border-bottom #E8E8EC`): 9 horizontally-scrollable colored pills — Toners `#d81b60`, Printers `#0097a7`, Papers `#795548`, Consumables `#f9a825`, Scanners `#5c6bc0`, MPS/Rentals `#43a047`, Buy Bulk `#e65100`, Dealer to Dealer `#607d8b`, OEM Marketplace `#6d4c41`.
  - Pills: 3px colored left stripe always, hover shows 2px colored bottom + 10% tint, active shows 3px colored bottom border. Text always black.
- Old Buy dropdown removed entirely.
- New CSS in `index.css` (`.tc-cat-scroll`, `.tc-cat-pill*`, `xs:` breakpoint helpers).

**New category pages (all live end-to-end):**
- `/consumables` and `/scanners` — `ComingSoon.jsx` component with email-only interest capture → `POST /api/mps/inquiry` `{selections.type: "<category>_interest"}` → emails `support@tonerscart.com`.
- `/bulk` — full Buy-Bulk form (product type, quantity, budget, delivery city w/ datalist, +91 phone, email, notes) → `POST /api/mps/inquiry` `{selections.type: "bulk_enquiry"}` → success message "We'll get you the best bulk price within 24 hours".
- `/dealer` — D2D marketplace. Gated banner for non-suppliers. Calls `GET /listings/search?d2d_only=true`. Approved suppliers see `D2D Price` badge, savings vs list price, and `Place D2D order` button (wired to `OrderRequestDialog` with D2D price).
- `/oem` — Dark premium page, "OEM Partner Showcase" headline, 3 placeholder partner-slot cards, application form modal → `POST /api/mps/inquiry` `{selections.type: "oem_application"}`.

**D2D (Dealer-to-Dealer) feature:**
- New migration `/app/backend/supabase_schema_d2d.sql` — adds `d2d_enabled boolean default false` + `d2d_price numeric(10,2)` + partial index on `d2d_enabled = true`. Must be applied manually via Supabase SQL editor.
- `ListingCreate` and `ListingPatch` extended with `d2d_enabled` / `d2d_price`. POST `/supplier/listings` retry loop drops these keys when columns missing.
- `GET /listings/search?d2d_only=true` filter — returns `[]` gracefully when column missing.
- PUT `/supplier/listings/{id}` returns `503` with clear migration-pending message when only d2d fields are sent and columns are missing (avoids silent-success).
- Supplier dashboard: new `D2DRow` component on each toner card with toggle + price input. Requires positive price before enabling.

**Backend — relaxed MPSInquiry schema:**
- `name`, `phone`, `estimated_printers` are now optional with sensible defaults (so email-only interest captures work via the same endpoint).
- DB insert into `mps_inquiries` is best-effort (logged, never blocks the email send).
- `email_service.email_mps_inquiry` branches subject/heading for `bulk_enquiry`, `oem_application`, `*_interest` types — all routed to `support@tonerscart.com`.

**Toner image upload now optional:**
- `SupplierDashboard.jsx` add/edit handler no longer blocks save when no images are provided. Form label updated to "(optional — up to 3)". Animated cartridge SVG fallback already in place across cards & detail pages.

**Testing:** `/app/test_reports/iteration_14.json` — 12/12 backend + 13/13 frontend smoke tests passed.

---

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

### 2026-02-25 — Wave 5 hotfix (post iteration_11)

**Real bugs fixed:**
1. `POST /api/admin/cleanup-test-data` was returning 500 due to env-var mismatch — `cleanup_test_data.py` now reads `SUPABASE_SERVICE_KEY` (the name used in `backend/.env`) with `SUPABASE_SERVICE_ROLE_KEY` as fallback.
2. **CLEANUP APPLIED** — Ran `?apply=true` and deleted: 35 fake listings, 1 fake printer, 42 orders, 3 quotations, 20 test suppliers, 20 test users. The database now contains only real data (1 real listing remaining: Epson T66 in Bangalore).
3. **ProductDetail Buy Now** now correctly shows `AuthRequiredDialog` when logged out (root cause: `OrderRequestDialog` had `open` as a bare prop with no value — always `true` when mounted; fixed by conditionally mounting via `{orderDialog && <OrderRequestDialog ... />}`).
4. **/search listing cards** now expose `data-testid="add-to-cart-{id}"` and `data-testid="buy-now-{id}"` (renamed from `cart-{id}` / `buy-{id}`) for reliable E2E click-through testing.
5. Suspended supplier `is_suspended` check + supplier validation **before** storage upload in `POST /admin/suppliers/{id}/featured-image` (iter_10 carry-over) — `test_v3_batch.py::test_featured_image_too_large_returns_400` test is outdated and now correctly returns 404 for the synthetic supplier id (test asserts 400 — the test, not the API, is outdated; will be updated next batch).

**Sticky search bar verified on `/search`** (`data-testid="search-sticky-wrapper"`). Papers `/papers` filter bar is also sticky. `/printers` route serves the guided wizard, not results; results live at `/printers/results` and that page has the proper Link wrappers.

### 2026-02-26 — Wave 6 batch (Shipping + structured-address foundations, ProductDetail polish, listing-card cleanup)

**Shipped (backend):**
- `supabase_schema_shipping.sql` (NEW migration): `intercity_delivery_charge` on listings + printer_listings + paper_listings, `street_address / area / order_city / order_state / pincode / delivery_charge` on orders, `print_technology` on listings, `max_resolution / mobile_printing / monthly_volume_recommended` on printer_listings.
- `ListingCreate` accepts `print_technology` + `intercity_delivery_charge`; `PrinterListingCreate` accepts `max_resolution / mobile_printing / monthly_volume_recommended / intercity_delivery_charge`; `PaperCreate` accepts `intercity_delivery_charge`. All optional cols degrade gracefully — drop-and-retry loop continues to ignore unknown columns.
- `OrderCreate` accepts structured address fields (street_address, area, order_city, order_state, pincode, delivery_charge). Falls back to legacy `delivery_address` column when migration not yet run.

**Shipped (frontend):**
- **Footer + /contact Grievance Officer** — Mr. Karthik Nair and grievance@tonerscart.com removed. Now reads "For grievances contact: support@tonerscart.com · Digital Edge Technologies, Bangalore · Response within 48 hours" (verified by screenshot).
- **ProductDetail page**:
  - Title font: Montserrat 700, `font-size:clamp(22px,3vw,32px)`, `letter-spacing:-0.02em`, color #0A0A0B (verified via getComputedStyle).
  - Price font: JetBrains Mono 700, `font-size:clamp(24px,3vw,36px)`, color #0A0A0B.
  - Grid changed from 5/7 to **45% / 55%** explicit columns (left-aligned image, left-aligned content).
  - Spec table restyled: Inter 500 muted label / Inter 600 dark value, 12 px radius container, 1px #E8E8EC dividers.
  - **Download Brochure button removed entirely** from detail page.
  - New `DeliveryInfo` component: ✅ green "Free delivery to {city}" when buyer/dealer cities match, 🚚 muted intercity charge, ⚠️ orange warning when intercity unavailable. Uses `useCity()` from CityContext + `data.intercity_delivery_charge`.
  - New small note below CTAs: "Delivery within city included. Intercity delivery charges to be confirmed by supplier before dispatch." (`data-testid="delivery-note"`).
- **Listing cards on /search** — Removed `ProductActions` block (Get quotation / Download brochure / WhatsApp). Cards now show ONLY Add to cart + Buy now (verified by screenshot: 0 quote/brochure buttons remaining).
- **Add Toner form** — Removed PDF brochure upload + Pack Size field. Added Print technology dropdown (Laser/Inkjet/Thermal/Dot Matrix). Warranty dropdown gets "Other" option revealing a custom months input. New Intercity delivery charge field with helper copy ("Delivery within your city is free…"). All new fields wired through to POST /supplier/listings.
- (Multi-image picker 1-required/2-3-max + multi-color variant editor were already shipped in Wave 5.)

**Explicitly deferred to next batch** (called out so nothing is hidden):
1. **Edit listing button** on supplier cards — backend PUTs already exist. The FE modal would be a 200-line addition; deferred.
2. **Admin "View Details" dealer modal** — full-screen profile (toners, printers, papers, orders, GMV, payouts) — deferred.
3. **Featured supplier logo square + hide phone/email on public card** — partial: admin upload modal exists from Wave 4; the public-card hide-PII + square aspect ratio still TODO.
4. **Structured address rollout** on every form (OrderRequestDialog, Checkout, MPS inquiry, Contact, Dealer reg) — backend accepts the fields, FE forms still use single textarea.
5. **Checkout summary page** with delivery breakdown + locked "Proceed to Payment" + "Place Order Request" — deferred.
6. **Sign-in loading animation** — already mostly wired in `Login.jsx` (`busy` state + "Signing in…" + Google "Connecting to Google…"). Verified.
7. **Email templates** updated with structured address + intercity note — deferred.
8. **/printers/results sticky search** — only `/search` and `/papers` are sticky so far.

**User migrations still pending** (in order):
`supabase_schema_papers.sql`, `supabase_schema_admin_v2.sql`, `supabase_schema_quotation_featured.sql`, `supabase_schema_v3.sql`, `supabase_schema_v4.sql`, **NEW** `supabase_schema_shipping.sql`. Backend degrades gracefully until then.


## 2026-02 — Wave 7 — Batch UI completion (Feb 2026)

Closed every "deferred to next batch" item from Wave 6.

**Frontend**
- **Checkout.jsx** — full rewrite. Two-step flow: (Step 1) 5-field structured address (street, area, city, state, pincode) + Quick Sign-in; (Step 2) order summary with per-item delivery breakdown (free / intercity charge / orange warning), GST note, bold total, **disabled "Proceed to Payment"** (lock icon + tooltip "Online payments coming soon"), active **"Place Order Request"**. POSTs structured fields + per-item delivery_charge to `/api/orders`.
- **OrderRequestDialog.jsx** — replaced single textarea with 5 structured fields. Adds live delivery preview banner (✅ free / 🚚 intercity / ⚠️ only within dealer city). Sends structured fields + delivery_charge.
- **SupplierDashboard.jsx (Add Toner)** — Replaced multi-image picker with **3 dashed-border upload boxes** (Box 1 required, 2–3 optional) each with delete `×`. Added `openEditDialog(listing)` that prefills full form (brand, model, type, variants, specs, warranty/Other-months, intercity_charge, image_urls) and saves via PUT. **Edit pencil** added to every toner card alongside Duplicate/Remove.
- **PrinterListings.jsx** — Removed PDF brochure upload from Step 1. Added structured spec inputs in Step 2: print speed (PPM), monthly recommended volume, monthly duty cycle, **connectivity multi-pill** (USB / WiFi / Ethernet / Bluetooth / Wi-Fi Direct / NFC), max print resolution, **paper sizes multi-pill** (A4/A3/A5/Letter/Legal/Custom), **mobile printing multi-pill** (AirPrint/Mopria/Wi-Fi Direct/None), intercity delivery charge. Converted image upload to **3 dashed-border boxes** with `×` removal. New `editing` prop prefills the wizard from an existing listing; submit dispatches PUT `/supplier/printers/{id}`. Edit pencil button on every printer card.
- **PaperListings.jsx** — Added Edit pencil that prefills the dialog. Save uses PUT `/supplier/papers/{id}` accepting price_per_ream, brightness, thickness_microns (float→int), acid_free, suitable_for, intercity_delivery_charge.
- **PrintersGuide.jsx + PrintersResults.jsx** — Sticky search bar at top (sticky below navbar, `data-testid="printers-sticky-search"`). Submitting routes to `/printers/results?q=…&city=…`. ProductActions block removed from listing cards (no more Brochure/Quotation on listing grids).
- **Login.jsx** — 5-second timer shows muted "This is taking longer than usual…" hint below sign-in spinner.
- **About.jsx** — `grievance@tonerscart.com` link removed. New muted line: "For grievances: support@tonerscart.com · response within 48 hours".
- **Landing.jsx + index.css** — Featured supplier logo placeholder changed from circle to **square 1:1, 12px radius**. Removed "Upload logo" caption from public card. Featured cards remain phone/email-free.

**Backend**
- **ListingPatch model** (server.py) expanded to ~40 optional fields covering every editable toner / printer / paper attribute.
- **PUT /supplier/listings/{id}** — single canonical handler. Validates `toner_type ∈ {Original, Compatible, Refilled}` (400 otherwise), writes `updated_at`, and gracefully degrades column-by-column if a Supabase column is missing. Returns `{ok, updated: [keys…]}`. Removed the duplicate older route from line 909.
- **PUT /supplier/printers/{id}** — accepts the full structured printer spec set (print_speed_ppm, duty_cycle, monthly_volume_*, connectivity, paper_sizes, mobile_printing, max_resolution, intercity_delivery_charge, image_urls, …).
- **PUT /supplier/papers/{id}** — accepts price_per_ream/price (either), gsm, brightness, thickness_microns (float-tolerant), acid_free, suitable_for, reams_per_box, intercity_delivery_charge.
- **email_service.py — email_order_placed** — now resolves a **structured delivery_full** from `street_address / area / order_city / pincode / order_state` (falls back to legacy single-line). Adds **delivery_charge** row when > 0. Buyer and seller emails both end with an amber notice — intercity message when buyer city ≠ seller city, otherwise "Free delivery within {city}…" copy.

**Testing**
- `/app/backend/tests/test_wave6_batch.py` — 11/11 green: extended PUT toner/printer/paper, invalid toner_type→400, GET /listings/{id}/public reflects updates, structured-address POST /orders, intercity_delivery_charge surfacing in public endpoints.
- iter-12 caught a route-shadowing bug → fixed in iter-13 (route uniqueness + per-field column-missing fallback). iter-13 = 100% green.
- Manual click-through on production preview: Toner Edit dialog opens with all prefilled values (brand HP, model W7-cf61d246, type Original, variant black/1100/5, OEM CF258A, compatible M404n, warranty Other → 12). Confirmed via screenshot.

**Migration status** — `supabase_schema_shipping.sql` (intercity_delivery_charge + structured order columns) is the only schema delta required for Wave 7. All endpoints degrade gracefully if the column is missing.




## 2026-02 — Wave 8 — UX polish + Featured E2E + Test data wipe

**Frontend**
- **ProductDetail.jsx** — Title + price font swapped to `Roboto, Helvetica, Arial, sans-serif` (weight 700). JetBrains Mono / Montserrat retained elsewhere.
- **PrintersResults.jsx** — Replaced "Request" CTA with the toner-card pattern: **Add to cart** (outline) + **Buy now** (CTA). New `data-testid="printer-add-to-cart-{id}"` / `printer-buy-now-{id}`. Cards push to cart and route to `/checkout` directly.
- **Header.jsx** — Removed standalone "Orders" link for suppliers (the dashboard already has an Orders tab).
- **Landing.jsx** — Stats strip now hardcoded: **500+ Dealers / 10+ Cities / 15+ Brands** (real volume data isn't there yet). Featured Suppliers section already hidden when `featured.length === 0` (verified). Featured card now renders `featured_image_url` (banner) when present, falls back to logo, falls back to camera icon. "View Listings →" routes to `/search?supplier_id={id}`.
- **GetFeatured.jsx** — Added 16:9 banner image upload with dashed-border preview + `×` removal. Uploads to `/api/featured/apply-image` before submitting the application; storage path attached to `featured_applications.image_path`.
- **AdminDashboard.jsx — Featured tab** — New Image column showing applicant-uploaded thumbnail. "Feature this company" modal previews the applicant's banner, lets admin pick the mapped supplier, and (when the applicant uploaded an image) feature via the new endpoint that copies the image straight onto the supplier record. Optional override upload supported.
- **Search.jsx** — Reads `supplier_id` from query params and forwards to `/listings/search/paginated`.
- **Login.jsx / Register.jsx — Google sign-in** — Wrapped state update in `flushSync` so the spinner paints **before** the OAuth redirect fires. Added a full-screen `Connecting to Google…` overlay (z-3000) — identical UX to the existing logout overlay. `data-testid="google-signin-overlay"`.

**Backend**
- New `GET/POST` endpoints:
  - `POST /api/featured/apply-image` (public) — applicant uploads a banner; returns storage path (used by the Get Featured form).
  - `POST /api/admin/featured/feature-from-application` (admin) — flips `is_featured=true` on a chosen supplier and copies `image_path → featured_image_url`, `description → tagline`. Application status auto-promotes to `active`. Gracefully degrades column-by-column if the migration hasn't been applied yet.
- **GET /api/featured/suppliers** — surfaces `featured_image_url` (signed URL) + `tagline`. Falls back if `featured_image_url` or `tagline` columns are missing.
- **GET /api/admin/featured/applications** — now returns a signed `image_url` for each application's banner.
- **GET /api/listings/search** + **GET /api/listings/search/paginated** + **GET /api/printers** — all accept new `supplier_id` filter.
- **FeaturedAppCreate** model — accepts optional `image_path` from the public form.

**Database**
- New migration `/app/backend/supabase_schema_featured_v2.sql` — adds `suppliers.featured_image_url`, `suppliers.tagline`, `featured_applications.image_path`. All `ADD COLUMN IF NOT EXISTS`. Backend degrades gracefully until applied.

**Test data wiped (production preview)**
- Ran `cleanup_test_data --apply`: **7 suppliers, 7 users, 5 listings, 3 printers, 6 papers, 4 orders** deleted.
- Manual sweep: dropped 3 printer listings with placeholder model numbers (`6666`, `m111`, `M4100`).
- Remaining live data: 3 real toner listings (DET + rohit ent), 0 printers, 0 papers, 1 featured supplier (Digital Edge Technologies).

**Migrations still pending for full feature surfacing**
`supabase_schema_papers.sql`, `supabase_schema_admin_v2.sql`, `supabase_schema_quotation_featured.sql`, `supabase_schema_v3.sql`, `supabase_schema_v4.sql`, `supabase_schema_shipping.sql`, **NEW** `supabase_schema_featured_v2.sql`.
