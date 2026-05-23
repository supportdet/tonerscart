# TonersCart — Product Requirements (Supabase edition)

## Vision
B2B marketplace for printer toners in India. Buyers search by toner model,
compare verified suppliers (city, price, Original/Compatible), and send
order requests. No payments — direct trade.

## Roles
1. **Customer** — searches catalog, places order requests, tracks orders.
2. **Supplier** — must be **admin-approved** before listing. Picks toner from
   the catalog, sets price/stock/Original-or-Compatible/image, manages orders.
3. **Admin** — approves/rejects supplier applications, sees all stats.

## Architecture (post-Supabase migration, 2026-05-03)
- **Auth:** Supabase Auth (email + password). Tokens are validated server-side
  via the Supabase Python SDK.
- **Database:** Supabase Postgres. Six tables (`users`, `toner_master`,
  `suppliers_pending`, `suppliers`, `listings`, `orders`) with RLS enabled.
- **Storage:** Supabase Storage `product-images` bucket — public read, authenticated write.
- **Backend:** FastAPI (`/app/backend/server.py`) — thin layer that uses the
  service-role client for protected ops. AI chat (Claude Sonnet 4.5) endpoint stays.
- **Frontend:** React + Tailwind, mobile-first responsive. Uses `@supabase/supabase-js`
  for auth + storage uploads, axios with Bearer token for backend calls.

## Core flows
1. **Customer signup** → `/api/auth/signup-customer` → instant login.
2. **Supplier signup** → `/api/auth/signup-supplier` (collects: business_name,
   contact_person, phone, email, city, gst_number, annual_turnover,
   business_address) → creates auth user + `suppliers_pending` row (status=pending) → user
   can sign in but `/supplier` shows "Application under review".
3. **Admin approval** → `/admin` shows pending applications → click Approve →
   row moved to `suppliers` table → supplier can now create listings.
4. **Supplier creates listing** → picks toner from catalog, enters price/stock,
   chooses **Original** or **Compatible**, optionally uploads image → image
   goes to `product-images/<user_id>/<ts>.<ext>` → public URL stored in `listings.image_url`.
5. **Buyer searches** → `/api/listings/search?q=...` returns rows with
   supplier_name, supplier_city, toner_type — UI shows colour-coded
   ORIGINAL (green) / COMPATIBLE (blue) badge.
6. **Order request** → customer sends; supplier accepts → ships (tracking) → delivers.

## What's been implemented
### 2026-05-02 — MongoDB MVP (deprecated)
Removed in favour of Supabase architecture.

### 2026-05-03 — Supabase migration ✅ (36/36 backend tests pass)
Replaced JWT custom auth with Supabase Auth + Postgres + Storage. See iteration_3.json.

### 2026-05-03 — v2 supplier onboarding & admin docs ✅ (46/46 tests pass)
**Schema additions** (run via SQL editor, see `supabase_schema_v2.sql`):
- `listings.toner_type` check expanded to include "Refilled"
- `suppliers_pending` + `suppliers` extended with: `pan_number`, `state`, `pincode`,
  `cities_served[]`, `seller_types[]`, `compatible_brands[]`, `years_in_business`,
  `testing_before_delivery`, plus 6 doc-path columns
  (`doc_brand_authorization`, `doc_shop_photo`, `doc_gst`, `doc_pan`, `doc_bank_proof`,
  `doc_address_proof`) and `ai_check` (jsonb)
- New private bucket `supplier-documents` with owner-folder RLS policies

**Backend additions:**
- `POST /api/auth/supplier-documents` — supplier patches doc paths after upload
- `GET /api/admin/suppliers/{id}/documents` — admin gets short-lived (5 min) signed URLs + AI check verdicts
- `email_service.py` — Resend-backed transactional emails (fires on signup → support inbox + applicant confirmation; on approve → applicant; on reject → applicant with reason). No-ops cleanly if `RESEND_API_KEY` missing.
- `ai_check.py` — Gemini 2.5 Flash vision (Emergent LLM key) verifies each uploaded document is clear/legible; result stored in `suppliers_pending.ai_check`
- `signup-supplier` handler now accepts the full extended payload and triggers email + AI check on submit
- approve/reject now copy all the new supplier fields and trigger emails

**Frontend additions:**
- `RoleChooserPopup` — first-visit blurred-backdrop popup (Buyer / Seller cards). Skipped once dismissed (localStorage flag)
- Header: removed "Admin" nav link entirely (admin reaches `/admin` only by URL)
- Glassmorphism search bar on landing hero (translucent white over dark gradient)
- Multi-step supplier registration (`Register.jsx`):
  1. **Basics** — account email/password + contact + city/state/pincode + cities served
  2. **Business** — business name, GST, PAN, turnover, years, address
  3. **Seller types** — choose up to 2 of Original / Compatible / Refilled, conditional sub-questions (compatible brands, "test before delivery" pledge)
  4. **Documents** — conditional uploads (Brand Authorization for Original, Shop photo for Refilled) + GST/PAN/Bank/Address proofs
  Files upload directly from browser to private `supplier-documents/<uid>/...` bucket using the supplier's auth session, then paths are patched server-side.
- Admin review dialog upgraded to show seller types, compatible brands, cities served, all docs as clickable signed-URL chips with AI clear/unclear/skipped badges + per-doc note
- SupplierDashboard listing form + Search filters + product card colors all support Refilled (amber)

## Next / Backlog
- **Resend email** for supplier approval/rejection notifications + order updates (waiting on RESEND_API_KEY)
- Bulk CSV upload for supplier products
- Supplier ratings / reviews
- Order export to CSV / GST invoice helper
- Twilio OTP phone login (currently email/password only)

### 2026-05-03 (afternoon) — Final 4 bug fixes ✅
1. **Search dropdown z-index** — `.tc-suggest` raised to z-index 200 and `.tc-search-shell` to z-index 60, so autocomplete now floats cleanly above the hero copy on landing.
2. **Supplier-registration "404"** — root cause was a stale Supabase session + ProtectedRoute race after navigate. Fix: in `Register.jsx`, sign-out first, label every step (`creating account` / `signing in` / `uploading <field>` / `saving documents`), surface the failing stage in the toast, and `await refresh()` before `navigate("/supplier")`. Verified end-to-end via Playwright (account created, lands on "Application under review" page).
3. **Guest cart flow** — already correct in code; verified via Playwright that an unauthenticated user can `Add` two items, the header badge increments, `/cart` renders the rows, and `/checkout` is the only step that asks for login. `Buy` keeps requiring auth (uses `/api/orders` directly).
4. **Google sign-in "Unsupported provider"** — added `REACT_APP_GOOGLE_AUTH_ENABLED` flag in `frontend/.env` (default `false`). When false, the Google buttons on `/login` and `/register` are hidden entirely. `AuthContext.signInWithGoogle` now translates Supabase's "provider is not enabled" / "unsupported provider" into a friendly toast. **To enable Google sign-in:**
   1. Open Supabase dashboard → Authentication → Providers → Google → toggle **Enable**.
   2. Add OAuth client id + secret from Google Cloud Console (Authorized redirect URI: `https://mlvtaozdosufrhzhvgdg.supabase.co/auth/v1/callback`).
   3. Set `REACT_APP_GOOGLE_AUTH_ENABLED=true` in `frontend/.env` and restart frontend.

### 2026-05-03 (evening) — Guest-first checkout + cleanup ✅
**Buyer flow is now 100% guest-first.** A buyer can browse, Add to cart, open the single-item Buy dialog, navigate /cart and /checkout *without any sign-in*. The only sign-in step is the inline "Quick sign-in" section that appears at the bottom of the checkout form (and inside the single-item Buy modal) when the user is not authenticated. On submit, the frontend silently calls `/api/auth/signup-customer`; if Supabase responds "already registered", it falls through to `login()` — so the same email + password works for new and returning buyers. Verified end-to-end via Playwright (2 items → /checkout → guest fills email/password → 2 `/api/orders` POSTs succeed → lands on /customer with success toast, zero 4xx/5xx).

**Supplier registration:** removed the noisy stage-prefixed error toast — single clean error message only on real failure. Sign-out is still performed before submit to clear any stale session, and `await refresh()` runs before `navigate("/supplier")` to avoid the post-submit ProtectedRoute race.

Files: `frontend/src/pages/Search.jsx`, `frontend/src/pages/Checkout.jsx`, `frontend/src/components/OrderRequestDialog.jsx`, `frontend/src/pages/Register.jsx`.

### 2026-05-03 (night) — Unified auth + role-by-action refactor ✅
**Single signup / login for everyone.** Removed buyer/supplier signup split. New users default to `users.role='customer'` (presented as "buyer" in the UI). The role chooser popup on landing is **gone** (no longer rendered in `App.js`).

**Becoming a seller is now decided by action, not signup.** Logged-in users click **Sell** in the navbar → land on `/sell` → smart router by application status:
- No application → multi-step `SellerApplicationForm` (no email/password fields — user is already authenticated). On submit, calls new `POST /api/auth/apply-seller` which creates the `suppliers_pending` row but **does not change `users.role`**.
- `application_status === 'pending'` → "Application under review" panel.
- `application_status === 'rejected'` → red rejection banner + the form pre-loaded for re-apply.
- `users.role === 'supplier'` → redirect to `/supplier`.

**Admin approval is the only path that flips `users.role`.** The `/api/admin/suppliers/{id}/approve` endpoint now updates `users.role='supplier'` after copying the application into `suppliers`. Reject keeps `users.role='customer'` so the buyer can re-apply.

**`/auth/me` now returns `application_status`** (`pending` | `rejected` | `null`) regardless of role, derived from `suppliers_pending`. This drives both the `/sell` smart router and the seller-state navbar.

**Navbar is role-driven:**
- Guest: `Browse | Sell | Sign in | Join free` (cart icon visible)
- Buyer: `Browse | Sell | Orders` (cart icon visible)
- Approved seller: `Browse | My stock | Orders` (no cart, no Sell — they're already a seller; "My stock" → `/supplier#listings`, "Orders" → `/supplier#orders`)
- Admin: `Browse | Admin`

**Other fixes shipped in the same pass:**
- `OAuthCallback.jsx` — robust 8-second polling for the post-Google session, no premature "Sign-in failed" toast. Routes to `?next=` if provided, else by role.
- `Register.jsx` collapsed from 400+ lines to a single buyer-only form with Google + email. Better duplicate-email message: "This email is already registered. Try signing in instead."
- `Login.jsx` honours `?next=` for sign-in-then-go-back flows from `/sell`.
- `AuthContext` no longer exports `signupSupplier` (the only path now is `/api/auth/apply-seller`).

**Verified end-to-end via Playwright:** new buyer signup (`newbuyer-839842@test.com`) → `/search` → click `Sell` → `/sell` → submit application → "Application under review" → admin approves via API → re-login → lands on `/supplier` with navbar `Browse | My stock | Orders`, cart icon hidden, `users.role='supplier'`, `application_status=null`. **Zero 4xx/5xx responses across the entire flow.**

Files touched: `backend/server.py`, `frontend/src/App.js`, `frontend/src/pages/Register.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Sell.jsx` (new), `frontend/src/pages/OAuthCallback.jsx`, `frontend/src/components/Header.jsx`, `frontend/src/components/SellerApplicationForm.jsx` (new), `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/SupplierDashboard.jsx` (anchor IDs).

### 2026-05-04 — Sellers can buy + form polish ✅
- **Sellers can also browse/buy** — `users.role==='supplier'` is now allowed to place orders. Backend `POST /api/orders` accepts both `customer` and `supplier` roles. Header shows the cart icon for everyone except admins. `Search.onBuy` only blocks admins now.
- **Compact OrderRequestDialog** — width capped at `max-w-md`, content area `max-h-[60vh] overflow-y-auto` so even on 768px-tall viewports the modal never overflows. Quantity stepper + sticky footer with estimated total. Inline guest "Quick sign-in" sits inside the scroll area.
- **Indian validation on Seller application:**
  - Phone: `/^(?:\+?91[-\s]?)?[6-9]\d{9}$/` with inline error message.
  - State: dropdown of all 28 states + 8 UTs (mandatory).
  - Primary city: dropdown of `KNOWN_CITIES` (mandatory).
  - Pincode: 6 digits, first digit 1-9 (mandatory).
  - GSTIN: 15-character regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` (mandatory, auto-uppercased).
  - PAN: `^[A-Z]{5}[0-9]{4}[A-Z]$` (mandatory, auto-uppercased).
  - Years in business, annual turnover, business address — all mandatory.
  - Cities served must include at least one city.
  - Compatible-brands list mandatory if Compatible seller type selected.
- **Documents are all mandatory** — GST, PAN, Bank proof, Address proof always; Brand Authorization for Original; Shop photo for Refilled. Submit button is disabled until every required doc slot has a file. Updated UI labels with "*" markers and "Required" hints.
- **Listing creation requires an image** — `SupplierDashboard` listing form blocks publish unless an image is uploaded. Drop-zone goes emerald on selection.

Files: `backend/server.py`, `frontend/src/components/Header.jsx`, `frontend/src/components/OrderRequestDialog.jsx`, `frontend/src/components/SellerApplicationForm.jsx`, `frontend/src/pages/Search.jsx`, `frontend/src/pages/SupplierDashboard.jsx`.

### 2026-05-04 (evening) — Printers + MPS guided finder ✅
**New product type: Printers.** Full CRUD:
- SQL migration: `/app/backend/supabase_schema_printers.sql` — created two tables (`printer_listings`, `mps_inquiries`) + public bucket `printer-images` (applied by user in Supabase dashboard).
- Backend endpoints: `POST /api/supplier/printer-image` (multipart upload via service role — bypasses storage RLS), `POST /api/supplier/printers`, `GET /api/supplier/printers/mine`, `DELETE /api/supplier/printers/{id}`, `GET /api/printers` (public browse with filter params), `POST /api/mps/inquiry`.
- `/printers` browse page mirrors the Toners search: top-right chips for active filters, Condition filter (Brand New / Refurbished), free-text search, city-scoped.
- Dealer dashboard now has **Toners / Printers** tabs. Each tab has its own Add + list UI. Printers upload is image-mandatory; validators: brand, model, price, stock, usage, category, color, optional multi-select paper sizes / functions / connectivity.

**MPS Guided Finder at `/mps`** — single page SPA, multi-step flow with progress bar, forward / backward smooth transitions (`tc-step-fwd` / `tc-step-back` keyframes in `index.css`), auto-advance on single-select, `Next` button on multi-select, branching questions by usage type:
- Usage → Category (branches by usage) → [Paper sizes if commercial / print shop] → Color → Functions → Monthly volume (branches by usage) → Connectivity (multi) → Special features (multi, branches by usage) → Printer count.
- `count > 10` → navigates to `/mps/contact` with selections carried in `location.state`. Contact form POSTs `/api/mps/inquiry` → saved to `mps_inquiries` + Resend email to `SUPPORT_INBOX`.
- `count ≤ 10` → navigates to `/printers?usage_type=...&category=...&color=...&function=...&paper_size=...&connectivity=...&feature=...&min_volume=...&max_volume=...&city=...` — listing page instantly filters.

**Header nav updated:** `Toners · Printers · MPS` for everyone; Sell for buyers; My stock + Orders for sellers; Admin for admins. Mobile drawer mirrors the same.

**Verified end-to-end via Playwright + curl (zero 4xx/5xx):**
- Approved seller → dashboard → Printers tab → Add printer with image → "Printer listed" toast → row appears in DB.
- Guest → `/mps` → answers 8 steps → `count=1-5` → `/printers?...` with 7 URL params → 1 printer shown matching all filters.
- Guest → `/mps` → `count=50-100` → redirected to `/mps/contact` → submits → `mps_inquiries` row created → Resend email sent.

Files: `backend/server.py`, `backend/email_service.py`, `backend/supabase_schema_printers.sql` (new), `frontend/src/App.js`, `frontend/src/components/Header.jsx`, `frontend/src/components/PrinterListings.jsx` (new), `frontend/src/pages/SupplierDashboard.jsx`, `frontend/src/pages/MPS.jsx` (new), `frontend/src/pages/MPSContact.jsx` (new), `frontend/src/pages/Printers.jsx` (new), `frontend/src/index.css`.

## Files of reference
- `/app/backend/server.py` — All API endpoints
- `/app/backend/supabase_client.py` — Service-role + anon clients
- `/app/backend/supabase_schema.sql` — Tables, RLS, storage bucket
- `/app/backend/seed_supabase.py` — Admin + toner_master seeder
- `/app/frontend/src/lib/supabase.js` — Browser supabase client
- `/app/frontend/src/lib/api.js` — Axios with Bearer token interceptor
- `/app/frontend/src/context/AuthContext.jsx` — Supabase auth state
- `/app/frontend/src/pages/Register.jsx` — Customer + supplier signup with new fields
- `/app/frontend/src/pages/SupplierDashboard.jsx` — Listings + image upload + orders
- `/app/frontend/src/pages/AdminDashboard.jsx` — Approval queue


### 2026-05-22 — Emergent badge removal + City dropdown z-index ✅
- Removed `<script src="https://assets.emergent.sh/scripts/emergent-main.js">` from `frontend/public/index.html` (eliminates "Made with Emergent" watermark badge).
- Bumped sticky header z-index `z-50 → z-[100]` in `Header.jsx` and city dropdown `z-index: 80 → 200` in `index.css` so the city dropdown sits cleanly above the hero search shell (`z-index: 60`).
- Confirmed "Now serving Pan India" copy is already in `Landing.jsx` (line 58); deployed site must be re-published from GitHub to reflect.


### 2026-05-22 — Landing v2 + Featured Suppliers + Business Logo ✅
**Landing page (`pages/Landing.jsx`, `index.css`):**
- New hero copy: H1 → "India's #1 B2B marketplace for printers & toners"; subtitle shortened to "Compare verified suppliers, real stock, better prices — no middlemen."
- Added 4 popular-model chips below the search bar (HP 88A, Canon 337, Brother TN-2365, Xerox 3020) — `.tc-chip` style, click pre-fills search.
- Replaced plain marquee text with logo-style branded chips, each in its corporate color (HP #0096D6, Canon #CC0000, Brother #003087, Epson #1A1A8C, Ricoh #00A0AF, Xerox #FF0000, Kyocera #1A1A1A, Samsung #1428A0) via `.tc-marquee-logo`.
- New "Featured Suppliers" section between marquee and stats: 3 dark glass cards with circular grey camera-icon logo placeholder + "Upload Logo" label, supplier name/city/tagline, yellow "View Listings" CTA. Uses placeholder data.
- Stats strip now 3 tiles only: **250+** Verified suppliers · **15+** Cities served · **10+** Brands listed. Toner-SKU tile removed.
- Added a subtle animated gold shiny divider (`.tc-shiny-divider`) under the stats strip.

**Supplier dashboard (`pages/SupplierDashboard.jsx`):**
- Hero now exposes a circular Business Logo uploader (image-only, 3 MB cap). Live preview, hover state, persisted via new backend endpoint.

**Backend (`server.py`, `ai_check.py`):**
- Removed all `emergentintegrations` imports (chat + AI doc check). Chat and document checks now use the `google-genai` SDK exclusively — require `GOOGLE_API_KEY` in `backend/.env`. CORS configuration left untouched.
- New endpoints:
  - `POST /api/supplier/business-logo` (multipart, supplier-only) — uploads to `supplier-documents/<uid>/business-logo-<uuid>.<ext>` via service role, updates `suppliers.business_logo`, returns 1-hour signed URL.
  - `GET /api/supplier/business-logo` — returns current path + fresh signed URL.
- `/api/auth/me` now returns `supplier.business_logo_url` (signed, 1 hr) for approved suppliers.

**DB migration:** `backend/supabase_schema_logo.sql` — adds nullable `business_logo` text column to both `suppliers_pending` and `suppliers`. **MUST be run from the Supabase SQL editor before sellers can save a logo.**


### 2026-05-22 — Printer Guided Finder v2 + Dealer Wizard ✅
**Buyer side (`pages/PrintersGuide.jsx`):**
Full 10-step questionnaire with branch-aware routing.
- Step 1 Usage → auto-advance (Home / Corporate / Commercial / Print Shop)
- Step 2 Technology → dynamic per usage, auto-advance
- Step 3 Paper size → shown only for Commercial / Print Shop, auto-advance. **Non-A4 → Lead Capture**
- Step 4 Color → auto-advance
- Step 5 Function (Print only / Print+Scan / All-in-One / High-volume) → auto-advance
- Step 6 Volume → dynamic per usage, auto-advance
- Step 7 Connectivity → multi-select + Next (Wi-Fi / USB / Bluetooth / Ethernet)
- Step 8 Features → dynamic per usage, multi-select + Next (allow empty)
- Step 9 Budget → 4 tiers, auto-advance. **Above ₹1.5L → Lead Capture**
- Step 10 Quantity → 4 ranges, auto-advance. **20+ → Lead Capture, else marketplace**
- Marketplace redirect builds full `/printers/results?...` URL with `usage_type`, `category`, `paper_size`, `color`, `function_`, `min_volume`, `max_volume`, `connectivity`, `feature`, `city` query params (matches existing `GET /api/printers` filter contract).

**Lead Capture form (in-page state in PrintersGuide):**
- Heading "Let's find the right printer for you" + 24-hour assurance subhead
- Collapsible dark glass summary card showing every selection
- Fields: Name *, Phone *, Email *, City (dropdown of KNOWN_CITIES), Additional requirements (textarea)
- Yellow "Send Enquiry" submit → POST `/api/mps/inquiry` with full `selections` JSON + `source: "printers_guide"`; existing email notification fires.
- Success state with green check and "Enquiry sent! Our team will reach out within 24 hours."

**Dealer side (`components/PrinterListings.jsx`):**
Replaced the single-page dialog with a clean 4-step wizard:
- Step 1 Basic info — brand, model, description, image upload (5 MB cap, uploaded via existing `/supplier/printer-image` proxy)
- Step 2 Specs — usage / technology (dynamic) / paper sizes (multi) / color / functions (multi) / monthly volume min+max / connectivity (multi) / features (single combined ALL_FEATURES list, multi, optional)
- Step 3 Pricing — price, stock, condition pill row (New / Refurbished)
- Step 4 Review — preview card + every entered field rendered for confirmation, yellow "Publish printer" CTA → POST `/api/supplier/printers`
- Step indicator pills at top (current step black, completed yellow, future grey); per-step validation prevents Next until required fields are filled.

**Verified end-to-end on preview URL** (smoke test):
- Buyer: Home → Laser → Color → Print only → 1-100 → Wi-Fi → Skip features → "Above ₹1.5L" → Lead Capture page renders with 7-answer summary, all form fields, and yellow Send Enquiry button.
- Dealer (supplier1@test.com): Add printer dialog opens → Step 1 Next disabled until brand+model+image filled → Step 2 all spec pills toggle yellow, min/max validation works → Step 3 price/stock/condition → Step 4 Review card shows TestBrand TM-100 ₹25,000 · 3 in stock · Refurbished with all spec rows; Publish CTA active.

**Backend untouched** — no CORS changes, no new endpoints, no `emergentintegrations` usage. Existing `POST /api/mps/inquiry`, `GET /api/printers`, `POST /api/supplier/printers`, `POST /api/supplier/printer-image` consumed as-is.


### 2026-05-23 — Production polish batch (Footer, Legal pages, Commission, GST, Emails, Order Confirmed) ✅
**Footer (site-wide):** Marketplace / Company columns + CMYK strip as final element. `components/Footer.jsx`.

**Legal & contact pages:** `/terms`, `/privacy`, `/contact` — clean white page, Montserrat headings, Inter body. Contact page renders phones, email, WhatsApp CTA + Mon-Sat 9-7 hours block + form that POSTs `/api/mps/inquiry`.

**Commission utility & UI:**
- `lib/commission.js` — tiered (8 / 5 / 3 / deal-basis) `commissionFor(price)` helper + `COMMISSION_TIERS`.
- `<CommissionBanner />` injected below price on both Add Toner and Add Printer forms.
- `<CommissionCalculator />` card on supplier dashboard above the catalog tabs.
- Supplier order rows show `Commission (X%) -₹XXX` + bold green `Payout ₹XXXX`.

**WhatsApp & Pay Online:**
- `<WhatsAppEnquiry brand model />` floats on toner/printer cards — hover-only desktop, always visible on mobile.
- Disabled "🔒 Pay Online" CTA on cart with "launching soon" tooltip and muted subtext.

**Return & Dispute Policy:**
- `<ReturnPolicyBox />` collapsible card on every customer order row + on OrderConfirmed page.

**H — Pixel-perfect dealer forms:**
- New CSS layer in `index.css` (~150 lines): `.tc-pill`, `.tc-pill-sm`, `.tc-input-lg` (cyan focus glow), `.tc-image-drop` (160 px dashed cyan), `.btn-pill-cta`, `.tc-swatch` (40 px circular w/ white checkmark on select), `.tc-suffix-wrap` (pages/month suffix), `.tc-listing-card` (hover lift), `.tc-badge-new` / `.tc-badge-refurb`, `.tc-stock-dot` (green/red dot), `.tc-stat-card` (icon + 36 px Montserrat), `.btn-outline-light`, `.tc-shadow-lg`.
- **Add Toner dialog** rebuilt: 680 px modal, 32 px padding, 20 px radius, BASIC INFO / PRICING & STOCK / PRODUCT IMAGE section dividers, circular CMYK swatches, type pills, height-52 inputs, page-yield field, cyan dashed upload zone, pill CTA.
- **Add Printer wizard** restyled: same section dividers across all 4 steps, pill row replaced with `tc-pill`, height-52 inputs, cyan upload zone, pages/month suffix on volume inputs, pill CTA.
- **Supplier hero**: bordered glass stats with icons + 36 px values; added outline-style "+ Add printer" button beside yellow "+ Add toner".
- **Printer listing cards**: hover lift, new yellow `NEW` and grey `REFURBISHED` badges, category tag chip, green/red stock-dot indicator.

**E — GST compliance:**
- Backend: `users.gst_number` column (migration `supabase_schema_buyer_gst.sql`), `GET /auth/me` returns it, `PATCH /auth/me` accepts validated GSTIN.
- `/orders/mine` joins `suppliers.gst_number` for buyer view and looks up buyer GST + email for seller view.
- Dealer registration: GST helper text `"Required for B2B invoicing. Format: 22AAAAA0000A1Z5"`.
- New `<BuyerGSTCard />` on customer dashboard — clear / edit GSTIN inline with format validation.
- Per-order GST block on customer dashboard order rows AND on OrderConfirmed page with disclaimer "GST invoice to be issued by seller directly. TonersCart is a marketplace platform."

**G — Order confirmation emails:**
- `email_service.email_order_placed(order, listing, supplier, buyer)` sends two HTML emails:
  - **Buyer**: subject `"Order confirmed — {brand} {model} on TonersCart"`, order ID, product, qty, locked total, delivery, seller, GST block, dispatch ETA, WhatsApp CTA.
  - **Seller**: subject `"New order received — {brand} {model}"`, order ID, product, qty, order value, commission row + bold green payout (using same tiered logic), buyer name/phone/delivery, GST block, dispatch instruction, "Open my dashboard" CTA.
- Fired (non-blocking) from `POST /api/orders` immediately after the insert. Failure logged, never blocks order creation. Auto-skips when `RESEND_API_KEY` not set.

**I.1 — Dedicated order confirmation page (`/order-confirmed/:id`):**
- Animated green check burst (CSS `tc-check-pop` + `tc-check-pulse` keyframes), eyebrow "Order placed", h1 "Your order is confirmed", "Your seller will contact you within 24 hours", monospace Order ID.
- Summary card: Product, Quantity, Seller, Delivery, big total, "Price locked at order time", "Dispatch within 2 business days" with clock icon, GST block when present.
- CTA row: green "Chat with support" → `wa.me/919742270585?text=Order #...` + yellow "Track your order" → `/customer`.
- ReturnPolicyBox at the bottom.
- Page re-fetches authoritative order via `/orders/mine` on mount but renders instantly using state passed by the placing screen.
- Both `<OrderRequestDialog>` (single-item Buy Now) and `Checkout.jsx` (single-line cart checkout) now navigate to this page after successful POST `/orders`. Multi-line checkouts still go to `/customer`.

**Constraints honoured throughout:** no CORS changes, no `emergentintegrations` anywhere in code, no git push (user controls via Save to GitHub).

**Migrations to run in Supabase SQL editor before deploy:**
1. `backend/supabase_schema_logo.sql` (from previous batch)
2. `backend/supabase_schema_buyer_gst.sql` (this batch) — adds `users.gst_number text`


### 2026-05-23 — Production polish #2 (autocomplete, mobile, skeletons, 404, header pills, get-featured) ✅
**1. Search autocomplete** — `TonerSearchInput.jsx` rewritten with debounced (300 ms) live suggestions from `GET /api/toner-master?q=&limit=8`, AbortController on every keypress, keyboard nav (↑/↓/Enter/Esc), "No suggestions — press Search to browse all" empty state, crash-safe array guards.

**2. Mobile responsiveness** — hamburger menu (`header-mobile-menu-btn`) now exposes Buy with Toners/Printers/MPS, Sell, **Sign in** (outline) + **Join free** (yellow CTA) — both new — and city selector. Removed redundant "Join" cluster pill on mobile header. Dialogs now `max-h-[90vh] overflow-y-auto` (shadcn primitive).

**3. Loading skeletons** — `Landing.jsx` grouped grid shows 4 toner-card skeletons before the API resolves; `CustomerDashboard.jsx` shows 3 order-row skeletons. Search results page already had skeletons.

**4. Error boundary + 404** — `components/ErrorBoundary.jsx` wraps all `<Routes>`. New `pages/NotFound.jsx` catches unmatched routes with branded TonersCart-style 404 + "Go to homepage" / "Search toners" CTAs.

**5. Header redesign** — Buy is now a pill button (border `#E8E8EC`, chevron rotates on open). Sell is a pill button (outlined black border, fills black on hover/active). Mobile slide-down menu has the Sign in + Join free buttons inside.

**6. Dealer dashboard structural fixes**
- Removed top-right "+ Add toner / + Add printer" cluster from the hero.
- New contextual button on the right side of the tabs row — "+ Add toner" when Toners tab is active, "+ Add printer" when Printers tab is active. `+ Add printer` button dispatches `tc-open-add-printer` window event that `<PrinterListings>` listens to (so the wizard dialog opens without prop drilling). Internal Add-printer button inside `<PrinterListings>` was removed to avoid duplication.
- Commission Calculator moved **below** the listings + orders sections (was above the tabs).
- Calculator typography upgraded — Montserrat 600 for heading, tier values and Row labels (Inter 500 for descriptive text). Anti-thin/cheap fonts.
- Inter body-font wrapper applied to entire supplier dashboard root.

**7. Get Featured**
- New CTA banner under Featured Suppliers on Landing: 🌟 + "Get your brand featured here" + yellow "Apply now →" → `/get-featured`.
- `pages/GetFeatured.jsx` — dark-themed hero, fields: Company *, Contact person *, Phone (with locked `+91` prefix), Email *, City * (KNOWN_CITIES dropdown), Type of business (Dealer / OEM / Distributor / Other) as pills, Description textarea. POSTs to `/api/mps/inquiry` with `selections.type = "featured_application"`.
- `email_service.email_mps_inquiry` now branches on `selections.type` — Featured applications send to `support@tonerscart.com` with subject `"New Featured Supplier Application — {company}"`. MPS path unchanged.

**8. Smaller fixes**
- Hero title → "India's only Trusted Source for Printers, Toners & More."
- Modal scroll: shadcn `DialogContent` now `max-h-[90vh] overflow-y-auto` everywhere.
- Login popup: `<OrderRequestDialog>` quick-signin section now reads "Sign in or create an account" with explicit "Go to login" / "Create account" deep-links.
- +91 phone prefix on OrderRequestDialog phone input (10-digit cap + digits-only sanitiser) and on GetFeatured phone input.
- Placeholder example numbers removed from Add Printer wizard price input.
- Hero title and font upgrades passing 0 pageerrors on Landing.

**Verified end-to-end on preview URL:** 0 pageerrors on Landing, 8 live autocomplete results for "HP", `/get-featured` form renders with +91 prefix, `/this-does-not-exist` resolves the NotFound page, mobile menu (390 px viewport) shows hamburger + Sign in/Join free.

**Constraints honoured:** No CORS changes, no `emergentintegrations`, no git push.


### 2026-05-23 — Branding pass: logo + Digital Edge attribution ✅
**1. Navbar logo** — Removed inline "TC" tile + decorative dots + "TonersCart" wordmark from `Header.jsx`. Replaced with `<img src="/logo.png" alt="TonersCart" className="h-9 w-auto" data-testid="header-logo-img" />` that links to `/`. Hover triggers a tiny scale-up.

**2. Footer logo + taglines** — `Footer.jsx` brand column now renders `<img src="/logo.png" className="h-10 w-auto" />` inside a white-rounded backing tile (`bg-white rounded-lg p-2`) so the dark/CMYK logo stays legible on the `#0A0A0B` footer. Below it: Montserrat 13 px white/70 "**Buy Better. Print Smarter.**" + white/50 11 px "**A brand of Digital Edge Technologies | Bangalore**" + © {year} line.

**3. Legal pages branding**
- `Terms.jsx` and `Privacy.jsx` — added attribution paragraph below the "Last updated: May 2025" line: "TonersCart is a brand of **Digital Edge Technologies**, a partnership firm registered in Bangalore, India." (`data-testid="terms-attribution"` / `privacy-attribution`).
- `Contact.jsx` — added subtitle below "Get in touch" heading: "TonersCart — A brand of **Digital Edge Technologies** | Bangalore" (`data-testid="contact-attribution"`).

**4. Dealer registration agreement** — `SellerApplicationForm.jsx` Step 4 now shows a checkbox row above Submit: "I agree to the **TonersCart Seller Terms** (link to `/terms`) operated by **Digital Edge Technologies**." The Submit button is disabled until `agreed === true && allDocsValid()`.

**5. Browser tab + favicon** — `public/index.html` `<title>` updated to "TonersCart — Buy Better. Print Smarter." Added three favicon links pointing to `/logo.png` (`icon`, `apple-touch-icon`, `shortcut icon`) — works on every browser as a PNG until a proper `.ico` is added.

**Verified** in preview: 0 pageerrors, header_logo_img + footer_logo_img elements present, all three attribution lines render, title set, favicon link added. **Logo image itself will only render once `frontend/public/logo.png` is also placed in the Emergent workspace** (current preview shows a broken-image placeholder because the file lives only in user's GitHub repo). On the production build it renders correctly.
