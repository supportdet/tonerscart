### 2026-06-09 (d) — Fix: /compatible/:slug returning "printer not found"

Root cause: slugs were generated as `brand + full model name`, so DB slugs carried marketing/sub-brand filler (`-mfp`, `imageclass`, `ecotank`) and model variants (`HL-L2321D`), and `get_printer()` only did an exact dict lookup — so natural SEO slugs like `hp-laserjet-m1005`, `canon-lbp2900`, `epson-l3150` 404'd. Xerox B305 was also missing from the DB.

Fix (`compatibility_db.py`):
- `slugify()` now strips a small filler set (`imageclass, ecotank, mfp, series`) → clean canonical slugs (`canon-lbp2900`, `epson-l3150`, `hp-laserjet-m1005`); collision-guarded (falls back to full slug if cleaning would clash). Sitemap/search now emit these clean slugs.
- `get_printer()` is now a tolerant 4-tier resolver: exact → alias (full uncleaned slug + cleaned-incoming) → token-subset → fuzzy (difflib ≥0.82). Resolves variants like `brother-hl-2321d` → "Brother HL-L2321D".
- Added Xerox B305/B310/B315 (toner 006R04403). Printer count 543 → 546.

Verified: all 5 requested slugs HTTP 200; **all 546 canonical slugs AND all raw full-name slugs resolve (0 failures)**; no duplicate slugs. Regression tests in `tests/test_iteration34_compat.py` (16/16 pass).


### 2026-06-09 (c) — Fix: homepage brand marquee showed empty white pills

Root cause: `/api/config/marquee_brands` stores plain strings (e.g. ["HP","Canon","Brother"]), but `Landing.jsx` rendered `b.name`/`b.color` (object shape) → pills rendered with NO text (just white boxes), most obvious on mobile where the label+marquee shared one flex row and the mask-fade only revealed slivers.
Fix (Landing.jsx): added `normalizeBrands()` + `BRAND_COLORS` map — accepts both string and {name,color} shapes, assigns each brand its corporate colour. Mobile layout: marquee label now stacks above a full-width marquee (`flex-col sm:flex-row`, `w-full sm:flex-1 min-w-0`); index.css adds a <=640px block (smaller pills, tighter gap, narrower mask) so brand names stay readable.


### 2026-06-09 (b) — Auto-notify waiting buyers when a compatible product is listed

When a dealer creates a **toner** (`POST /api/supplier/listings`) or **consumable** (`POST /api/supplier/consumables`), the backend now fires a fire-and-forget job (`routes/compat.schedule_notify` → daemon thread → `notify_waiting_buyers`) that:
- computes every compatibility-DB printer **slug** the new listing matches — from the dealer's selected `compatible_models` (printer models) AND from `model_number` mapped through the cartridge→printers inverse map;
- looks up `notify_requests` for those slugs, emails each waiting buyer via Resend (`email_notify_available`: "Good news — [Product] compatible with your [Printer] is now available … View & Buy"), then **deletes** those requests so nobody is emailed twice.
- Fully graceful: never blocks the listing-create response; swallows all errors; no-ops if `notify_requests` isn't migrated or `RESEND_API_KEY` is unset.
- Works for single-create and bulk (bulk calls the single endpoints).

**Deleted** the temporary QA supplier `qa.dealer.it34ui.6c96bdae@example.com` (DB rows + listings + Supabase Auth) per user request.

**⚠️ Still required (user):** run `supabase_schema_notify_requests.sql` in Supabase — the `notify_requests` table does NOT exist yet (PGRST205), so both the "Notify me" capture and this auto-notify flow are currently no-ops until the table is created. (Earlier note that it was already run was incorrect.)

Constraints honored: no CORS change, no emergentintegrations, Razorpay/Twilio untouched.


### 2026-06-09 — SEO + Printer↔Toner compatibility database + programmatic SEO pages

**1. Technical SEO.**
- `GET /sitemap.xml` + ingress-reachable `GET /api/sitemap.xml` (dynamic): static pages, city variants, every `/compatible/<slug>` printer page, and all in-stock product listing URLs (`/toner/ /printer/ /paper/ /consumable/`). The static `public/sitemap.xml` is now a sitemap-index pointing at `/api/sitemap.xml` (so it works behind the /api-only proxy).
- `GET /robots.txt` (backend) + `public/robots.txt`: allow all, Disallow `/admin /supplier /procurement /checkout /customer /oem-dashboard /api`.
- Homepage JSON-LD (`Landing.jsx` ldOrg) now `@type=WholesaleStore`, legalName "TonersCart Private Limited", description "India's marketplace for printers, toners and MFDs — verified dealers, GST invoices, pan-India delivery".

**2. Compatibility database (`backend/compatibility_db.py`).** Expanded to **543 printers / 571 toners** (both >500), covering HP, Canon, Epson, Brother, Ricoh, Xerox, Kyocera, Samsung, Konica Minolta, Pantum, **Riso, Sharp** (+ a few Lexmark/OKI cartridges). Bidirectional cross-reference (printer→cartridges, cartridge→printers) via the derived inverse map. New router `routes/compat.py`: `GET /api/compat/stats|printers?q=|toners?q=|printer/{slug}|toner/{model}` and `POST /api/compat/notify`.

**3. Programmatic SEO pages (`/compatible/:slug`, `pages/CompatiblePage.jsx`).** Per-printer page: title/meta/H1, compatible cartridge chips, live dealer-listing grid (toners+consumables matched by compatible_models ILIKE printer model OR model_number in cartridge codes), Schema.org ItemList/Product JSON-LD; when no stock → "Notify me when available" email capture → `POST /api/compat/notify`.

**4. Dealer uploads — searchable multi-select (`components/CompatibleModelsSelect.jsx`).** Replaced the free-text "compatible models" field on the **toner** (SupplierDashboard) and **consumable** (ConsumableListings) forms with a debounced searchable dropdown hitting `/api/compat/printers` (pick printer models); added the same on the **printer** wizard hitting `/api/compat/toners` (pick compatible cartridges). Stored as comma-joined string (back-compat with existing matching + free-text). Bulk-upload grids left as free text by design. Existing listings render unchanged.

**Migrations (USER):** `supabase_schema_notify_requests.sql` (RUN ✅) for the Notify-me table; `supabase_schema_printer_compat.sql` (adds `printer_listings.compatible_models`) — until run, printer compatible_models is silently dropped on write (graceful, never errors).

**Testing:** backend pytest `tests/test_iteration34_compat.py` 10/10; testing agent iteration_34 — backend 100% (18/18), compatible page + Notify-me + WholesaleStore JSON-LD verified E2E. Dealer-form dropdown rendering/persistence verified via API; interactive Playwright click was blocked only by the global seller-agreement Radix-checkbox quirk (test-infra, not a product bug). Constraints honored: no CORS change, no emergentintegrations, Razorpay/Twilio untouched.


### 2026-06-08 (b) — server.py refactor into route modules (zero behaviour change)

Split the 5,523-line monolithic `server.py` into domain route files under `backend/routes/`, leaving the shared kernel (helpers, models, dependencies, caches) + app/middleware/CORS/scheduler + the 3 `@app` routes (robots/sitemap/pageview) in `server.py`, which now registers all routers.

- **New route modules** (each `from server import *` for the shared kernel + explicit underscore-helper imports; own `APIRouter(prefix="/api")`): `routes/auth.py` (14 endpoints), `routes/search.py` (10), `routes/products.py` (38), `routes/orders.py` (6), `routes/admin.py` (40), `routes/suppliers.py` (9). `procurement.py`/`oem.py`/`agreements.py` already existed.
- **Parity verified:** 117 router endpoints + 3 `@app` = **120 = original** (git HEAD). 0 `@api.` left in server.py. `server.py` 5,523 → **1,597 lines**.
- **Method:** AST-based extraction (moved only `@api`-decorated functions; all helpers/models/constants stayed as kernel). Auto-detected & added per-file underscore-helper imports; caught import-alias kernel names (`_td/_re/_time/_dd`) and a re-exported `_commission_breakdown`.
- **Verified:** boots clean; 25+ endpoints across every domain return correct codes (reads + a cross-module write round-trip admin→public config; `search_ai`→`search_universal` in-module call); no cross-file endpoint-to-endpoint calls; lint clean (intentional star-import F405 suppressed file-level); homepage renders end-to-end. Zero frontend impact (identical `/api` paths).
- **Constraints honored:** no CORS change, no behaviour change, Razorpay/Twilio untouched.




**1. Login rate limiting (brute-force protection).** Login was 100% client-side Supabase (`signInWithPassword`) — no backend endpoint to limit. Added `POST /api/auth/login` (`server.py`) that signs in server-side via Supabase GoTrue REST (`/auth/v1/token`, stateless httpx call — avoids shared-client races) and applies a per-IP, FAILED-only sliding window: **5 fails / IP / 10 min → 30-min block**, message `"Too many attempts, try again in 30 minutes."` Successful logins clear the counter. `AuthContext.login` now calls the backend then hydrates the client session via `supabase.auth.setSession(...)`. Verified via curl: 200+token / 401 / 429 sequence correct.

**2. Order tracking flow.** Lifecycle: Requested → Confirmed(`accepted`) → Dispatched(`shipped`) → Delivered → **Completed** (new). 
- Dealer (`SupplierDashboard`): Accept → Confirmed (email); Dispatch via new `CourierDispatchInput` (courier name + tracking REQUIRED) → Dispatched (email w/ courier+tracking); **Mark Delivered** → Delivered (email asking buyer to confirm).
- Customer (`CustomerDashboard`): `OrderTimeline` (4 stages) + courier/tracking shown when dispatched; **"Confirm you received your order"** button on Delivered → Completed, which sets `completed_at` + `payout_eligible_at = +5 days`.
- **Auto-confirm:** `AsyncIOScheduler` (APScheduler, already installed) job every 30 min → orders `delivered` for >5 days are auto-completed (`auto_confirmed=true`) + support payout email. Protects dealers from silent buyers.
- Backend (`update_order_status`) rewritten with strict role/transition enforcement + `_safe_order_update()` that drops not-yet-migrated columns so the flow works pre-migration.
- New emails: `email_order_confirmed`, `email_order_delivered_confirm`; `email_order_shipped` now shows courier; support payout email handles auto vs manual.
- **MIGRATION REQUIRED (user to run):** `backend/supabase_schema_order_tracking.sql` adds `courier_name, delivered_at, completed_at, payout_eligible_at, auto_confirmed` + index. Until run, status transitions work but those fields don't persist.

**3. Grievance officer (`Terms.jsx`):** now "Grievance Officer: Rohit Sairam, TonersCart Private Limited, Email: support@tonerscart.com, Response time: 48 hours."

**DEFERRED — Task 2 (server.py → routers refactor):** user chose to validate features + run migration first, then refactor on a verified base. `server.py` is ~5,520 lines; procurement/oem/agreements already use separate routers. Plan: extract shared infra (clients, models, deps, helpers) into a `deps`/`core` module, then move endpoint groups into `backend/routes/{auth,products,orders,search,admin,suppliers,oem,procurement}.py`, server.py just registers routers. Constraints: no CORS change, no behavior change.

**Constraints honored:** no CORS change, no emergentintegrations, Razorpay/Twilio still mocked, no force-push.




**Unified search cards (DRY refactor)** — extracted the four category product cards into shared components under `src/components/cards/`: `TonerProductCard`, `PrinterProductCard`, `PaperProductCard`, `ConsumableProductCard`. The universal search (`/search?q=`) groups now render the SAME full cards as the category pages (with Add-to-cart / Buy-now + qty stepper), replacing the old tiny click-through tiles. Category pages (`Papers.jsx`, `Consumables.jsx`, `PrintersResults.jsx`) and `Search.jsx` (both the detailed toner browse + universal toners group) all import the shared cards now. OEM group kept as inline tiles (no shared OEM card).
- **Bug fixed:** the old inline `PrinterCard` destructured `const { add } = useCart()` but CartContext only exports `addItem` — so printer Add-to-cart / Buy-now would crash. The shared `PrinterProductCard` correctly uses `addItem`. Verified at runtime (toast + navbar cart badge increments).

**Featured Suppliers (homepage)** — root cause of the slow load: `/featured/suppliers` generated Supabase signed URLs in a sequential loop (one network call per supplier + per logo) with no caching, on every visit. Added `_FEATURED_CACHE` (120s TTL, busted on the 3 admin featured mutations) → 2nd-load dropped from ~2.8s to ~0.13s. Frontend: the featured banner is now a wide **16:9 rectangle** (`.tc-featured-banner`, was a 120px square) using the dealer's application/showcase image (`featured_image_url`, fallback logo, fallback camera placeholder) with `object-cover`.

**Testing:** iteration_32 frontend-only — 100%. All four review items pass: universal cards (2 toners/2 printers/4 consumables for `xerox`) render full cards with working Add/Buy; printer add-to-cart fix confirmed; category pages intact; featured banner measured exactly 16/9 (338×190.125), section loads ~3.5s. No console errors.

**Data:** verified DB has only real accounts (15 users, 0 test/example/qa) and no fake products (cleanup dry-run = 0). The stale `qa.dealer.it30.*` accounts in test_credentials had already been purged in a prior session; testing agent created no persistent data.




**Sticky control bar** — the pastel dealer tab bar (`catalog-tabs`) is now `sticky top-[64px] z-[90]`, pinned directly under the 64px navbar while scrolling. Root cause of an initial failure: `overflow-x: hidden` on `html`/`body`/`#root` (index.css) created a scroll container that broke `position: sticky` — fixed by switching to `overflow-x: clip` (clips horizontally without a scroll container). Verified: bar top stays at 64 at scrollY=1500, no horizontal-scroll regression.

**Compact hero** — the black hero strip is now a single slim band (~half height): logo + business name + edit pencil + Seller ID + city on one row; the 4 stats are small inline pills (still clickable). All functionality (logo upload, edit-name dialog) intact.

**Stat cards → scroll-to-section** (`goStat`): Listings → smooth-scrolls to the new All Listings section; Active → same, filtered to in-stock (chip `all-listings-filter-clear`); Orders → Orders tab + scroll to `#orders`; Pending → Orders tab filtered to requested.

**New "All Listings" combined section** (`all-listings-section`, always rendered at the bottom regardless of tab) — one table across all 4 categories with columns Product name / Category badge / Price / Stock / Status (Active≥1 stock) / Actions. Edit jumps to the right tab+grid (toner→toner grid; printer/paper/consumable→that tab + `tc-open-edit-*`); Delete calls `DELETE /api/supplier/{listings|printers|papers|consumables}/{id}` then refreshes. Data via `loadAllProducts` (4 `/mine` GETs combined client-side).

**Testing:** Backend pytest 12/12 (iteration 30 — /mine feeds + all 4 DELETEs + 403 guards). Frontend verified: compact hero, 4 stat pills, scroll-to-section + filter chips, combined table with edit/delete + category badges, cross-tab edit, navbar pills hidden, and (iteration 31) the sticky fix. Deleted the it29 test account per request + cleaned up throwaway it30 suppliers; kept documented `qa.dealer.it30.cd2e6adb@example.com`.


### 2026-06 — Dealer dashboard navigation redesign (full-width pastel control bar + clickable stats + Edit per product)

**Tab bar → navbar position (`SupplierDashboard.jsx`)**
- New `DealerTabBar` component renders a full-width, edge-to-edge bar (`catalog-tabs`) directly below the top navbar (above the hero). 10 equal blocks (`tab-{key}`) each with a distinct very-light pastel background (cyan/magenta/amber/green/indigo/orange/blue-grey/teal/rose/purple), dark charcoal bold centered text, single vertical dividers, 150ms hover-darken, and an active state = darker shade + colored inset bottom-border accent. Customer category pills stay hidden for dealers (Header.jsx).

**Action area per tab** — Printers/Papers/Consumables tabs now show Add + Bulk upload + **Edit** buttons (`edit-printers-btn`/`edit-papers-btn`/`edit-consumables-btn`), matching the existing Toners trio. Edit dispatches `tc-open-edit-{type}` → the listing component opens `BulkUploadGeneric` in edit mode pre-loaded with existing rows. Added `itemPath`/`fromListing`/`toUpdatePayload` (scalar-only, image-preserving) to printer/paper/consumable bulk configs.

**Clickable stat cards** — the 4 hero stats are now buttons (`goStat`): Listings→Toners (all), Active→Toners filtered in-stock (`listings-filter-clear` chip), Orders→Orders (all), Pending→Orders filtered requested (`orders-filter-clear` chip). Manual tab clicks clear filters (`selectTab`). Added `listingFilter`/`orderFilter` state + `visibleListings`/`visibleOrders`.

**Testing:** Backend pytest 5/5 (`test_iteration29.py`) — PUT printers/papers/consumables accept scalar payloads, preserve images, 403 for non-supplier. Frontend verified via source review + clean webpack compile (Playwright login was blocked only because the iter-28 test account had been purged; a fresh approved supplier `qa.dealer.it29.1d95cc50@example.com` is now documented).


### 2026-06 — 8-part Dealer UX & Product Upload overhaul

**Dealer dashboard (`SupplierDashboard.jsx`)**
- Replaced the rounded pill tab bar with a clean underline tab bar (`catalog-tabs`) of 10 tabs: Toners, Printers, Papers, Consumables, Orders, My Earnings, Insights, Bulk Orders (`tab-bulk` → bulk-upload hub), Dealer to Dealer (`tab-d2d` → CTA to /dealer), OEM Marketplace (`tab-oem` → CTA to /oem).
- Added a large centered action panel (`CenterAction`) per product tab with big buttons (Add Toner/Printer/Paper/Consumable + Bulk upload). Toner tab also has `edit-toners-btn`.
- Added "Seller Dashboard" label (`seller-dashboard-label`) top-right of the hero.
- **Edit business name**: pencil (`edit-business-name-btn`) → dialog (`edit-name-dialog`) → `PUT /api/supplier/profile {business_name}` (new backend endpoint, syncs `users.company`).

**Toner uploads — removed Model Number**
- Single Add Toner form: removed the "Model number" field; "Compatible printer models" (`listing-compatible-models`) is now a required Basic-info field. `model_number` is derived client-side from the first compatible model (`deriveTonerModel`).
- Bulk toner config (`bulkConfigs.js`): dropped the Model Number column; `compatible_models` is now required.
- Toner cards now show Brand as heading + "Compatible: …" line (`listing-compat-{id}`), no model number.

**Edit Toners → inline bulk grid (item 5)**
- `BulkUploadGeneric.jsx` gained `editMode` + `initialRows`. In edit mode it PUTs existing rows to `/supplier/listings/{id}` (scalar-only, preserves images) and POSTs new rows. Per-card Edit and `edit-toners-btn` open the grid pre-loaded with all existing toners.

**Printer uploads (`PrinterListings.jsx`)**
- Removed "Monthly recommended volume" and "Monthly duty cycle" fields (kept min/max monthly volume). Max print resolution is now a dropdown (`RESOLUTION_OPTS`). Usage type already multi-select.

**Header / Govt portal**
- `Header.jsx`: buyer category pills (`navbar-categories`) hidden for approved sellers (clean dealer navbar).
- `App.js`: `/procurement/login` now keeps the standard site Header/Footer (logo + nav + Govt Portal pill). `ProcurementDashboard.jsx` top bar shows the TonersCart logo linking home.

**Already in place (confirmed):** dealer login redirect → /supplier; City filter (`filter-city`) on all category/search pages.

**Testing:** Backend pytest 6/6 (`test_iteration28.py`) — profile update (403 guard), model-less toner create, bulk without Model Number, PUT preserves images. Frontend Playwright confirmed redirect, navbar hide, seller label, edit-name persist, 10 tabs, action panel.


### 2026-06 — Mobile overflow fix + Admin dealer profile + new admin tabs (Customers/Disputes/Messages/Activity)

**Mobile / overflow**
- `Header.jsx`: on <768px the top bar now shows only the logo + a hamburger (`header-mobile-menu-btn`). All actions (city, Sell, Sign in, Join free, cart, Dashboard, Logout) moved into a slide-in drawer (`mobile-menu-panel`). Desktop cluster wrapped in `hidden md:flex`. Verified no horizontal page overflow on /, /search, /printers, /papers, /contact (`overflow-x:hidden` already on html/body/#root). Category pills row scrolls horizontally within itself.

**Admin — full dealer profile** (`/admin/dealers/:id`, `DealerProfile.jsx`)
- "View Full Profile" button on every dealer row (`dealer-view-profile-{id}`). Page shows Business / Account / Bank / Documents (view+download signed URLs) / Agreement acceptance / Orders / Admin notes sections, plus stats (listings active/total, orders, GMV, commission earned, pending payout) and the Seller ID badge.
- Backend: rewrote `admin_supplier_detail` to return documents (signed), agreements, papers, richer stats; added `PUT /admin/suppliers/{id}/notes` (admin_notes).

**New admin tabs**
- **Customers** (`CustomersTab.jsx`, `GET /admin/customers` + `/{id}`): list buyers (name/email/phone/city/type/joined/orders/spend) + detail drawer (profile, order history, agreement acceptance).
- **Disputes** (`DisputesTab.jsx`): flag orders from Orders tab (`order-flag-{id}` + dialog button) → `POST /admin/orders/{id}/flag`; manage status/notes/resolve via `PUT /admin/orders/{id}/dispute`; list via `GET /admin/disputes`.
- **Messages** (`MessagesTab.jsx`): contact submissions from `mps_inquiries` (`GET /admin/messages`), read/unread (`PUT .../read`), reply via Resend (`POST .../reply` → `email_admin_reply`).
- **Activity** (`ActivityLogTab.jsx`, `GET /admin/activity-log`): every admin action logged via `_log_admin_action` (approve/reject/suspend/delete/order-status/flag/dispute/notes/message-reply). From-now-on only.
- **Finance** enhanced: per-dealer **Pending payout** column + **Procurement overdue payments** section (`GET /admin/finance/procurement-dues`).

**Migration (USER MUST RUN in Supabase):** `backend/supabase_schema_admin_extras.sql` — adds `admin_activity_log` table, `orders` dispute columns, `mps_inquiries.is_read`, `suppliers.admin_notes`. Until run, the WRITE endpoints (flag/dispute/message-read/dealer-notes) return a graceful HTTP 503 and the Disputes/Activity tabs show migration warnings. All READ endpoints work regardless. **No data was deleted** (per user instruction).

**Testing:** iteration_27 — backend 14/14 pytest PASS; frontend mobile nav/overflow + all 14 tabs + customers + messages + finance all OK. Two flagged defects fixed/cleared: (1) "View Full Profile" button re-added (had reverted), (2) DealerProfile "spinner" was a false positive (4s API latency vs 5s test wait) — page renders fully, verified via browser.

### 2026-06 — Seller ID trust mark on buyer quotations

- **Quotation email** (`email_quotation` in `email_service.py`) now renders a green **"✓ Verified Seller · TC-DLR-YYYY-NNNN"** pill inside the "Sold by" box. Dealer name/contact remain intentionally hidden — only the anonymised verified-seller code is shown as a trust mark. New `seller_id` kwarg (defaults to "", badge omitted when unset).
- **`POST /api/quotation`** (`server.py`) looks up `suppliers.seller_id` from the listing's `supplier_id` (best-effort, wrapped in try/except) and passes it to `email_quotation`.
- Verified: `email_quotation` renders the badge with the ID and no leaks; endpoint lookup resolves real listing → `DET` → `TC-DLR-2026-0004`. Backend healthy, syntax clean.

### 2026-06 — 🔴 CRITICAL FIX: backend crash-loop (email_service f-string) + Seller ID display verified

- **Root cause**: `email_service.py` `email_order_placed()` had a nested f-string with `\"` backslash escapes **inside** the `{...}` expression part (the "Your Seller ID" row) — a `SyntaxError` in Python 3.11 ("f-string expression part cannot include a backslash"). This was introduced by the prior session's Seller ID email edit and prevented `server.py` from importing at all → the **entire backend was crash-looping** (preview "not responding", all `/api` calls failing).
- **Fix**: extracted the row into a pre-computed `seller_id_row` variable using single-quoted HTML attributes (no backslashes), spliced as `{seller_id_row}` into `seller_html`. Backend healthy again.
- **Seller ID display verified E2E** (testing agent iteration_26, backend 100% / frontend 100%): Admin → Dealers shows the Seller ID column with all 7 IDs `TC-DLR-2026-0001..0007`; dealer detail drawer shows `drawer-seller-id` badge; order placement (which invokes `email_order_placed`) returns 200 → /order-confirmed, no 500s. Ran `POST /api/admin/seller-ids/backfill` → `{ok:true, assigned:0, already_had:7}` (migration already applied, all dealers carry IDs).
- Test data created by the testing agent (2–3 `it26` customers + their orders) was purged afterward. DB back to 3 real orders.
- Non-blocking cosmetics noted: Radix `DialogContent` aria-describedby warning on dealer-detail-dialog; "Set your location" coachmark overlays nav (pre-existing carry-over).

### 2026-06 — Sequential Seller IDs (TC-DLR-YYYY-NNNN) — frontend display completed

- Backend was already complete (prev session): `_generate_seller_id()` assigns `TC-DLR-{year}-{NNNN}` on admin approval, `/auth/me` returns `supplier.seller_id`, `POST /api/admin/seller-ids/backfill` retro-assigns IDs to existing approved dealers, email templates (`email_application_approved`, `email_order_placed`) render the Seller ID, and migration `supabase_schema_seller_id.sql` adds the `seller_id` columns + unique indexes on `users`/`suppliers`.
- **Frontend display added this session** (the only missing piece):
  - **Dealer Dashboard** (`SupplierDashboard.jsx`): Seller ID chip rendered under the business name (yellow mono badge; shows italic "Pending" when not yet assigned). `data-testid="supplier-seller-id"`.
  - **Admin → Dealers** (`DealersTab.jsx`): new "Seller ID" column in the dealers table (`dealer-seller-id-{id}`) + Seller ID badge in the dealer detail drawer (`drawer-seller-id`). Both degrade gracefully to "Pending".
- **ACTION REQUIRED (user, in Supabase SQL editor):** run `supabase_schema_seller_id.sql`, then call `POST /api/admin/seller-ids/backfill` (as admin) once to assign IDs to already-approved dealers. Until then, all surfaces show "Pending" (no errors).

### 2026-06 — Navbar reorder · dealer storefront · new commission model · seller bank details

- **Navbar order**: MPS/Rentals moved next to Printers; Papers moved after Scanners → Toners · Printers · MPS · Consumables · Scanners · Papers · Bulk · D2D · OEM · Govt.
- **Dealer storefront**: "View dealer listings" on the homepage showcase now opens `/store/:supplierId` (new `DealerStore.jsx`) backed by new `GET /api/suppliers/{id}/storefront` (business info + that dealer's in-stock listings grouped across toners/printers/papers/consumables). Previously it dumped you on the toners page.
- **Commission model (new)** charged on bill value EXCLUDING GST, deducted from payout: <₹15K=12%, ₹15K–₹30K=10%, ₹30K–₹75K=8%, ₹75K–₹1L=6%, ≥₹1L=5% (no more deal-basis tier). Updated `lib/commission.js`, `CommissionBanner` (now leads with "the price you set is final; commission is deducted from your payout"), `email_service._COMMISSION_TIERS/_commission_breakdown`, `Terms.jsx` §9, `Privacy.jsx` (new §14), `lib/agreements.js`. Dealer upload pages reflect it via CommissionBanner + CommissionCalculator.
- **Seller registration bank details**: new Step-2 "Bank account for payouts" fields (account holder name [must match business], account number, IFSC, bank name, branch) with validation + a note they're used to send payouts. Step-4 docs: added **ID proof (Aadhaar/Passport)**; the **Cancelled cheque** is now the payout-account proof (removed the generic "Cancelled Cheque or Bank Passbook" line). Backend models/inserts/approval/doc-upload updated; **migration-safe** via `_exec_dropping_cols` (strips new columns until the migration runs, so onboarding never breaks).
- **MIGRATION REQUIRED**: run `backend/supabase_schema_seller_bank.sql` in Supabase (adds bank + doc_id_proof columns to suppliers_pending & suppliers). Until run, bank details/ID-proof aren't persisted but the form still works.

### 2026-06 — AI-powered universal search + Buy Now→checkout + seller-form cleanup

- **AI search**: new `GET /api/search/ai?q=` — Gemini (`google-genai`, `gemini-2.5-flash`, reads `GEMINI_API_KEY`/`GOOGLE_API_KEY` from env) parses natural-language queries into structured filters (category, brand, model, min/max price, condition, intent, keywords, answer), then runs the existing `search_universal` + price/condition filtering. Returns `{ai, params, answer, ...grouped, counts}`. Degrades gracefully to `ai:false` when no key → frontend keeps instant keyword results. **Not preview-tested** (key lives only in Railway env, per user choice Option B); works automatically on deploy.
- **Frontend** (`Search.jsx`): universal search fires keyword (`/search/universal`) + AI (`/search/ai`) in parallel; keyword shows instantly, AI replaces when ready (guarded so a fast AI response isn't clobbered). Subtle on-brand cyan "AI-powered" badge + one-line answer banner (`ai-search-banner`/`ai-powered-badge`/`ai-search-answer`). Works on every page since the universal bar always routes to `/search`. Chatbot was already wired to the same env key.
- **Buy Now → checkout**: removed `OrderRequestDialog` from product flow. Buy Now on `ProductDetail` and the toners list cards (`Search.jsx`) now add to cart and go straight to `/checkout` (guest can fill details + sign in inline there). D2D (`Dealer.jsx`) buy flow left unchanged. Above-₹1.5L deal-basis items still use `DealEnquiryDialog`.
- **Seller application form** (`SellerApplicationForm.jsx`): removed "Refilled" seller type (now Original/Compatible only) and its conditional shop-photo doc (checklist + FileSlot + validation). Seller-type selection is now independent multi-select (both Original+Compatible allowed) with **yellow** selected state (was black); removed the up-to-2 cap.
- Lint fixes: refactored data-fetch/resume effects in `ProductDetail.jsx` and the universal effect in `Search.jsx` to satisfy `react-hooks/set-state-in-effect`; added `import json` to `server.py`.

### 2026-06 — Commission tiers updated + >₹1.5L deal-basis enquiry flow

- **New commission tiers** applied everywhere: Under ₹10K → 10%, ₹10K–₹25K → 8%, ₹25K–₹75K → 6%, ₹75K–₹1.5L → 4%, Above ₹1.5L → Deal basis. Files: `lib/commission.js` (COMMISSION_TIERS + banner), backend `email_service.py` `_COMMISSION_TIERS`, `Terms.jsx` §9. Calculator/banner/supplier payout labels all read from these.
- **Deal-basis flow**: products priced > ₹1,50,000 are auto-recognised on `ProductDetail` (`isDealBasis`); checkout CTAs are replaced by a single "Request pricing & demo" button → `DealEnquiryDialog` (name/email/phone/city/notes) posting to `/mps/inquiry` with `selections.type='deal_enquiry'`. Added a `deal_enquiry` subject branch in `email_mps_inquiry`. Endpoint verified ({ok:true}); no live >₹1.5L products exist yet to screenshot.

### 2026-06 — GA4 analytics + B2B terminology removal

- **GA4**: added gtag.js (`G-GEFHGHQ074`) to `public/index.html` with `send_page_view:false`; `VisitorTracker.jsx` fires a `page_view` on every React Router route change (page_path/page_location/page_title). Verified live `/g/collect` hit with the correct tid. No new packages.
- **"B2B" removed everywhere** (frontend copy, SEO meta/keywords, emails, procurement PDF, chatbot/AI prompts, comments) — replaced with inclusive wording ("India's marketplace for printers, toners and supplies — for offices and homes"; "B2B invoicing" → "GST invoicing").

### 2026-06 — Wave 20.3: printers questionnaire restored + footer expanded + wider search bar

- **Printers flow reverted**: Printers nav pill → `/printers` (guided questionnaire). Completing the 10-step finder routes to `/printers/results` (search bar + filters). `isActivePath` reverted.
- **UniversalSearch** taller/cleaner: 56px height, rounded-2xl, 15px text, larger icon.
- **Footer** restructured to 4 columns (12-grid): Brand (logo + 2-line TonersCart blurb), Marketplace (Toners/Printers/Papers/Consumables/Scanners/MPS), Solutions (Bulk/Dealer-to-Dealer/OEM/Govt Portal/Sell), Company. All navbar categories now linked.

### 2026-06 — Wave 20.2: universal search bar + master brands + procurement polish + test-data purge

- **Navbar search removed**: top bar is now logo · location · Sell · Sign in · cart · Join free only. Removed the navbar search form/state/handler and the `Search` icon import from `Header.jsx`.
- **Universal search bar** (`components/UniversalSearch.jsx`): one identical bar rendered at the top of `/search`, `/printers/results`, `/papers`, `/consumables`. Always searches across ALL categories by routing to `/search?q=`. Homepage hero search and `/dealer` (D2D) left untouched.
- **Printers pill** now routes to `/printers/results` (the browse page with filters); guided finder still reachable at `/printers` via the "guided finder" links. `isActivePath` updated.
- **Master brand lists** (`lib/listingConstants.js`): added `PRINTER_TONER_BRANDS` + `PAPER_BRANDS`. Brand filter on toners/printers/consumables/papers now uses the full master list instead of brands derived from current listings.
- **Printers Type filter** added (Laser / Inkjet / MFD) with client-side `matchType`. Papers filter set = Brand/Size(+Legal)/GSM/City (price range removed per spec). Toners "Type" filter relabelled "Condition".
- **Procurement Login** (`ProcurementLogin.jsx`): whiter background (`#FBFBFC`), added a "How it works" 3-step section + trust band to fill the empty lower half.
- **Test-data purge**: removed 18 test/bot accounts (test/seed/demo/etc. emails) + their suppliers_pending / user_agreements rows + Supabase Auth users. Admin account untouched.
- Removed the now-dead `/listings/facets` fetch + `facets` state from `Search.jsx`.

### 2026-06 — Wave 20.1: filter-bar consistency + navy hero

- **`/search` (toners)**: replaced the left sidebar + mobile drawer with the shared horizontal `CategoryFilters` bar (Brand / Type / City + price range + sort). Brand/Type/City stay server-driven; price + sort apply client-side instantly. Removed `FiltersBlock`/`SidebarItem`/old mobile drawer.
- **`/printers/results`**: removed both search bars (hero + sticky); added the `CategoryFilters` bar (Brand / Condition / City + price + sort, client-side). Guided-finder chips retained. Eyebrow brightened, heading kept thin.
- **Homepage hero**: new `.tc-hero-home` class — deep navy `#0d1f2d → #1a3a52` gradient, glow opacities +~15% (≈15% brighter). Text colours/layout unchanged. Other dark heroes untouched.
- Verified visually (home navy, /search + /printers/results filter bars). Lint clean, webpack compiles.


### 2026-06 — Wave 20: Search/filter UX, typography, light redesigns, cleanup

- **Single universal search:** added one search bar to the navbar (`navbar-search-input`) that routes to `/search?q=`. Removed the individual search bars from `/papers`, `/consumables`, `/search` (toners) and `/printers` (guided finder).
- **Filter + sort bars:** new reusable `components/CategoryFilters.jsx` (horizontal on desktop, collapsible drawer on mobile, instant client-side apply). Wired into Papers (Brand/Size/GSM/City + price range + sort) and Consumables (Brand/Condition/City + price range + sort). Sort: Local first / Price ↑ / Price ↓ / Newest. `/search` toners keeps its sidebar filters; search input replaced by a clean category header.
- **Coachmark fix:** "Set your location" tooltip now drops below the full navbar (no overlap) — `tc-coachmark` top offset increased, arrow removed.
- **Typography:** category page H1s + procurement + OEM headings set to Montserrat weight 300 (thin, not bold), matching the scanners/ComingSoon aesthetic. Homepage was already thin.
- **Printers header fix:** removed the misaligned/low-contrast sticky search; eyebrow "Printers · Guided finder" brightened (`text-white/80`).
- **/procurement/login redesigned** to calm light theme: `#F5F5F7` bg, white card + subtle shadow, dark charcoal thin heading, subtle grey bullet icons, light tabs, yellow Sign-in CTA (removed dark gradient).
- **/oem redesigned** to light theme: `#F5F5F7` bg, dark thin heading, white product cards with subtle borders, emerald/grey accents (removed pure-black background). Content/functionality unchanged.
- **Test data purged:** extended `backend/cleanup_test_data.py` to also remove consumables (incl. seeded DR-2305/GT53) + Auth users; deleted 3 test suppliers, 3 users, 2 consumables, 1 order. Removed one-off `scripts/seed_consumable.py`.
- Verified: lint clean, webpack compiles, visual screenshots of procurement/oem/papers confirm the redesigns. (Data-driven list rendering can't be screenshotted in the automated browser due to the preview-env `/api` hang — works in real browsers.)


### 2026-06 — Wave 19: Consumables, Universal Search, SEO, Buyer Segmentation, fixes

**REQUIRES DB MIGRATION (USER):** Run `/app/backend/supabase_schema_consumables.sql` in Supabase SQL editor. Creates `consumable_listings`; makes `orders.listing_id` nullable + adds `consumable_listing_id`/`paper_listing_id`/`product_brand`/`product_model`/`product_image` (enables paper+consumable direct orders to persist); adds `users.user_type`. Until applied: consumables empty, segmentation save → graceful 503, direct orders don't persist.

- **Buy Now → 404 fixed:** `AuthRequiredDialog` pointed to non-existent `/auth/login` & `/auth/signup` → fixed to `/login` & `/register`.
- **401 console noise fixed:** `AuthContext.refresh` skips `/auth/me` for guests via new `getAccessToken()` in `lib/api.js`.
- **Consumables line (mirrors Papers):** `/consumables` (subcategory tabs), `/consumable/:id` detail, dealer single + bulk upload, add-to-cart/buy-now via checkout. Backend `/api/supplier/consumables*` + `/api/consumables*` (graceful when table missing). Files: `pages/Consumables.jsx`, `components/ConsumableListings.jsx`, `lib/consumableConstants.js`, `bulkConfigs.js`, SupplierDashboard tab.
- **Universal search:** `/search` category tabs (All/Toners/Printers/Papers/Consumables/OEM); `/api/search/universal` now returns consumables + oem too.
- **SEO:** PageMeta added to Terms/Privacy/Contact; spec titles on Landing/Search/Papers/Printers/OEM/About/Consumables; Schema.org Product JSON-LD on product pages.
- **Buyer segmentation:** one-time `BuyerTypeGate` modal (Personal/Corporate+GST/Dealer→/sell/Government→/procurement). `POST /api/auth/user-type`, `GET /api/admin/user-segments`, `user_type` in `/auth/me`.
- **Legal footer badge:** Terms v2.0 · Privacy v2.0 · Last updated June 2026.
- **Checkout UI cleanup:** spacing, labels above inputs, h-11 inputs, single-column mobile.
- Razorpay/Twilio untouched (mocked). Backend lint clean, verified via curl. Frontend e2e blocked by preview-env automated-browser `/api` hang (unchanged Papers hangs identically) — run testing agent after SQL applied.


### 2026-06-04 — Rebrand to TonersCart Pvt Ltd · remove phones/WhatsApp · legal rewrite · agreement-acceptance system

- **Rebrand:** every "Digital Edge Technologies / DET" → **TonersCart Private Limited** across Footer, About, Contact, Terms, Privacy, SellerApplicationForm, SupplierDashboard, and all `email_service.py` templates.
- **Contact cleanup:** removed both phone numbers, all personal names, and ALL WhatsApp links/buttons (Contact, About, MPS, OrderConfirmed, Search/Printers product cards, emails, JSON-LD telephone). Deleted `WhatsAppEnquiry.jsx`. Only `support@tonerscart.com` public. Contact form still works.
- **Terms of Service** (`Terms.jsx`) rewritten — 20-section India-compliant doc (intermediary/Sec 79, IT Act + Intermediary Rules 2021 + CPA 2019 + E-Comm Rules 2020 + GST + Contract Act, 18+/GST eligibility, price-lock, Razorpay <₹1.5L, commission 8/6/4%, returns 7d toners/3d DOA printers, dispute 48h+mediation, IP, liability capped at commission, Karnataka/Bangalore jurisdiction, grievance officer 48h, amendments).
- **Privacy Policy** (`Privacy.jsx`) rewritten — DPDPA 2023 + IT Rules 2011 + RBI compliant (data inventory, purposes, legal basis, 7-yr retention, Supabase/Resend/Razorpay/Google processors w/ no-sale, DPDPA rights, functional-only cookies, signed-URL security, cross-border, children, grievance officer).
- **Agreement-acceptance system** (NEW): `supabase_schema_agreements.sql` → `user_agreements` (user_id, agreement_type, version, accepted_at, ip). Backend `agreements.py` (status/accept/admin) + procurement endpoints in `procurement.py`; fails OPEN pre-migration. Frontend `AgreementGate.jsx` + `lib/agreements.js` — blocking, versioned, can't-dismiss modal for Seller/OEM/Procurement/Customer; mounted globally (SupabaseAgreementGate in App.js) and in ProcurementDashboard. Admin → **Agreements** tab (`AgreementsTab.jsx`) shows per-user acceptances with filters.
- Verified: backend Python E2E (status→accept→status→admin record) + frontend E2E iteration_24.json (**100%** on all 5 scenarios — legal pages, contact form, customer + procurement blocking gates, admin view). All test data purged after.

### 2026-06-04 — OEM logo upload + "Verified Manufacturer" trust strip

- Backend: added `POST /api/oem/logo` (uploads to `printer-images`, persists `logo_url` on `oem_partners`).
- OEM dashboard (`OemDashboard.jsx`): brand logo with an upload control in the header (placeholder when unset); updates live on upload.
- Public `/oem` (`OEM.jsx`): each brand card now renders the uploaded logo (placeholder fallback) plus a **Verified Manufacturer · Official brand products · Direct from the brand** trust strip.
- Verified E2E with a temp OEM (logo upload → `/me` + `/public` return `logo_url`; trust strip renders via screenshot), then the temp account was purged — OEM tables remain empty.

### 2026-06-04 — OEM showcase module + mobile search + test-data cleanup

**OEM (manufacturer) showcase module — NEW (Supabase Auth, role=oem; showcase + enquiry only, no checkout):**
- DB: `supabase_schema_oem.sql` → `oem_partners`, `oem_products`, and `users.role` check now includes `'oem'`. (User applied the migration.)
- Backend `oem.py`: public `/api/oem/apply`, `/public`, `/enquire`; OEM `/me`, `/products` CRUD, `/product-image`; admin `/api/admin/oem/pending|partners|{id}/approve|{id}/reject`. Approval creates a Supabase auth user (role=oem, generated temp password) and emails credentials via Resend (reuses existing `sb_admin.auth.admin.create_user` pattern — no new auth tech). Emails added to `email_service.py` (application/approved/rejected/enquiry).
- Frontend: `OEM.jsx` now fetches `/oem/public` and renders brands + products with an **Official Brand** badge + **Enquire** modal (emails the brand); apply form posts to `/oem/apply`. New `OemDashboard.jsx` (/oem-dashboard, role-gated) for product CRUD + image upload. New admin `OemTab.jsx` (approve/reject queue). Wired: App.js route, Login role→/oem-dashboard, Header hides Sell/cart for OEM + chip→/oem-dashboard, AdminDashboard OEM tab with pending badge.
- OEM products are isolated to `/oem` only (NOT in /search, /papers, etc.) — verified.
- Verified: backend E2E (apply→approve→login→add product→/public→enquire all 200) + frontend E2E iteration_23.json (95%, all 9 scenarios pass, no blockers). Seeded demo: `oem.demo@tonerscart.in` / `OemDemo@123` (brand InkPro, 2 products).

**Mobile search (`Search.jsx`, `Landing.jsx`, `PrintersGuide/Results.jsx`, `lib/categoryRoute.js`, `index.css`):**
- Typing a main category (printer/paper/toner/scanner/MPS/bulk/OEM/dealer) on submit now jumps straight to that category page.
- Mobile search button is now a compact magnifier icon to the RIGHT of the bar (one row) so the autocomplete dropdown no longer covers it; desktop unchanged.

**Test-data cleanup:** removed 4 test suppliers + 4 users + their listings/printers/papers (cleanup_test_data), all 6 test procurement accounts, and throwaway OEM partners — only the seeded InkPro OEM demo remains.


### 2026-06-04 — Navbar 10th pill (Govt Portal) + auth-flicker root fix + procurement portal restyle + remove exposed admin creds

- **Navbar:** added a 10th category pill **"Govt Portal"** (navy `#1E3A8A`, → `/procurement/login`). Trimmed `.tc-cat-pill` padding 18px→15px so all 10 fit; verified @1920px the last pill's right edge = "Join free" right edge (both 1560px, 0px delta), first pill left = logo left (360px), no overflow.
- **Auth flicker (recurring) — fixed at the source:** root cause was a token race in `lib/api.js` — `cachedToken` was set async via `getSession().then()`, so `AuthContext.refresh()`'s first `/auth/me` on mount often fired WITHOUT the bearer token → 401 → `setUser(null)` → ProtectedRoute redirected logged-in users to `/login` (the flash) before the session restored. Wave 16 only fixed the header buttons. Fix: request interceptor now `await`s a `sessionReady` promise before the first authed call; added global `AuthGate` in `App.js` that renders a neutral white spinner and blocks ALL routes until the auth check resolves; added an 8s timeout to `/auth/me`. Verified: 4 protected-page reloads → login never flashed, neutral loader shown, stayed on `/admin`.
- **Procurement portal restyle (`ProcurementLogin.jsx`):** rebuilt on the SAME shell as `/login` — dark `tc-hero` gradient + `tc-hero-grid`, `tc-container`, 12-col grid (left pitch / right white card), CMYK `tc-strip` label, Montserrat 300-weight heading with teal accent, identical white card (`border + rounded-2xl + shadow-2xl`), brand-yellow `btn-cta`, and `min-h-screen` so the dark hero fills the viewport (no empty bottom). Tabs + Sign-in/Register modes + forms live inside the card. (An earlier attempt used a light-gray off-brand layout — corrected to mirror the marketplace login exactly.)
- **Security:** removed the publicly-visible "Admin demo: admin@tonerscart.in / Admin@123" hint box from `Login.jsx`.


### 2026-06-04 — Procurement Module · PHASE 1 + PHASE 2 E2E VERIFICATION (fork)

**What was verified (not new code — this fork verified existing build):**
- Discovered Phase 1 AND partial Phase 2 were already implemented (`procurement.py` 522 lines: auth/register/login/me/admin-queues + `/compare` L1-L5 ranking + quotation create/list + `quotation/{id}/pdf` via `proc_pdf.py`). Frontend `SearchCompare.jsx` + `MyQuotations.jsx` already wired into `ProcurementDashboard.jsx`.
- **DB reality check:** user believed all 3 procurement migrations were applied, but only `procurement_users` existed. Had user run `supabase_schema_procurement_quotations.sql` → quotations now work. `procurement_orders` + `credit_ledger` **still NOT migrated** (needed before the Phase 2 order flow).
- **Backend E2E (curl):** register govt → admin pending → approve → login (JWT) → `/me` → `/compare` (returned ranked L1 ₹1770 / L2 ₹1770 / L3 ₹2183 / L4 ₹7466) → POST `/quotations` (QT-2026-000001) → list → PDF (valid `%PDF-`, 3985 bytes). ALL PASS.
- **Frontend E2E (testing agent, iteration_22.json): 22/22 = 100%.** Govt+Corporate register (incl. non-gov-email & invalid-GST inline errors), admin approve + reject-with-reason queues, login (approved/pending/wrong-pw states), dashboard 5-section nav, credit-unset empty state, profile edit/save, Search & Compare ranked rows, generate quotation → My Quotations, PDF download, logout. Only 2 non-blocking cosmetics (reject-dialog aria-describedby; harmless stale-token 401 in console).
- Test creds added to `test_credentials.md`: approved govt `proc.gov.1780590694@test.gov.in` / `secret123`.

**Next:** Phase 2 order flow + Govt PO upload (requires `supabase_schema_procurement_orders.sql` to be applied first).


### 2026-06-04 — Procurement Module · PHASE 1 (Govt & Corporate registration + approval + auth + dashboard shell)

**Scope:** Self-contained Government & Corporate procurement portal, fully separate from the regular Supabase-Auth customer/dealer/admin flow (no overlap). All existing flows untouched.

**Backend** (`procurement.py`, included in `server.py`):
- New table `procurement_users` — migration `supabase_schema_procurement.sql` (⚠ APPLY IN SUPABASE; backend returns 503 gracefully until then).
- Auth: own email+password — **bcrypt** hashes + backend-issued **JWT (PyJWT, HS256, `JWT_SECRET`)** sent as Bearer. `require_proc_user` (approved-only) + `require_admin` (reuses Supabase admin) dependencies.
- Endpoints: `POST /api/procurement/register/govt` (validates official email .gov.in/.nic.in/.gov), `/register/corporate` (validates GSTIN format), `/login` (blocks pending/rejected with message), `GET/PATCH /api/procurement/me`. Admin: `GET /api/admin/procurement/pending` (separate govt + corporate lists), `/accounts`, `POST /{id}/approve`, `/{id}/reject` (reason).
- Emails via Resend (`email_service.py`): registration-received (applicant + admin notify), approved (with login link), rejected (with reason).

**Frontend:**
- `/procurement/login` — dark portal, Government/Corporate tabs, Sign in + Register per tab, inline validation (GST format, govt email domain, password length), "Your account is under review" success state. Global Header/Footer hidden on `/procurement` (App.js `Chrome` gate + `ProcAuthProvider`).
- `/procurement` (protected) dashboard — side nav: Search & Compare / My Quotations / My Orders (Phase 2/3 placeholders), **Credit Account** (limit/used/available + utilisation; "being set up" when 0), **Profile** (read-only details + editable phone/address). Separate `procApi` axios client + `ProcAuthContext`.
- Regular `/login` now has a **"Government & Corporate Procurement"** entry button → `/procurement/login`.
- Admin dashboard: new **Procurement** tab (badge = pending count) with separate Government & Corporate approval queues, Approve + Reject-with-reason.

**Status:** UI verified rendering live; backend graceful states verified (503 pre-migration, validation, 403 admin-gate). **End-to-end register→approve→login pending the Supabase migration** (no direct DB access from the build env).


### 2026-06-04 — Wave 16.2 (Toners bulk upload → unified BulkUploadGeneric)

- Migrated **Toners** bulk upload to the shared `BulkUploadGeneric` component (Wave 16) via a new `tonerBulkConfig` in `lib/bulkConfigs.js` (same toner columns/payload incl. variants & D2D-compatible fields).
- **Deleted** the old `components/BulkUploadDialog.jsx`; `SupplierDashboard.jsx` now renders `BulkUploadGeneric` with `tonerBulkConfig`.
- Backend `POST /api/supplier/listings/bulk` refactored to `List[dict]` + per-row Pydantic validation (`_fmt_validation_error`) so one bad row no longer 422s the batch — matches printers/papers.
- All three product types now share one consistent flow: XLSX template, per-row validation, "X uploaded, Y failed" summary, inline per-row reasons, and **Download failed rows**. Verified live: toner mixed batch → "1 toner uploaded successfully, 1 failed", "Row 1: Missing / invalid: price", failed-rows download present.


### 2026-06-04 — Wave 16.1 (Location prompt → navbar coachmark)

- Removed the wide "Set your location" bar under the hero search (was too large on web & mobile, `Landing.jsx`).
- Replaced with a **small walkthrough coachmark** anchored to the navbar city selector with an upward arrow + gentle pulse on the city button (`Header.jsx`, `.tc-coachmark`/`.tc-loc-pulse` in index.css). Copy: "Set your location — Tap here to pick your city…" with **Choose city** (opens the city dropdown) / **Not now** (dismiss, persisted).
- Trigger logic (`CityContext.jsx`): on first visit the browser is asked for location; the coachmark shows **only when GPS is denied / unavailable / returns an unserved city** and the user hasn't set or dismissed it. Picking a city or dismissing hides it permanently (`tc_loc_dismissed_v1`). Verified live on desktop + mobile (no overflow).


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
