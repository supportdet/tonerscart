# TonersCart — Product Requirements (Supabase edition)

> **Latest (2026-06-14 Wave 52):** Iteration 50 — "Consumables" rebranded to **"Inks & Consumables"** + navbar reorder + dealer-pill redesign + delivery-notice rewording. **(1) Rename** — all user-facing copy updated: navbar pill, dealer dashboard tab (`DEALER_TABS` consumables label), Footer link, Search universal-tab label, breadcrumb on `/consumable/:id` ProductDetail, page H1 + strip label on `/consumables` ("Inks, drums, fusers & kits from verified dealers"), bulk-upload hub card. No URL changes (`/consumables`, `/consumable/:id`, `/api/consumables` all unchanged). No DB schema changes. **(2) Navbar reorder** — new left-to-right pill order: `Toners · Printers · Inks & Consumables · Scanners · Papers · MPS/Rentals · Bulk Orders · Dealer to Dealer · OEM Marketplace · Govt Portal` (`CATEGORY_PILLS` in `Header.jsx`). **(3) Subcategory filter tabs** on `/consumables` — exactly 6 amber-tinted pills (`#FFC107` active fill + white text, inactive `#FFF8E0` tint + amber text, mobile horizontally scrollable): All · Ink Cartridges · Drums · Fusers · Maintenance Kits · Accessories. "Accessories" is an umbrella over `Staple Cartridges + Transfer Belts + Other` (single API hit, client-side filter). Testids `consumables-tab-all/-ink/-drums/-fusers/-maintenance/-accessories`. **(4) Dealer-pill redesign** — `DealerTabBar` rewritten to render modern brand-color pills matching the public-site navbar palette: Toners `#FF1F75` (magenta), Printers `#00D4E5` (cyan), Inks & Consumables `#FFC107` (amber), Scanners `#5468FF` (indigo), Papers `#C58A6E` (brown), plus Orders/Earnings/Insights/Bulk/D2D/OEM. Active pill = solid accent + white text + accent box-shadow, inactive = tint background + accent text. Horizontally scrollable on narrow viewports. `CAT_BADGE` colour map updated to match. **(5) DeliveryPolicyNote** rewritten with exact wording per user spec: "Delivery charges are set by TonersCart and added to the buyer's total at checkout — same-city delivery is free, intercity delivery is ₹100–₹350 depending on product type. You are responsible for shipping the order to the buyer using your preferred courier. The delivery charge collected from the buyer is passed to you in full to cover your shipping costs." Verified live on `/supplier` consumable upload form. Testing agent (iteration_50.json) — 14/14 actionable PASS; main-agent live-verified dealer dashboard pills + DeliveryPolicyNote text (3/3 string assertions).

> **Latest (2026-06-24 Wave 73):** Iteration 63 — **Warranty field added to bulk + single forms; full backend↔frontend required-field audit + relaxation.**
>
> (1) **New `Warranty` column** on the Printer / Toner / Consumable bulk-upload tables — `select` cell with the 6 canonical options: `1 Year`, `2 Years`, `3 Years`, `On-site`, `Carry-in`, `No Warranty`. Defaults to `1 Year` so the field never blocks an upload unless the dealer explicitly changes it. Excel header "Warranty" / "Warranty Period" / "Printer Warranty" / "warranty_period" now resolve per sheet via a new multi-target HEADER_LOOKUP (one alias can point to multiple canonical keys — e.g. "Warranty" → `warranty` on toner/consumable sheets and `printer_warranty` on the printer sheet). Excel cell values like "1 year", "1 Yr", "12 months", "onsite", "Carry in", "No warranty", "none" all canonicalise to the dropdown labels via a new `WARRANTY_VALUES` table; unknown strings pass through untouched so dealer-custom warranties are preserved. 15/15 sanity tests pass.
>
> (2) **Single-form warranty pickers unified** to the same 6 options + `1 Year` default across `SupplierDashboard.jsx` (toner), `PrinterListings.jsx`, and `ConsumableListings.jsx`. The "Required" red asterisk + blocking validation toast were removed from all three forms. Editing an existing listing that has a legacy warranty value ("3 months", "6 months", etc.) still works — the value is shown in the dropdown if it matches, otherwise the form falls back to `1 Year`.
>
> (3) **Backend hard validations relaxed** (`routes/products.py`): `create_listing` (toner) no longer raises 400 on missing `warranty` / `cartridge_weight` — both default to `"1 Year"` / `null`. `create_printer` no longer raises 400 on missing `printer_warranty` — defaults to `"1 Year"`. `create_consumable` no longer raises 400 on missing `warranty` / `cartridge_weight` / `page_yield` (the latter previously enforced only for `Ink Cartridges`) — all three default to sensible values.
>
> (4) **Single-form blockers removed**: Toner form (SupplierDashboard.jsx) — `cartridge_weight` no longer required; UI marker switched to "(optional)". Consumable form (ConsumableListings.jsx) — `warranty`, `cartridge_weight`, `page_yield (Ink Cartridges)` all no longer block submit. Printer form (PrinterListings.jsx) — `printer_warranty` no longer blocks submit at Step 3; UI marker switched to no-asterisk.
>
> **Audit result**: After this wave, NO field is enforced at the backend that is invisible/required on the frontend. Lint clean. ESLint clean across all 5 files. Pyflakes clean on the backend changes. Frontend + backend reload OK.



> **Latest (2026-06-24 Wave 72):** Iteration 62 — **Five bulk-upload printer-table fixes.**
>
> (1) **"Printer Technology" header → Type/category mapping** — verified end-to-end; the synonyms table already covered `printertechnology`, but the matching is now strengthened with additional aliases (`printtechnology`, `producttype`, etc.) and the CONTAINS_FALLBACK catches anything containing `technology`/`type`. Sanity test: 6/6 header variants pass.
>
> (2) **"Ink Tank" atomic value end-to-end** — `PRINTER_CATEGORIES` dropdown collapsed `Ink` + `Tank` into one `{value:"ink-tank", label:"Ink Tank"}` entry. CATEGORY_VALUES now coerces `Ink Tank`, `ink tank`, `InkTank`, `ink-tank`, `EcoTank`, `Ink`, `Tank` all to `ink-tank`. New `_coerceCell` logic: whole-string canonical match FIRST (no split possible), then CATEGORY_CONTAINS fallback (`inktank` before `inkjet`/`tank`/`laser` so "Color Laser" → laser, "EcoTank" → ink-tank, etc.). Sanity test: 14/15 category-value variants pass; "Inkjet Tank" → "inkjet" (edge-case hybrid, acceptable). New dropdown values: Laser, Inkjet, **Ink Tank**, Thermal, **Dot Matrix**, **LED**, Other. Old `production`, `digital_press`, `label_barcode`, `ink`, `tank` (split) options removed.
>
> (3) **Condition defaults to "Brand New" silently** — `printerEmptyRow` now starts with `condition: "new"` (was empty). `toPayload` defaults to `"new"`. Condition was already optional in the row-errors check; with the new default it never appears red unless the dealer explicitly clears it. Tested: parsing an Excel without a Condition column leaves "Brand New" as the rendered value.
>
> (4) **Paper Sizes header + value coercion** — synonyms expanded (`pagesizes`, `papertype`, `papersizessupported`, `papersizecompatibility`, etc.). CONTAINS_FALLBACK extended to `papersize`/`paper`/`pagesize`/`pagesizes`. New `PAPER_SIZE_VALUES` table canonicalises tokens so `a4`/`A4`/`letter`/`Letter`/`foolscap` all resolve to the dropdown option values (`A4`, `Letter`, `Legal`). Same treatment for `connectivity` via `CONNECTIVITY_VALUES` (`wifi`→`Wi-Fi`, `lan`→`Ethernet`, `bt`→`Bluetooth`, etc.) so chips render reliably regardless of casing. Sanity test: 5/5 header variants + 4/4 multi-value coercion cases pass.
>
> (5) **Row-level red background removed** — `<tr>` no longer gets `bg-red-50` when `rowErrors().size > 0`. Only the individual empty cells flagged by `config.rowErrors()` carry `border-red-400 bg-red-50`. Cells that were successfully populated from the Excel render with the normal grey border even if other cells in the same row are still empty.
>
> Backend: `PRINTER_CATEGORIES` set extended with `ink-tank`, `dot-matrix`, `led` to match the new frontend dropdown. **SQL migration** `/app/backend/migrations/2026_06_24_wave72_printer_categories.sql` extends the DB CHECK constraint on `printer_listings.category` to include the same three new values (old values preserved for backward compat). **User must run this migration manually in Supabase SQL Editor before bulk uploads with the new types will succeed.** Lint clean (ESLint + Pyflakes); 30/31 sanity tests pass on the parser.



> **Latest (2026-06-24 Wave 71):** Iteration 61 — **Non-blocking Bulk Upload + JSX fix + per-cell error clearing.**
>
> (1) `BulkUploadGeneric.jsx` `onFile()` no longer raises a hard error when required columns are missing from the uploaded Excel/CSV. The parser silently ignores unrecognised columns (logged to `console.warn`), loads every parseable row into the table, sets `showErrors=true` and surfaces a `toast.warning("Loaded N rows · fill in: <field labels>")`. A yellow `bulk-missing-required-banner` renders above the table; cells failing `config.rowErrors(r)` render with `border-red-400 bg-red-50`. The `Upload all` submit button is disabled via an IIFE that scans every non-empty row for `rowErrors().size > 0` and adds a tooltip "Fill all required fields highlighted in red". The empty-file / no-recognised-columns / no-data-rows hard errors are preserved.
>
> (2) **JSX fix** — the IIFE wrapping the submit button (introduced in (1)) was missing its closing `);})()` + outer `</div>`, breaking ESLint and the dev-server compile. Restored proper closure so the file lints clean and webpack compiles without errors.
>
> (3) **Per-cell error clearing** — `updateCell()` no longer flips `showErrors=false` on the first keystroke. Red highlights + yellow banner now re-derive from `config.rowErrors()` per row, so partially-fixed tables keep guiding the dealer to the remaining bad cells. Once every row is valid the banner and red borders disappear naturally; the Upload-All button re-enables in the same render.
>
> Lint clean. ESLint frontend ✅. The testing agent code-reviewed the implementation against all six Wave 71 acceptance criteria (banner visible, red cells visible, toast warning, button disabled, junk-column hard error preserved, price=0 row gates submit) and confirmed full compliance. The premature-clear UX bug from the first review pass was fixed in the same iteration.



> **Latest (2026-06-24 Wave 70):** Iteration 60 — **Bulk-upload Excel header matching made genuinely dealer-friendly.** Three changes in `BulkUploadGeneric.jsx`:
>
> (1) **`_normHeader` now strips ALL non-alphanumerics** (₹, *, parens-content, brackets-content, %, quotes, slashes, spaces, underscores, etc.) so "Our Selling Price ₹*", "Price (INR)", "PRICE%" all collapse to `price`.
>
> (2) **`HEADER_SYNONYMS` expanded heavily** per spec — every reasonable dealer variation now has an exact entry (e.g. `price` accepts `oursellingprice`, `netamount`, `ourprice`, `mrp`, `rate`, `amount`; `category` accepts `printertechnology`, `typeofprinter`, `technology`; `stock` accepts `stockquantity`, `inventory`, `availablestock`, `units`; `monthly_volume_max` accepts `dutycycle`, `maxpages`; etc.). On top of that a new `CONTAINS_FALLBACK` table runs after the exact lookup — any header that simply *contains* a tell-tale substring ("price", "stock", "ppm", "papersize", "connectivity", "warranty", "resolution", …) routes to the right canonical key, restricted to the sheet's valid column set so "type" on a printer sheet doesn't accidentally bind to scanner_type.
>
> (3) **Dealer-facing error messages**: missing-required-column toast now reads "Missing required columns: **Type, Price, Stock**" using each column's display label (with the "(₹)" / "(ppm)" unit suffix stripped) instead of the internal field names `category, price, stock`. Required key list for the printer sheet was also relaxed to the spec — Brand, Model, Type, Price, Stock — so Usage no longer blocks upload.
>
> Unrecognised columns are now `console.warn`-logged for the dealer's debugging convenience but **never surfaced as toasts**. Lint clean; 24/24 sanity tests pass on dealer-style header inputs ("Our Selling Price ₹*", "Duty Cycle", "Stock Quantity", "PPM (B&W)", "New or Refurbished", "B&W or Color", "Manufacturer", "GST (%)", …); random garbage columns return null and are silently dropped.



> **Latest (2026-06-24 Wave 69):** Iteration 59 — **Wave 68 follow-ups: bulk multi-chip cells + bulk "Suitable For" custom-model auto-save.**
>
> (1) **Multi-chip cells** in `BulkUploadGeneric.jsx`: new `c.type === "select" && c.multi` cell renderer. Stored value remains a comma-joined string for backwards compatibility with the parser/payload split. Each picked option renders as a dark pill chip with a × remove button; below the chips an inline `<select>` shows remaining options with an "Add"/"Select…" hint. Honors `c.maxSelect` (set to 2 for Usage) — when the cap is hit the add control is replaced by a small `max N` label. `lib/bulkConfigs.js`: marked `usage_type` (max 2), `connectivity`, `paper_sizes` columns with `multi: true`; added `PRINTER_USAGES` ("Office" added), `PRINTER_CONNECTIVITY` (USB/Wi-Fi/Ethernet/Bluetooth/NFC/AirPrint), `PRINTER_PAPER_SIZES` (A4/A3/A5/Letter/Legal/Executive) option lists wired through `selectOptions`. Single-select cells also now always render a `<option value="">Select…</option>` placeholder so dropdowns don't visually look pre-filled with the first option.
>
> (2) **Bulk Suitable For — custom model auto-save**: `ModelSearchCell` extended to render an inline `+ Add "<brand> <term>"` action at the bottom of its dropdown whenever the typed term has 2+ chars (whether there are matches or not). On click → `POST /api/compat/custom-printer` (the existing shared registry endpoint used by the single forms) → on success the new model is picked into the cell exactly like a real match and a toast announces "now searchable for all dealers". One file changed; same code path serves single and multi cells.
>
> Live-verified via Playwright on a fresh approved supplier: Usage cell took Home + Office chips, capped at 2, restored the add control after removing Office; Connectivity took USB + Wi-Fi + Ethernet (3 chips); Paper Sizes took A4 + A3 (2 chips). QA dealer purged. Protected dealers 8/8 PASS.



> **Latest (2026-06-23 Wave 68):** Iteration 58 — **Bulk parser overhaul + dropdown defaults + payout + return policy.**
>
> **Bulk Excel/CSV parser** (`BulkUploadGeneric.jsx`): rewrote header matching to be case/whitespace/underscore/slash/parens-insensitive. New `HEADER_SYNONYMS` table accepts common aliases (e.g. "Type" → category, "Suitable For" → compatible_models, "MRP" → price, "Qty Available" → stock, "DPI" → scan_resolution). New `_coerceCell()` maps free-form values to canonical select options: **Category** preserves multi-word "Ink Tank" → `ink-tank` (no split bug); **Color** synonyms (B&W ↔ "Black and White" ↔ "Monochrome" → `bw`); **Condition** synonyms ("Brand New" → `new`, "Refurb" → `refurbished`, "Open Box" → `open-box`); **Usage** multi-select up to 2 (`_splitMulti` on `/, &, |, ;` and de-dupes); **Connectivity / Paper Sizes / Compatible Models** preserve multi-value as comma-joined cell; **GST rate** snapped to {5,12,18,28}. Missing required headers raise one clean error; extra unknown columns are silently dropped.
>
> **No more dropdown prefills** (`lib/bulkConfigs.js`): `tonerEmptyRow`, `printerEmptyRow`, `consumableEmptyRow` all start blank — no preselected Laser/Brand New/Corporate/Color/18%. `toPayload` no longer falls back to silent defaults for `category/condition/usage_type/color`. Usage payload now sends `usage_types: [...]` array derived from the multi-select cell.
>
> **Commission breakdown simplified (task 7)**: removed the "TonersCart commission (X%): −₹Y" red line from single-form (`PriceWithGstToggle.jsx`), toner variant breakdown (`SupplierDashboard.jsx`), and bulk per-row breakdown (`BulkUploadGeneric.jsx`). Only "You'll receive" (emerald) + GST passthrough note remain. Slab logic unchanged.
>
> **Image-missing notification (task 8)**: new `email_printer_images_missing()` in `email_service.py`; `/supplier/printers/bulk` (now async) sends a single digest email listing every newly-uploaded printer without an image, with the exact CTA `"Add one from your Dashboard → Printers → Edit"`. One mail per batch, never per row.
>
> **Toner single form — image upload (task 9)**: added a 3-slot image picker to the Add Toner dialog in `SupplierDashboard.jsx` (5 MB each, image-only). Animated cartridge graphic still shows when no image is uploaded. Consumable form already had it.
>
> **Delivery policy — pay on dispatch (task 10)**: `routes/orders.py` now writes `dispatched_at` + `payout_eligible_at = now + 2 days` the moment a dealer marks an order `shipped` with a tracking number. The 5-day buyer-confirmation gate is gone. APScheduler's `auto_confirm_delivered_orders` job has been retired (kept the scheduler running with no jobs). Terms § 11 rewritten to match.
>
> **Return policy — wrong model / DOA only (task 11)**: Terms § 10 rewritten to a strict two-cause rule: (a) wrong model delivered OR (b) damaged / DOA. No change-of-mind, no compatibility returns. 48-hour photo-evidence window.
>
> **Partial / follow-up**: bulk-table multi-chip cell **rendering** for Usage / Connectivity / Paper Sizes (parser layer ready, display still uses single-select dropdowns), and bulk-table free-text "Suitable For" auto-save to a shared model registry (single-form already has `MissingModelLink`). Lint clean, protected dealers 8/8 PASS, backend boots with Wave 68 scheduler note.



> **Latest (2026-06-23 Wave 67):** Iteration 57 — **Searchable cities-you-serve picker + persona-popup loop fix.**
>
> (1) **Cities you serve** field on `SellerApplicationForm.jsx` (Step 1) replaced the fixed 19-chip list with a new inline `<CitiesServedPicker>`: state dropdown (all 28 states + 8 UTs) → searchable city input with auto-suggestions from a curated `STATE_CITIES` map (~250 popular cities) → "Add city" button. Free-text city entry is supported (any tier-3 town the dealer types and clicks Add gets accepted). Each entry stored as `"City, State"` strings in the existing `cities_served text[]` column — no schema migration. Added cities render as removable chips. Removed the unused `toggleCityServed` helper.
>
> (2) **Persona-popup loop bug** in `BuyerTypeGate.jsx`: bumped its z-index from `z-[900]` to `z-[1100]` so it now renders ABOVE `AgreementGate` (`z-[1000]`) — matching the user's desired flow (persona FIRST, then agreement, then form). Added a sticky local `dismissed` state that flips to `true` the moment the user clicks any persona tile and is included in the `eligible` check. This survives React re-renders and any race between `await refresh()` and parallel `/auth/me` calls, guaranteeing the popup never re-appears for the same session even if the network round-trip lags. On error the flag rolls back so legitimate failures still re-show.
>
> Live-verified via Playwright: persona z-1100 visible above agreement z-1000 → click Dealer/Supplier → persona count goes 1→0, agreement stays 1 → accept agreement → both gates count = 0, no re-pop. Cities picker test: Karnataka → "Mys" suggestion → Mysore chip; Karnataka → "Nelamangala" custom add (not in list) → chip; Maharashtra → "Mumbai" → chip. Final: 3 chips with cross-state entries `["Mysore, Karnataka", "Nelamangala, Karnataka", "Mumbai, Maharashtra"]`. QA customer purged. Protected dealers 8/8 PASS.



> **Latest (2026-06-23 Wave 66):** Iteration 56 — **Hide dealer name on listing cards; add muted "Sold by" line on every product detail page.** (1) Removed the supplier/business name from all 5 product card variants (`cards/TonerProductCard.jsx`, `PrinterProductCard.jsx`, `PaperProductCard.jsx`, `ConsumableProductCard.jsx`, `ScannerProductCard.jsx`). Cards now show only city + verified tick + delivery badge. The dealer-name text element was deleted from each card; for paper/consumable/scanner the city `<MapPin>` is promoted to the left position. (2) On `/toner/:id`, `/printer/:id`, `/paper/:id`, `/consumable/:id`, `/scanner/:id` (all route through shared `ProductDetail.jsx`) the previous prominent "Sold by — Shield + VerifiedBadge — city" block was replaced with a small muted line `data-testid="product-sold-by"` placed **directly below the price section, above the Add to cart / Buy now CTAs**: `Sold by: <company> · ✅ Verified Dealer · <city>` (text-[12px], color #86868B, company name slightly darker). Unused `Shield` lucide import + `VerifiedBadge` component import removed from ProductDetail.jsx. Live-verified on `/printer/...` → DOM text reads exactly "Sold by: DET · Verified Dealer · Bangalore"; `/printers` listing page DOM confirms "DET" appears 0 times in card content.



> **Latest (2026-06-23 Wave 64 + 65):** Iteration 55 — two shipped task groups.
>
> **Wave 64 — Cancelled cheque optional + admin docs panel.** (a) `SellerApplicationForm.jsx`: removed `bank_proof` from `allDocsValid()`, label changed to "Cancelled cheque (optional)" with helper text "Required before your first payout. You can submit this later." Checklist card line updated accordingly. (b) Backend: `GET /api/admin/suppliers` now augments each dealer row with `pending_docs: string[]` (missing-mandatory list driven by GST + PAN + ID proof + cancelled cheque) and `cheque_uploaded: bool`. `GET /api/admin/suppliers/{id}/detail` now also returns `supplier.doc_status` (per-field bool), `supplier.cheque_uploaded`, and `supplier.pending_docs`. (c) New endpoint `POST /api/admin/suppliers/{id}/document?field=doc_*` (multipart) — admin uploads a KYC doc on a dealer's behalf, stores in the same `supplier-documents` bucket, writes the path back to the `suppliers` row, and flips `cheque_uploaded=true` when the field is `doc_bank_proof`. Resilient to the column not existing yet (graceful 400/404 paths verified). (d) `DealerProfile.jsx` (the /admin/dealers/:id page): rebuilt the Documents section as a 6-row grid (GST → PAN → Cancelled cheque → ID proof → Address proof → Brand authorization) — each row shows Uploaded (green pill + View/Download) or Missing (red/amber pill + admin Upload button using a hidden file input). A yellow banner at the top of the section lists how many mandatory docs are still missing. (e) `DealersTab.jsx` admin list: new "X docs pending" amber pill next to Active/Suspended status, driven by `d.pending_docs`. (f) SQL migration written to `/app/backend/migrations/2026_06_22_wave64_cheque_uploaded.sql` — adds `cheque_uploaded BOOLEAN NOT NULL DEFAULT FALSE` to `suppliers` and backfills from existing `doc_bank_proof`. Run once via the Supabase SQL editor.
>
> **Wave 65 — Pending-approval banner on dealer dashboard.** Pending applicants (role still `customer`, `application_status='pending'`) are now admitted to `/supplier` via a new `allowApplicationStatus={["pending"]}` flag on `ProtectedRoute`. The hard-block `<PendingScreen>` is preserved only for rejected applicants. While pending, the dashboard renders a yellow banner above the tab bar with the exact wording the user specified: "Your account is under review. We'll notify you by email once approved — usually within 1–2 business days." All add/bulk/edit CTAs across **all five categories** (Toner, Printer, Paper, Consumable, Scanner) get `disabled={!isApproved}` + tooltip "Available after admin approval — usually within 1–2 business days." A `guardedClick` wrapper ensures programmatic clicks toast the same message instead of opening the form. Live-verified via Playwright: banner copy + dashboard mount + 2 disabled CTAs confirmed in DOM. QA pending dealer purged. Protected dealers 8/8 PASS.



> **Latest (2026-06-22 Wave 63):** Iteration 54 — **2 surgical seller-application fixes** in `frontend/src/components/SellerApplicationForm.jsx`. (1) **Annual turnover** + **Years in business** (Step 2) made **optional**: removed both from `canNext()` step-2 validation (kept the "if typed, must be ≥ 0" guard on years for sanity), dropped the `required` HTML attr, swapped the red asterisk in the labels for a neutral "(optional)" suffix. (2) **Brand Authorization Letter** (Step 4) moved to the **bottom** of the document list (rendered after Address Proof instead of above GST). Always rendered. Required only when `s.seller_types.includes("Original")` (label keeps the asterisk, hint reads "Required for Original (OEM) sellers"); otherwise rendered with "(optional)" label and the exact helper text "Required only if you sell original OEM cartridges." The checklist card's Brand Auth line was likewise moved to the bottom with matching conditional copy. `allDocsValid()` already enforces the Original-required rule (untouched). QA customer purged; protected dealers 8/8 PASS.



> **Latest (2026-06-22 Wave 62):** Iteration 53 — **Commission slabs reverted platform-wide to 10/8/6/5/4** (Wave 61's 12/10/8/6/5 bump rolled back per user instruction). Updated `frontend/src/lib/commission.js` (`COMMISSION_TIERS` + `COMMISSION_BANNER_TEXT` + header comment), `frontend/src/lib/agreements.js` seller bullet, `backend/email_service.py` `_COMMISSION_TIERS`, `backend/tests/test_polish_patch.py` assertion, `frontend/src/pages/Terms.jsx`, `frontend/src/pages/Privacy.jsx`, `frontend/src/components/CommissionBanner.jsx`. Bumped seller agreement version `2.0 → 2.1` in `backend/agreements.py` so any dealer who saw the Wave 61 wording is asked to re-acknowledge the corrected text exactly once. Live-verified: agreement modal shows "under ₹15K = 10% · ₹15K–₹30K = 8% · ₹30K–₹75K = 6% · ₹75K–₹1L = 5% · ₹1L+ = 4%"; bulk upload row breakdowns confirm ₹1,200→10% −₹102, ₹50,000→6% −₹2,542, ₹2,00,000→4% −₹6,780. QA supplier purged. Protected dealers 8/8 PASS.



> **Latest (2026-06-22 Wave 61):** Iteration 52 — **3-shot dealer-flow rewrite.** (1) **One-time seller agreement** consolidated. Removed duplicate `SupplierAgreementDialog` (localStorage-based) — deleted the component file and unwired it from `SupplierDashboard.jsx`. The global `<AgreementGate>` in `App.js` now handles the single source of truth via the DB-tracked, versioned `user_agreements` table. `lib/agreements.js` `seller` rewritten with the user's exact 6-bullet text (Terms of Service + Privacy Policy as inline `<a>` tags), checkbox "I agree", button "Start listing". `AgreementGate.jsx` now supports `introHasLinks` (renders ToS/Privacy hyperlinks) and `buttonText` override. Version bumped `seller: 1.0 → 2.0` in `agreements.py` so all 3 protected dealers + every existing supplier sees the modal exactly once at next login, then never again. (2) **GST dropdown everywhere.** `GST_RATES` in `listingConstants.js` restricted to 5/12/18/28 (removed `0% Exempt` and "(default for printers & toners)" suffix). In `bulkConfigs.js` every per-table `gst_rate` column changed from `type:"number"` → `type:"select"` with `GST_RATE_OPTIONS`. (3) **Bulk per-row live commission breakdown.** Removed the per-row `price_type` column from all 5 tables (toner/printer/paper/consumable/scanner); added a single top-of-modal **Incl./Excl. GST pill toggle** in `BulkUploadGeneric.jsx` that applies to every row at submit. Below each row's price cell, three live read-only lines render with `data-testid="bulk-breakdown-{idx}"`: `You'll receive · TonersCart commission (tier %) · GST`. Each row's gst_rate (now a dropdown) drives its own GST line. (4) **Commission slabs updated platform-wide** per user instruction: 10/8/6/5/4 → **12/10/8/6/5**. Updated `lib/commission.js`, `email_service.py` (`_COMMISSION_TIERS`), `Terms.jsx`, `Privacy.jsx`, `CommissionBanner.jsx`, `COMMISSION_BANNER_TEXT`, and the regression assertion in `test_polish_patch.py`. (5) **Live-verified via Playwright**: registered fresh QA supplier, login → AgreementGate appeared with correct copy + 12/10/8/6/5 slabs → accepted → no second popup → opened Bulk Toner upload → top toggle Incl/Excl works → GST dropdown enforced → row 0 typed ₹1,200 incl 18% shows `Receive ₹895 / Commission 12% −₹122 / GST ₹183`; toggle to Excl → `Receive ₹1,056 / Commission −₹144 / GST ₹216`; GST dropdown → 28% → `GST ₹336`; row 1 typed ₹50,000 excl → `Commission 8% −₹4,000 / Receive ₹46,000` (correct tier 3). QA supplier purged (Supabase Auth + DB). Protected dealers `test_protected_emails.py` 8/8 PASS.



> **Latest (2026-06-22 Wave 60):** Iteration 51 — **Live commission-breakdown UI clarified + verified on the live product-upload forms.** (1) `PriceWithGstToggle.jsx` payout-breakdown block rewritten to use `payoutBreakdown()` from `lib/commission.js`. Block renders directly under the price input with crisp white card + section header "What you'll earn on this listing" and 4 rows: `Your base price (excl. GST)`, `TonersCart commission (X% of base)` (red), `You'll receive (per unit)` (emerald, bold + top border), plus a 1-liner: "GST of ₹X (Y%) and delivery charges pass through to you in full — TonersCart never takes a cut on those." Same block flows through to Add Printer (`wizard-payout-breakdown`), Add Paper (`paper-payout-breakdown`), Add Consumable (`consumable-payout-breakdown`), Add Scanner (`scanner-payout-breakdown`). (2) **Add Toner** (multi-variant form in `SupplierDashboard.jsx` L1238) now shows a per-variant breakdown (`variant-payout-breakdown-{i}`) with Buyer pays + base + commission + you'll-receive + GST pass-through note — updates live as the dealer types each variant price. (3) Minor cleanup: dead ternary on `SellerApplicationForm.jsx` L339 removed. (4) **Live verification done**: created throwaway QA supplier, logged in via Playwright, opened Add Toner, typed ₹1200 incl 18% GST → screenshot + DOM text capture confirmed exact wording (₹1,200 buyer / ₹1,017 base / −₹102 @ 10% / ₹915 payout / GST ₹183 pass-through). QA supplier purged immediately after (Supabase Auth + users + suppliers tables). Protected dealers (`support@digitaledgeindia.com`, `sairam@digitaledgeindia.com`, `sales@bigctech.com`) untouched — `tests/test_protected_emails.py` 8/8 PASS. **Skipped per user instruction**: Procurement Phase 3, Twilio OTP, Razorpay live. Seller-signup form fixes (phone uniqueness, city dropdown w/ Other fallback, doc trash icons, branded password-reset email via Resend) re-verified — all in place from Wave 59.


>
> **Prev (2026-06-13 Wave 51):** Consumable compatible-printers chip rail above Notify-Me block.
>
> **Prev (2026-06-14 Wave 50):** Iteration 49 — Cartridge-type routing overhaul + mandatory field hardening + clickable compat chips. **(1) Routing**: laser-powder toners stay at `/toner/:slug`; ALL other cartridges (inks, drums, ribbons, fusers, maintenance kits) now route to `/consumable/:slug`. New backend endpoint `GET /api/compat/consumable-page/:slug` (same shape as `toner-page`). Both endpoints return new fields `kind` and `canonical_url` so the frontend can do a 301-style `<Navigate>` to the correct URL when the wrong route is hit (`/toner/epson-001-black` → `/consumable/epson-001-black` verified live). Created `ConsumableRoute.jsx` (UUID → ProductDetail, slug → shared `TonerModelPage` with `pageKind="consumable"`). `App.js` route `/consumable/:id` now uses it. **(2) Sitemap**: `_build_sitemap_response` and `generate_sitemap.py` both split URLs by ttype (`/toner/` for toners, `/consumable/` for inks/drums/ribbons). 450 toner + 153 consumable SEO URLs. ⚠ Testing agent FOUND & FIXED a P0 variable-shadowing bug in `server.py` L1559 — inner `base` was overwriting outer host `base` causing 604 broken locs like `/consumable//consumable/brother-bt-5000c` — renamed to `prefix`. Static `/app/frontend/public/sitemap.xml` regenerated. **(3) Clickable compat chips**: `/compatible/:slug` cartridge chips (Q2612A, 003, DR-2255, etc.) are now `<Link>`s to `/toner/:slug` or `/consumable/:slug` based on `t.type`. ProductDetail "Suitable for" chips (toner + consumable kinds) parse `compatible_models` and link each printer model to `/compatible/:slug` via `lib/printerSlug.js`. **(4) Mandatory fields enforced** on both backend (HTTP 400) and frontend (toast + red asterisk): warranty + cartridge_weight on toner uploads (`SupplierDashboard.jsx`); warranty on printer uploads (new `PRINTER_WARRANTIES` pill row in step 3 of `PrinterListings.jsx`); warranty on paper uploads (new `PAPER_WARRANTIES` pills in `PaperListings.jsx`); warranty + cartridge_weight on consumable uploads with **page yield conditional on subcategory=="Ink Cartridges"** (drums/fusers measure rotations, not pages — `ConsumableListings.jsx`). **(5) Dealer edit forms** already pre-fill GST inclusive price + validate the toggle (verified — Paper/Consumable/Printer edit setters set `price_type:"incl"` and use `withGst(base, gst_rate)` for prefilled price; submit blocks if toggle un-touched). Testing agent verified all 19 review items (iteration_49.json, backend 9/9 PASS, frontend 100% on 5 flows).
>
> **⚠ Action item for app owner:** Still pending from Wave 49 — run `/app/backend/supabase_schema_custom_models.sql` in Supabase SQL editor so dealers can save custom printer/toner models (POST endpoints currently 503 with clear migration msg).
>
> **Prev (2026-06-13 Wave 49):** Iteration 48 — 4 features shipped: (1) **Page Yield chip** on Toner Product Detail Page (`ProductDetail.jsx` L313) — emerald highlight pill with `data-testid=product-page-yield` rendering "Page yield: X pages" next to the Suitable-for chip. (2) **GST-inclusive prices on Dealer Dashboard** — Listings-tab toner cards now show `formatINR(inclGstPrice(price, gst_rate))` with subtext "incl. {gst_rate}% GST · base {base}" (`SupplierDashboard.jsx` L992 — testid `listing-incl-price-{id}`). The All-Listings combined table header renamed to "Price (incl. GST)" and each row also displays the inclusive amount + GST% subtext (testid `all-row-price-{id}`). (3) **Custom Printer/Toner free-text models** — dealer dropdowns (`TonerModelSearchSelect.jsx`, `PrinterModelSelect.jsx`) now offer a "Add as new model" CTA when the typed brand+model isn't in the compatibility DB. Submits to `POST /api/compat/custom-printer` / `/api/compat/custom-toner` (supplier-auth only), saved to new `custom_printer_models` / `custom_toner_models` tables (status='pending'), immediately surfaces back in dropdown searches with an amber "Added by dealer" badge, AND auto-records a row in `mps_inquiries` (msg_type=custom_*_model) so admins see the request in the Messages tab. (4) **Toner SEO Page (`/toner/:slug`) redesigned** (`TonerPriceTable.jsx` rewritten) — the lowest-priced listing now renders as a distinct emerald-bordered featured card (`price-featured-{id}`) with: 80px placeholder image, "LOWEST PRICE" award badge, dealer name + city + delivery info, big price + GST breakdown, prominent "Buy now" pill CTA. Remaining listings render as compact image-less rows (`toner-other-listings` + `price-row-{id}` each). Verified P1 reload sign-out bug — `/auth/me` returns 200 after hard reload, session correctly persisted in localStorage (`persistSession: true`); the modal users see is the usage-selection prompt for new customers, NOT a sign-out.
>
> **⚠ Action item for app owner:** Run `/app/backend/supabase_schema_custom_models.sql` in Supabase SQL editor before dealers can save custom models. Until then, the GET dropdowns work normally (custom merge no-ops) and the POST endpoints return 503 with a clear migration message — no 500s.
>
> **Prev (2026-06-11g):** Iteration 42 — 7 UX fixes shipped: (1) `/printers` finder popup now reliably auto-opens at 15s (removed pointerdown listener that suppressed it); (2) brand filter chips converted to **multi-select** (array value) on `/search`, `/printers` (newly added), `/consumables`, `/scanners` — brand dropdown removed from CategoryFilters; (3) all "Compatible models" / "Compatible printer models" / "Compatible printers" labels replaced with **"Suitable for"** (cards, detail pages, supplier upload form, bulk template, SEO model pages, order emails); (4) phone `+91 88845 46789` added to Footer (brand column + grievance strip), Contact (new phone card), About (new phone card); (5) green **"Chat on WhatsApp"** button on `/contact` → `https://wa.me/918884546789` in new tab; (6) global **ScrollToTop** component scrolls to top on every route change (skips `#hash` anchors); (7) **Page yield (sheets) is now mandatory** for new toner uploads (single + bulk + backend `POST /api/supplier/listings` rejects with HTTP 400 when missing). Tested by agent (iteration_42.json) — 100% pass, no bugs. Cleanup re-ran (DB already clean — 0 test users).
>
> **Prev (2026-06-11f):** (1) **Brand filter chips** (All + 12 brands in official colors, active = filled) above listings on toners browse (/search), /consumables and /scanners — wired to existing brand filter state (`BrandChips.jsx`); (2) **Static line-art placeholders with brand band** for printers/consumables/scanners (`ProductPlaceholder.jsx`) — applied to PrinterProductCard, Consumable/Scanner cards (new image blocks), ProductDetail fallback and RelatedProducts (no listing ever shows an empty grey box); (3) **PROCUREMENT PHASE 2 ORDER FLOW SHIPPED**: `POST/GET /api/procurement/orders`, place order from quotation (L1/L2/L3 picker dialog in MyQuotations), `MyOrders.jsx` with 4-step status timeline, PO document upload for govt (private supplier-documents bucket + signed URLs), credit_used debit + credit_ledger entry on order, quotation → converted, `email_proc_order_placed`, admin orders table in Procurement tab with status-advance (delivered sets delivered_at + net-30 due date). Also FIXED pre-existing bug: `/procurement/compare` imported `search_listings` from server (moved to routes/search.py during refactor — Search & Compare was 500ing). Tested: backend 15/15 (`tests/test_phase2_proc_orders.py`), frontend 100% (iteration_41). QA procurement account + 2 QA orders kept for Phase 3 testing (see test_credentials.md).
>
> **Prev (2026-06-11e):** Toner band colors per-brand official colors; "Compatible models:" bold on cards. **(2026-06-11d):** Static toner placeholder image with brand band overlay everywhere.
>
> **Prev (2026-06-11c):** (1) Cartridge SVG redesigned to reference shape (superseded by 06-11d static image); (2) **All test data deleted**: users qadealer@tonerscart.in + e2e_deliv_dealer/buyer@tonerscart.in (users + suppliers + Supabase Auth), 1 test scanner listing (Canon LiDE 400), 3 test orders — DB now contains only real registrations; NO QA supplier account exists anymore (create+delete one for future supplier-side testing); (3) **Finder popup robustness fix**: clicks on cookie banner/header no longer suppress the 15s popup (pointerdown listener scoped to the printers page container; scroll threshold 120px). Verified via Playwright: popup opens at 15s idle, X closes it. NOTE: popup shows once per browser session (sessionStorage `tc_finder_popup_shown`).
>
> **Prev (2026-06-11b):** (1) Toner cards: "Compatible models:" label (was "Fits:") at 12.5px, toner name title resized to 17px; (2) Cartridge SVG redesigned (superseded by 06-11c); (3) **/printers now shows printer listings directly** (PrintersResults); guided finder questionnaire moved to `/printers/guide` and ALSO auto-opens as a dismissible "Find your printer" popup (X close, `finder-popup-overlay`/`finder-popup-close`) 15s after landing on /printers; (4) **"You may also need" related-products row added to product detail pages** (toner/printer/consumable/scanner) — new `GET /api/related/{kind}/{id}` + `RelatedProducts.jsx`. See CHANGELOG.md.
>
> **Prev (2026-06-11):** **Toner card & upload-form overhaul** — (1) Toner cartridge SVG now shows ONLY the clean brand name (extracted via `lib/brands.js`) with a RED default band (unknown brands no longer fall back to HP blue); (2) Toner product card: toner name (`model_number`) is the prominent title, compatible models demoted to a small line; (3) Toner detail page renders the generated cartridge SVG (proportionate 1.25:1 box) instead of "No image uploaded"; (4) Brand dropdowns locked to a fixed 12-brand list (HP, Canon, Brother, Epson, Ricoh, Xerox, Kyocera, Samsung, Konica Minolta, Pantum, Riso, Sharp) on the single toner form AND all bulk tables (toners/printers/consumables; papers use the 12 paper brands) — junk DB-driven entries gone; (5) New `ModelSearchCell` in bulk tables: typing 2+ chars searches the compatibility DB, same-brand models grouped first then "Other brands" (multi-select for toner/consumable compatible models, single-select + brand autofill for printer model); (6) **DB cleanup ran** (`backend/cleanup_brands.py`): 18 listings + 17 toner_master rows normalized (brand="Canon", cartridge name moved to model_number), TEST_* toner_master rows deleted, 'Xeroc' typo fixed; (7) QA supplier account recreated (see test_credentials.md). Verified by testing agent iterations 39 + 40 (100%). See CHANGELOG.md.
>
> **Prev (2026-06-10c):** Admin account migrated → new admin `support@tonerscart.com` (role=admin) created; old `admin@tonerscart.in` fully deleted from users + Supabase Auth (references reassigned, `.env` updated). Admin dashboard made **mobile-responsive**: 14 tabs → Section dropdown on mobile / scrollable bar on desktop, all tables scroll with readable min-widths, action + dialog buttons full-width on mobile. Verified @390px & @1280px. See CHANGELOG.md.
>
> **Prev (2026-06-10b):** (1) **Sign-in** sped up (deduped `/auth/me`, role returned from `login()`) — dealer lands on `/supplier` fast. (2) **Admin doc download** fixed — fresh per-click signed URLs; View opens in new tab, Download forces a file download. (3) **Bulk upload** now works for Printers/Papers/Consumables (+Scanners) from the Bulk hub, not just Toners. (4) **Seller application** shows a live submit progress bar (parallel doc uploads). (5) **Scanners** — full new vertical (customer `/scanners` page + filters + detail, dealer upload + bulk + edit, admin counts, navbar route). ⚠️ Run `backend/supabase_schema_scanners.sql` in Supabase to activate scanners (degrades gracefully until then). All verified by testing agent (iteration_37, 100%). See CHANGELOG.md.
>
> **Prev (2026-06-10):** Added (1) a global rotated right-edge **Feedback tab** (visible past hero) and (2) a **"Couldn't find your toner?" product-request form** on Search/Papers/Consumables/PrintersResults — both record to `mps_inquiries` (Admin → Messages, tagged `feedback`/`product_request`) AND email support@tonerscart.com via the existing `/api/mps/inquiry`. (3) Hardened mobile **Checkout** with `min-w-0` grid guards (no overflow was reproducible). See CHANGELOG.md.
>
> **Prev (2026-06-08):** (1) Login brute-force protection — backend `POST /api/auth/login`, 5 failed/IP/10min → 30-min block. (2) Order tracking flow Requested→Confirmed→Dispatched→Delivered→Completed + 5-day APScheduler auto-confirm/payout timer. (3) Grievance officer text. (4) **server.py refactored** into `backend/routes/{auth,search,products,orders,admin,suppliers}.py` (5,523→1,597 lines, 120-endpoint parity, zero behaviour change). **ACTION: run `backend/supabase_schema_order_tracking.sql`** for order-tracking columns. See CHANGELOG.md.


## Latest changelog (2026-02 Wave 10 — Two-layer navbar + new category pages + D2D marketplace)

- **Two-layer navbar** — `/app/frontend/src/components/Header.jsx` rewritten.
  - Layer 1 (dark `#0A0A0B`, 48px): logo · City · Sell · Sign in · Cart · Join free.
  - Layer 2 (white, 44px, `border-bottom #E8E8EC`): 9 horizontally-scrollable colored category pills — Toners `#d81b60`, Printers `#0097a7`, Papers `#795548`, Consumables `#f9a825`, Scanners `#5c6bc0`, MPS/Rentals `#43a047`, Buy Bulk `#e65100`, Dealer to Dealer `#607d8b`, OEM Marketplace `#6d4c41`. Old Buy dropdown removed.
- **New pages (all live E2E, emails to `support@tonerscart.com`):**
  - `/consumables` and `/scanners` — Coming-Soon w/ email interest capture (`selections.type = consumables_interest` / `scanners_interest`).
  - `/bulk` — Buy-Bulk form (product, qty, budget, city, +91 phone, email, notes) → `bulk_enquiry`.
  - `/dealer` — D2D marketplace, gated to approved suppliers, shows `D2D Price` badges + savings.
  - `/oem` — Dark OEM Partner Showcase with 3 partner-slot placeholders + application modal → `oem_application`.
- **D2D feature** — New migration `/app/backend/supabase_schema_d2d.sql` adds `d2d_enabled bool default false` + `d2d_price numeric(10,2)` on `listings`. Toggle + price input on each toner card in supplier dashboard. `/listings/search?d2d_only=true` filter. PUT returns 503 with clear migration-pending message when only d2d fields are sent and the columns are absent.
- **MPSInquiry schema relaxed** — `name`, `phone`, `estimated_printers` now optional. DB insert is best-effort. `email_mps_inquiry` adapts subject/heading by `selections.type`.
- **Toner image upload optional** — animated cartridge fallback is shown automatically; supplier can save without any image.

**⚠ Action item for app owner:** Apply `/app/backend/supabase_schema_d2d.sql` in the Supabase SQL editor to enable D2D persistence (the toggle UI is wired but the columns are missing in the live DB).

---


## Latest changelog (2026-02 Wave 9 — GST, Universal search, Multi-select printer specs, Cascading filters, State dropdowns)

- **GST end-to-end**:
  - Add Toner / Add Printer / Add Paper forms have a **GST rate (%)** dropdown (0/5/12/18/28) with a **live calculation panel**: "Base price: ₹X + GST (Y%): ₹Z = Total: ₹W".
  - Buyer listing cards continue to show only the base price.
  - Product detail page price block shows **"+ X% GST applied at checkout"** hint below the price.
  - Checkout summary now shows **Base + GST + Delivery = Total**. POST `/api/orders` carries `gst_rate` + `gst_amount` per order line.
- **Universal hero search** — `/api/search/universal?q=…` searches toners, printers and papers in parallel with fuzzy `ilike %q%` on brand / model / description / compatible_models / size. Exact brand matches rank first. Search results page renders **three stacked sections** (Toners · Printers · Papers) with thumbnails and "View all →" links. Hidden when a section has 0 hits.
- **Printer dealer form — multi-select pills**:
  - **Usage type** is now multi-select (Home / Corporate / Commercial / Print Shop) saved as `usage_types[]` (legacy `usage_type` populated with the first selection for backward compat).
  - New **Special Features** multi-select pills: Duplex Printing · Auto Document Feeder · Touchscreen · Cloud Printing · Mobile Printing · Secure Print · High Capacity Tray · Fax · Scanner · Wireless.
- **Cascading filter fallback** — `/api/printers` now progressively drops filters (special_feature → feature → connectivity → paper_size → function → usage_type) when strict filters return < 3 results. Relaxed rows are tagged `is_relaxed_match: true` so the frontend can render a "Best available match" hint. The endpoint also matches `usage_type` against both the legacy column and the new `usage_types[]` array.
- **State dropdown everywhere** — Indian states master list in `lib/listingConstants.js`. Checkout + OrderRequestDialog now use HTML5 `<datalist>` so typing the first letter narrows the visible states; SellerApplicationForm already used a state select. Contact/MPS forms have no state field.
- **Product detail layout** — Right column now vertically + horizontally centered (`min-h-[460px]`), brand renders as a small uppercase tracking-wide label above the model number, price block centered, GST hint below price, CTAs centered. Specs section is left-aligned full-width below for readability. Printer specs table also surfaces `usage_types`, `special_features`, `monthly_volume_recommended`, `max_resolution`, `paper_sizes`, `mobile_printing`.

**New migration** — `/app/backend/supabase_schema_wave9.sql` (adds `gst_rate` on listings/printer_listings/paper_listings/orders, `gst_amount` on orders, `usage_types[]` + `special_features[]` on printer_listings). Backend degrades gracefully column-by-column until you apply it on Supabase.

---


## Latest changelog (2026-02 Wave 8 — UX polish + Featured E2E + Test wipe)

- **Product detail title + price** — font swapped to Roboto / Helvetica / Arial stack (weight 700). Roboto-Mono retained on cards.
- **Printer listing cards** — "Request" replaced with **Add to cart** + **Buy now** matching toner cards (data-testid `printer-add-to-cart-{id}`, `printer-buy-now-{id}`).
- **Supplier header** — Orders link removed from top navbar (still in dashboard tabs).
- **Landing stats strip** — hardcoded to `500+ Dealers / 10+ Cities / 15+ Brands` until live numbers are real.
- **Featured Suppliers section** — Auto-hides entire black-strip section when zero featured (verified). "Get featured" CTA stays visible always.
- **Featured end-to-end pipeline shipped**:
  - `/get-featured` form now accepts a 16:9 banner image (≤5 MB, PNG/JPG/WEBP).
  - Admin Featured tab shows thumbnail + "Feature this company" modal that previews the applicant's banner and assigns it to an approved supplier with one click via `POST /api/admin/featured/feature-from-application`.
  - Featured card on Landing renders `featured_image_url`, name, city, tagline + **"View Listings →"** that routes to `/search?supplier_id={id}` showing only that dealer's stock.
  - `GET /api/listings/search` (+ paginated) and `GET /api/printers` accept `supplier_id` filter.
  - Public cards never expose phone or email.
- **Google sign-in** — Now uses `flushSync` + full-screen overlay (`google-signin-overlay`) — identical UX to the logout button; spinner paints instantly on click, no perceived delay.
- **Test data wipe** — Ran `cleanup_test_data --apply` (7 suppliers / 7 users / 5 listings / 3 printers / 6 papers / 4 orders) plus a manual sweep of 3 placeholder printers (model `6666` / `m111` / `M4100`).
- **New migration** — `supabase_schema_featured_v2.sql` (adds `suppliers.featured_image_url`, `suppliers.tagline`, `featured_applications.image_path`). User must run manually. Backend degrades gracefully until then.

---


## Latest changelog (2026-02 Wave 7 — UI completion batch)

Closed every "deferred to next batch" item from Wave 6. Full details in `/app/memory/CHANGELOG.md` (Wave 7 section).

- **Checkout** — 2-step flow with 5-field structured address + order summary (delivery breakdown, GST note, total). Disabled "Proceed to Payment" + active "Place Order Request".
- **OrderRequestDialog** — 5-field structured address with live delivery preview (free / intercity / orange warning).
- **Add Toner / Add Printer** — 3-box image upload UI (1 required, 2–3 optional). Brochure PDF field removed. Add Printer now collects print_speed_ppm, monthly_volume_recommended, duty_cycle, connectivity (multi-pill), max_resolution, paper_sizes (multi-pill), mobile_printing (multi-pill), intercity_delivery_charge.
- **Edit listings end-to-end** — Pencil icon on every toner/printer/paper card opens prefilled form. Saves via PUT `/supplier/listings|printers|papers/{id}`. ListingPatch backend model now accepts every editable attribute and degrades gracefully if a Supabase column is missing.
- **Sticky search** — added to `/printers` and `/printers/results`.
- **Sign-in** — "Taking longer than usual…" hint after 5 seconds.
- **Featured supplier card** — square 1:1 logo (12px radius). Phone/email already hidden from public view.
- **Grievance text** — `grievance@tonerscart.com` replaced with single support address in About + Footer + Contact.
- **Email templates** — `email_order_placed` renders structured address breakdown + delivery_charge + amber intercity/intracity note for both buyer & seller.
- **Backend route hygiene** — removed duplicate `PUT /supplier/listings/{id}` registration; canonical handler validates toner_type and writes updated_at.
- **Testing** — `/app/backend/tests/test_wave6_batch.py` 11/11 green. Iteration_13 100% pass.

---

## Latest changelog (2026-02 admin v2 — analytics, dealers, orders, content)

- **Admin Analytics tab** (recharts): live GMV, commission earned, total orders, weekly/monthly slices, dealers, buyers, active listings. Two daily-trend line charts (orders + commission, 30 days), two horizontal bar charts (top 5 toner models, top 5 dealers), donut chart of orders by city. Backend `GET /api/admin/analytics` derives everything from live Supabase data + `_commission_breakdown`.
- **Admin Dealers tab**: searchable table with order count / GMV. Row click opens detail drawer with all toner + printer listings + last 50 orders; permanent Delete per listing; Suspend / Unsuspend toggle; inline business-name / city edit. Suspended dealers are excluded from `/listings/search` and `/printers` immediately.
- **Admin Orders tab**: paginated table (50/page) with status filter, search by buyer / dealer / model, status-mutating modal, "Export CSV" with UTF-8 BOM. `GET /api/admin/orders` joins `orders → listings` and enriches with commission/payout/rate/supplier_name.
- **Admin Content tab**: editor for popular chips, marquee brands (with colour picker), per-supplier Featured toggle. Persisted to a generic `site_config(key, value jsonb)` table. Public reads via `GET /api/config/{key}` with backend-shipped defaults.
- **Order tracking**: dealer dashboard has inline `TrackingInput` — sets status to `shipped` and fires `email_order_shipped` (tracking number + WhatsApp support).
- **Buyer Confirm Delivery**: shipped orders show a green button in the customer dashboard. Transitions to `delivered` and emails `support@tonerscart.com` with commission breakdown for payout release.
- **Landing page cleanup**: every hardcoded array gone — brands, chips, featured suppliers, the fake `250+ / 15+ / 10+` stats. All hydrate from public endpoints. Featured Suppliers section hidden silently when empty; "Get featured" CTA banner remains visible.
- **New migration**: `/app/backend/supabase_schema_admin_v2.sql` — adds `suppliers.is_suspended`, `orders.tracking_number`, table `site_config`. **User runs manually**. Until then: graceful degradation everywhere (no 500s).
- **Backend tests**: 22/22 admin v2 tests pass (`/app/backend/tests/test_admin_v2.py`), 1 skipped (seed). Full regression: 91/94 — 3 pre-existing failures unrelated to this patch.
- **Note**: `seed_supabase.py` and `toner_master_seed.py` are NOT invoked on server startup.

---

## Latest changelog (2026-02 polish patch — 12 items)

- **Landing hero** rewritten to "India's digital marketplace for printers, toners & MFDs"; removed "— no middlemen" from sub-headline. Featured Suppliers section now hydrates from `/api/featured/suppliers` (admin-controlled `suppliers.is_featured`) with placeholder fallback.
- **Universal +91 PhonePrefixInput** rolled out everywhere: Register, Checkout, OrderRequestDialog, SellerApplicationForm, MPS, Contact, GetFeatured, PrintersGuide lead form. Grey non-editable `+91` box on the left; 10-digit numeric-only input on the right.
- **MPS / Contact / GetFeatured / PrintersGuide lead form** now collect Company name + 6-digit Pincode (validated client + server side).
- **/search shell** gets a visible 1.5px `#D2D2D7` border in light mode (was invisible white-on-white).
- **Add Toner / Add Printer modals** — modal containers explicitly `max-h-[92vh] overflow-y-auto` so they breathe top/bottom. Both modals gain a new optional "Technical specs / Product brochure" upload field — PDF, ≤10 MB, dashed-border + FileText icon. Uploaded through backend service-role to private `supplier-documents` bucket; path stored in `listings.spec_pdf_url` / `printer_listings.spec_pdf_url`.
- **Product card buyer actions** (Search + PrintersResults): new `ProductActions` component renders two buttons under every listing.
  - **Brochure** — enabled only when `spec_pdf_url` exists. Click → backend short-lived signed URL → opens in new tab. Anonymous → redirect to `/login`.
  - **Quotation** — always shown. Click → `POST /api/quotation` with `{listing_id, listing_type, qty}` → backend generates quote no. `TC-YYYYMMDD-XXXXX`, sends HTML quotation to buyer email + BCC support; dealer details intentionally omitted, surfaced only as **"Verified Supplier on TonersCart"**. Toast: "Quotation sent to your email".
- **Get-Featured pipeline** — new dedicated `POST /api/featured/apply` writes to `featured_applications`, emails support, and sends an applicant auto-reply with placement pricing (₹5,000 / ₹7,000 / ₹25,000) — pricing kept off the website. Status pipeline: `new → contacted → active | rejected`.
- **Admin Featured tab** — new tab in admin dashboard listing all featured applications with status dropdown (`PUT /api/admin/featured/applications/{id}/status`). Approved Suppliers list gets a per-row "Featured" toggle (`PUT /api/admin/suppliers/{id}/featured`).
- **Commission tiers** updated across the codebase (frontend `lib/commission.js`, backend `email_service._COMMISSION_TIERS`):
  - < ₹5,000 → 8 %
  - ₹5,000 – ₹25,000 → 6 %
  - ₹25,000 – ₹1,50,000 → 4 %
  - > ₹1,50,000 → deal basis (returns `null` rate; UI shows "Contact team")
- **New backend endpoints**: `/featured/apply`, `/featured/suppliers`, `/admin/featured/applications`, `/admin/featured/applications/{id}/status`, `/admin/suppliers/{id}/featured`, `/supplier/spec-pdf`, `/listings/{id}/brochure`, `/quotation`, `/supplier/listing-spec-pdf`.
- **Migration file**: `/app/backend/supabase_schema_quotation_featured.sql` — adds `is_featured` to `suppliers`, `spec_pdf_url` to `listings` + `printer_listings`, creates `featured_applications` + `quotations` audit tables. **User runs manually**; backend endpoints already degrade gracefully (no 500s) until migration runs.
- **Backend tests**: 15/15 polish-patch tests pass in `/app/backend/tests/test_polish_patch.py`. Full regression: 69 passed, 1 skipped, 3 pre-existing (unrelated) failures.

---

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


### 2026-02-25 — Wave 3 finalisation ✅ (iteration_9: 21/21 backend pass, smoke green on 8 routes)
**P0 fixes** (carried from iteration_8):
1. `GET /api/listings/{id}` 500 → 404. `server.py:get_listing` wraps the `suppliers(business_name,city,is_suspended)` join in try/except and falls back to the no-`is_suspended` join when the admin_v2 migration hasn't been applied.
2. Static `/sitemap.xml` and `/robots.txt` placed in `/app/frontend/public/` so the k8s ingress (which only routes `/api/*` to backend) falls through to CRA's static handler. Backend dynamic endpoints kept as fallback.
3. Server-side dealer agreement enforcement: `SellerApplication.agreed_to_terms: bool = False`, raise 400 if false in `/api/auth/apply-seller`.

**Frontend additions:**
- `pages/admin/FinanceTab.jsx` — Monthly summary + Dealer payouts tables + CSV downloads for both. Wired into AdminDashboard between Orders and Featured tabs.
- `components/PaperListings.jsx` — Supplier-side paper SKU add/list (brand/size/GSM/reams-per-box/₹-per-ream/stock). Triggered via `tc-open-add-paper` window event mirroring the printer pattern.
- `components/SupplierEarnings.jsx` — 4 KPI cards (Total GMV, Commission deducted, Net payout, Orders) + per-order table from `/api/supplier/earnings`.
- SupplierDashboard catalog tabs expanded to 4: Toners / Printers / Papers / My Earnings.
- Inline stock editor (click-to-edit, Enter to save) + Duplicate button on every toner card → `PUT /supplier/listings/{id}` and `POST /supplier/listings/{id}/duplicate`.
- CustomerDashboard: "Reorder this product" button on delivered/cancelled orders → `GET /listings/{id}` + cart add + navigate to `/cart`. Graceful 404/410 toasts.
- Search.jsx: switched to paginated `/listings/search/paginated` (limit=24), Load more button at the bottom.
- SellerApplicationForm.jsx: sends `agreed_to_terms`.

**Backend test report**: `/app/test_reports/iteration_9.json` — 21/21 wave3 PASS, 4 supplier-only SKIPPED (no approved-supplier seed). 0 failures.

**Frontend smoke** (testing_agent_v3_fork, iteration_9): `/`, `/search` (Load more visible), `/papers`, `/customer` (19 orders + Reorder gating), `/admin` (Finance tab: ₹1,72,942 GMV / ₹12,740 commission / ₹1,60,202 payout / 10 dealers; 2 CSV download buttons), `/forgot-password`, `/reset-password` — all render without errors.

**Still pending / Backlog** (P1/P2):
- Admin 2FA TOTP setup/verify UI (pyotp installed, no enrolment flow yet).
- Twilio OTP phone login.
- Bulk CSV upload for dealer products.
- Supplier ratings/reviews.
- Refactor `server.py` (2716 lines) into `routes/`.

**User-side migrations to run** (until then, endpoints degrade gracefully — no 500s):
- `backend/supabase_schema_papers.sql`
- `backend/supabase_schema_admin_v2.sql`
- `backend/supabase_schema_quotation_featured.sql`
- `backend/supabase_schema_logo.sql`
- `backend/supabase_schema_buyer_gst.sql`

---

## 2026-06-09 — SEO + Compatibility DB feature set (DONE)

Implemented & tested (iteration_34, backend 100%):
- Dynamic sitemap (`/sitemap.xml` + `/api/sitemap.xml`, static index points to /api), updated robots, WholesaleStore JSON-LD on homepage.
- Compatibility DB `backend/compatibility_db.py` → 543 printers / 571 toners across 12 brands (incl. Riso, Sharp), bidirectional; served via `routes/compat.py` (`/api/compat/*` + `/api/compat/notify`).
- Programmatic SEO pages `/compatible/:slug` (`pages/CompatiblePage.jsx`) with live dealer listings + Notify-me capture.
- Dealer toner/consumable/printer upload forms use searchable multi-select `CompatibleModelsSelect` bound to the compatibility DB (stored as comma-joined string; bulk grids unchanged).

**Refactor note:** `server.py` monolith refactor into `routes/` is COMPLETE (verified iteration_33, 100%).

**User-side migrations:** `supabase_schema_notify_requests.sql` (RUN ✅), `supabase_schema_order_tracking.sql` (RUN ✅). PENDING: `supabase_schema_printer_compat.sql` (adds `printer_listings.compatible_models` — graceful until run).

**Backlog (P1/P2):** Procurement Phase 2 order flow (needs `supabase_schema_procurement_orders.sql`), Procurement Phase 3 credit ledger, Twilio OTP phone login, supplier ratings/reviews, live Razorpay.
