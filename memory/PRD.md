# TonersCart — Product Requirements Document

## Original problem statement
Build a full-stack B2B marketplace web application called TonersCart for India where customers can search and order printer toners from multiple suppliers. Marketplace (like IndiaMART but only for toners). 3 roles: Customer, Supplier (admin-approved), Admin. Core: search by toner model, multi-supplier listings, order request system (no payment), status tracking, role-based dashboards.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB) on `:8001`, all routes under `/api`
- **Frontend**: React 19 + Tailwind + Shadcn UI + react-router 7 on `:3000`
- **Auth**: JWT (PyJWT) + bcrypt, supports Bearer header + httpOnly cookie
- **DB**: `tonerscart_db` with collections — `users`, `toner_master`, `products`, `orders`

## User personas
- **Customer / Buyer**: Procurement managers, IT admins, resellers needing bulk toners
- **Supplier**: Toner distributors / dealers across Indian cities
- **Admin**: Platform operator approving suppliers, monitoring marketplace

## Core requirements (static)
- Search by toner model with brand + city filters
- Multi-supplier listings grouped by toner model (price comparison)
- Order request workflow (no payment): requested → accepted → shipped (tracking) → completed
- Supplier signup with admin approval
- Role-based protected routes/dashboards
- TonerMaster catalog so suppliers select from a canonical list (no free-text typo issues)

## What's been implemented
### 2026-05-02 — MVP build (initial)
- JWT auth, 3 roles (customer/supplier/admin), seeded admin
- TonerMaster catalog: **174 entries** across HP, Canon, Brother, Samsung, Ricoh, Epson, Xerox, Kyocera (Original/Compatible/Refilled variants)
- 25 approved suppliers across major Indian cities (Delhi, Mumbai, Bangalore, Chennai, Hyderabad, Pune, Kolkata, Ahmedabad, Jaipur, Lucknow, Chandigarh, Surat, Indore, Nagpur, Coimbatore, Kochi, Bhopal, Noida, Gurgaon, Faridabad, Vadodara, Ludhiana, Visakhapatnam, Thane, Patna)
- 1 pending supplier (for admin approval testing)
- 3 demo customers + 8 demo orders
- 615 product listings (each TonerMaster mapped to 2–5 suppliers with varied price/stock)
- Smart search with normalization (`HP88A` = `hp 88 a` = `88-A` = `88a`) using `model_normalized` + `search_norm` fields
- TonerMaster autocomplete dropdown on landing hero, search page, and supplier Add-Product dialog
- Sidebar filters on Search page: brand, city, toner type
- Order request dialog with quantity/address/phone/notes
- Supplier dashboard: TonerMaster-driven product creation, order pipeline (accept/ship+tracking/complete)
- Admin dashboard: pending approvals, all users, all products, all orders, platform stats
- CMYK-themed UI (charcoal #0E0F12 base, cyan #00B7C7, magenta #E6007E, yellow #F7C600 CTAs)
- Tested: 35/35 backend tests pass; all critical frontend flows verified by testing agent

### 2026-05-02 — UI polish + mobile-first responsive
- Removed glassmorphism nav, reverted to clean white sticky header
- Realistic toner cartridge SVG (light gray plastic body, brand-coloured label band, drum roller, drop shadow) replacing dark blocks
- Thin Montserrat headline (weight 300) across hero, top-models, register
- Hero search bar widened, top-aligned, "All brands" select removed (user request)
- Removed 3-second login popup (user request)
- **Mobile-first responsive overhaul**:
  - Hamburger drawer menu with city pills, Browse/Sell/Sign-in
  - Hero stacks animation-on-top, text below on mobile (order-1/order-2)
  - Stats grid: 2-col mobile → 4-col desktop
  - Top-models grid: 2-col mobile → 4-col desktop
  - Search page: mobile shows "Filters" button + bottom-sheet drawer; desktop shows sticky sidebar
  - Product cards: 1-col mobile → 2-col tablet → 3-col desktop
  - AI chat panel goes full-width on mobile, floating on desktop
  - Search input + button: stacked on <640px, inline on ≥640px
  - Register form: 1-col mobile → 2-col tablet+
- Supplier registration form expanded with brands, GST, business address, areas supplied, customer base, monthly volume, notes
- Supplier-apply endpoint (`/api/auth/supplier-apply`) writes to `supplier_applications` and emails `support@digitaledgeinida.com` (SMTP path; Resend integration pending API key)

## Prioritized backlog
### P1 (next phase)
- Add pagination on /api/admin/* and /api/orders/mine
- Image uploads for products (object storage)
- Email notifications on order status changes (Resend or SMTP)
- Saved searches / saved suppliers for buyers
- Supplier ratings & buyer reviews

### P2 (nice-to-have)
- Bulk CSV import for supplier products
- Multi-currency / GST invoice helper
- Buyer-side "request quote across all suppliers" for a model
- Admin: cleanup endpoint for TEST_ accounts left from QA runs
- Better fuzzy search (Levenshtein) for misspelled brand names

## Test credentials
See `/app/memory/test_credentials.md`

## Key files
- Backend: `/app/backend/server.py`, `/app/backend/toner_master_seed.py`
- Frontend: `/app/frontend/src/{App.js, pages/*, components/*, context/AuthContext.jsx, lib/api.js, index.css}`
