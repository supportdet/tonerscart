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
