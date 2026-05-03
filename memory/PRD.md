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
