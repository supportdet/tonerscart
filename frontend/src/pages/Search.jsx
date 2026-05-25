import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { MapPin, Boxes, Plus, Minus, ShoppingCart, X, SlidersHorizontal } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import OrderRequestDialog from "../components/OrderRequestDialog";
import TonerSearchInput from "../components/TonerSearchInput";
import TonerCartridge from "../components/TonerCartridge";
import WhatsAppEnquiry from "../components/WhatsAppEnquiry";
import ProductActions from "../components/ProductActions";
import RefilledWarningDialog from "../components/RefilledWarningDialog";
import PageMeta from "../components/PageMeta";
import useReveal from "../hooks/useReveal";
import { colorSwatch } from "../lib/colors";

const variantColorFromName = (name) => {
    const v = colorSwatch(name);
    return v.startsWith("linear") ? "#C8C8CD" : v;
};

const SidebarItem = ({ active, onClick, children, testid }) => (
    <button onClick={onClick} data-testid={testid}
        className={`block w-full text-left px-3 py-1.5 rounded-lg text-[13.5px] transition-colors ${
            active ? "bg-black/[0.05] text-[#0A0A0B] font-semibold" : "text-[#1D1D1F] hover:bg-black/[0.03]"
        }`}>
        {children}
    </button>
);

function ProductCard({ p, qty, setQty, onBuy, onCart }) {
    const typeStyle = p.toner_type === "Original"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : p.toner_type === "Compatible"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200";
    const variants = Array.isArray(p.variants) ? p.variants : [];
    return (
        <div className="tc-product-card group relative" data-testid={`product-card-${p.id}`}>
            <div className="absolute top-3 right-3 z-10">
                <WhatsAppEnquiry brand={p.brand} model={p.model_number} />
            </div>
            <Link to={`/toner/${p.id}`} className="tc-product-img block hover:opacity-95 transition" data-testid={`product-link-${p.id}`}>
                <span className="tc-product-img-label">{p.brand}</span>
                {p.image_url ? (
                    <img src={p.image_url} alt={`${p.brand} ${p.model_number}`} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                    <TonerCartridge color={p.color || "Black"} brand={p.brand} model={p.model_number} type={p.toner_type || "Original"} />
                )}
            </Link>
            <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{p.brand}</div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md border uppercase tracking-[0.08em] ${typeStyle}`}>
                        {p.toner_type || "Original"}
                    </span>
                </div>
                <Link to={`/toner/${p.id}`} className="font-mono text-[18px] font-semibold text-[#0A0A0B] tracking-tight hover:text-[#00B7C7] transition">{p.model_number}</Link>
                <div className="text-[13px] text-[#1D1D1F] truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                    {p.supplier_name || "—"}
                </div>
                <div className="text-[12px] text-[#6E6E73] flex items-center gap-1">
                    <MapPin size={11} /> {p.city}
                </div>

                {variants.length > 0 && (
                    <div className="flex items-center gap-1.5" data-testid={`card-variants-${p.id}`}>
                        {variants.slice(0, 6).map((v) => (
                            <span
                                key={v.id}
                                title={v.color}
                                className="inline-block w-3.5 h-3.5 rounded-full border border-black/10"
                                style={{ backgroundColor: variantColorFromName(v.color) }}
                            />
                        ))}
                        <span className="text-[10.5px] text-[#86868B]">{variants.length} colour{variants.length === 1 ? "" : "s"}</span>
                    </div>
                )}

                <div className="mt-2 pt-3 border-t border-black/[0.05] flex items-end justify-between gap-2">
                    <div>
                        <div className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">Price</div>
                        <div className="font-mono text-[18px] font-semibold text-[#0A0A0B]">₹{Number(p.price).toLocaleString('en-IN')}</div>
                    </div>
                    <div className="tc-qty" data-testid={`qty-${p.id}`}>
                        <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease"><Minus size={14} /></button>
                        <span data-testid={`qty-value-${p.id}`}>{qty}</span>
                        <button type="button" onClick={() => setQty(Math.min(p.stock, qty + 1))} disabled={qty >= p.stock} aria-label="Increase"><Plus size={14} /></button>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => onCart(p, qty)} className="btn-light text-[12.5px] py-2" data-testid={`add-to-cart-${p.id}`}>
                        <ShoppingCart size={13} className="inline mr-1" /> Add
                    </button>
                    <button onClick={() => onBuy(p, qty)} className="btn-cta text-[12.5px] py-2" disabled={p.stock <= 0} data-testid={`buy-now-${p.id}`}>
                        {p.stock > 0 ? "Buy" : "Out of stock"}
                    </button>
                </div>
                <div className="mt-2">
                    <ProductActions listing={p} listingType="toner" qty={qty} />
                </div>
            </div>
        </div>
    );
}

export default function SearchPage() {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { city, setCity } = useCity();
    const [q, setQ] = useState(params.get("q") || "");
    const [brand, setBrand] = useState(params.get("brand") || "all");
    const [filterCity, setFilterCity] = useState(params.get("city") || "all");
    const [tonerType, setTonerType] = useState(params.get("toner_type") || "all");
    const [refilledWarn, setRefilledWarn] = useState(false);
    const [facets, setFacets] = useState({ brands: [], cities: [] });
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [orderProduct, setOrderProduct] = useState(null);
    const [orderQty, setOrderQty] = useState(1);
    const [qtyMap, setQtyMap] = useState({});
    const { items: cartItems, addItem } = useCart();
    const rootRef = useReveal([products.length]);

    useEffect(() => {
        api.get("/listings/facets")
            .then((r) => setFacets(r.data || {}))
            .catch(() => setFacets({}));
    }, []);

    const buildParams = () => {
        const qp = {};
        if (params.get("q")) qp.q = params.get("q");
        if (params.get("brand")) qp.brand = params.get("brand");
        if (params.get("city") && params.get("city") !== "all") qp.city = params.get("city");
        if (params.get("toner_type") && params.get("toner_type") !== "all") qp.toner_type = params.get("toner_type");
        return qp;
    };

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            setPage(1);
            try {
                const r = await api.get("/listings/search/paginated", { params: { ...buildParams(), page: 1, limit: 24 } });
                const items = Array.isArray(r.data?.results) ? [...r.data.results] : [];
                items.sort((a, b) => (a?.price ?? 0) - (b?.price ?? 0));
                setProducts(items);
                setTotalPages(r.data?.pages || 1);
            } catch {
                setProducts([]);
                setTotalPages(1);
            } finally { setLoading(false); }
        };
        fetch();
    }, [params]);

    const loadMore = async () => {
        if (loadingMore || page >= totalPages) return;
        setLoadingMore(true);
        try {
            const next = page + 1;
            const r = await api.get("/listings/search/paginated", { params: { ...buildParams(), page: next, limit: 24 } });
            const newRows = Array.isArray(r.data?.results) ? r.data.results : [];
            setProducts((prev) => {
                const seen = new Set(prev.map((x) => x.id));
                const merged = [...prev, ...newRows.filter((x) => !seen.has(x.id))];
                merged.sort((a, b) => (a?.price ?? 0) - (b?.price ?? 0));
                return merged;
            });
            setPage(next);
            setTotalPages(r.data?.pages || totalPages);
        } catch { /* silent */ }
        finally { setLoadingMore(false); }
    };

    const apply = (override) => {
        const useQ = override?.query ?? q;
        const p = new URLSearchParams();
        if (useQ) p.set("q", useQ);
        if (brand && brand !== "all") p.set("brand", brand);
        if (tonerType && tonerType !== "all") p.set("toner_type", tonerType);
        if (filterCity && filterCity !== "all") p.set("city", filterCity);
        setParams(p);
    };

    const setFilter = (key, val) => {
        const p = new URLSearchParams(params);
        if (val === "all" || !val) p.delete(key); else p.set(key, val);
        setParams(p);
        if (key === "brand") setBrand(val);
        if (key === "toner_type") setTonerType(val);
        if (key === "city") {
            setFilterCity(val);
            if (val !== "all") setCity(val);
        }
    };

    const clearAll = () => { setQ(""); setBrand("all"); setTonerType("all"); setFilterCity("all"); setParams(new URLSearchParams()); };

    const activeFilters = useMemo(() => {
        const out = [];
        if (params.get("q")) out.push({ k: "q", label: `"${params.get("q")}"` });
        if (params.get("brand")) out.push({ k: "brand", label: params.get("brand") });
        if (params.get("city")) out.push({ k: "city", label: params.get("city") });
        if (params.get("toner_type")) out.push({ k: "toner_type", label: params.get("toner_type") });
        return out;
    }, [params]);

    const getQty = (pid) => qtyMap[pid] ?? 1;
    const setQty = (pid, n) => setQtyMap((m) => ({ ...m, [pid]: n }));

    const [filtersOpen, setFiltersOpen] = useState(false);

    const FiltersBlock = () => (
        <>
            <div className="tc-card-flat p-5">
                <div className="flex items-center gap-2 mb-3">
                    <span className="w-1 h-4 rounded-full bg-[#00B7C7]" />
                    <span className="text-[12px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Brand</span>
                </div>
                <div className="space-y-0.5">
                    <SidebarItem active={brand === "all"} onClick={() => setFilter("brand", "all")} testid="filter-brand-all">All brands</SidebarItem>
                    {(facets?.brands || []).map((b) => (<SidebarItem key={b} active={brand === b} onClick={() => setFilter("brand", b)} testid={`filter-brand-${b}`}>{b}</SidebarItem>))}
                </div>
            </div>

            <div className="tc-card-flat p-5">
                <div className="flex items-center gap-2 mb-3">
                    <span className="w-1 h-4 rounded-full bg-[#E6007E]" />
                    <span className="text-[12px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>City</span>
                </div>
                <div className="space-y-0.5 max-h-72 overflow-auto pr-1">
                    <SidebarItem active={filterCity === "all"} onClick={() => setFilter("city", "all")} testid="filter-city-all">All cities</SidebarItem>
                    {KNOWN_CITIES.map((c) => (<SidebarItem key={c} active={filterCity === c} onClick={() => setFilter("city", c)} testid={`filter-city-${c}`}>{c}</SidebarItem>))}
                </div>
            </div>

            <div className="tc-card-flat p-5">
                <div className="flex items-center gap-2 mb-3">
                    <span className="w-1 h-4 rounded-full bg-[#F5C400]" />
                    <span className="text-[12px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Toner type</span>
                </div>
                <div className="space-y-0.5">
                    {["all", "Original", "Compatible", "Refilled"].map((t) => (
                        <SidebarItem
                            key={t}
                            active={tonerType === t}
                            onClick={() => {
                                if (t === "Refilled") { setRefilledWarn(true); return; }
                                setFilter("toner_type", t);
                            }}
                            testid={`filter-type-${t}`}
                        >
                            {t === "all" ? "All types" : t}
                        </SidebarItem>
                    ))}
                </div>
            </div>
        </>
    );

    const onBuy = (p, qty) => {
        if (user && user.role === "admin") {
            toast.error("Admins cannot place buyer orders");
            return;
        }
        setOrderQty(qty); setOrderProduct(p);
    };
    const onCart = (p, qty) => {
        addItem(p, qty);
        toast.success(`Added ${p.brand} ${p.model_number} to cart`);
    };

    return (
        <div className="tc-container py-6 sm:py-10" ref={rootRef} data-testid="search-page">
            <PageMeta
                title={q ? `Buy ${q} Toner Cartridge Online India — TonersCart`
                          : `Buy Printer Toner Cartridges Online${city ? ` in ${city}` : ""} — HP, Canon, Brother, Xerox | TonersCart`}
                description={q ? `Compare prices for ${q} toner cartridge from verified suppliers across India. Original and compatible options available.`
                                : city
                                  ? `Buy HP, Canon, Brother toner cartridges from verified suppliers in ${city}. Compare prices, real stock, same-day dispatch available.`
                                  : "Buy original and compatible printer toner cartridges online in India. Compare prices from verified suppliers. HP 88A, Canon 337, Brother TN-2365, Xerox toners and more."}
                path="/search"
            />
            <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-2 pb-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-black/[0.04]" data-testid="search-sticky-wrapper">
                <div className="tc-search-shell tc-search-light" data-testid="search-bar">
                    <TonerSearchInput value={q} onChange={setQ} onSubmit={apply} testId="search-input" placeholder="Search by brand or model number…" />
                    <button onClick={() => apply()} className="tc-search-go" data-testid="search-apply-btn">Search</button>
                </div>
            </div>

            {/* Mobile filter trigger row */}
            <div className="lg:hidden flex items-center justify-between mt-4 gap-3">
                <button
                    onClick={() => setFiltersOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D2D2D7] bg-white text-[13px] font-semibold text-[#0A0A0B] hover:bg-black/[0.03]"
                    data-testid="mobile-filters-btn"
                >
                    <SlidersHorizontal size={14} /> Filters {activeFilters.length > 0 && (<span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#0A0A0B] text-white text-[10px] font-bold">{activeFilters.length}</span>)}
                </button>
                <div className="text-[12px] text-[#6E6E73]" data-testid="mobile-results-count">
                    {loading ? "Loading…" : `${products.length} listings`}
                </div>
            </div>

            {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-5">
                    <span className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">Active</span>
                    {activeFilters.map((f) => (
                        <button key={f.k} onClick={() => setFilter(f.k, "all")} className="tc-badge tc-badge-gray flex items-center gap-1 hover:bg-black/[0.06]" data-testid={`active-filter-${f.k}`}>
                            {f.label} <X size={10} />
                        </button>
                    ))}
                    <button onClick={clearAll} className="text-[12px] text-[#00B7C7] font-semibold hover:underline" data-testid="clear-filters-btn">Clear all</button>
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 mt-6 lg:mt-8">
                {/* Desktop sidebar */}
                <aside className="hidden lg:block lg:col-span-3 lg:sticky lg:top-24 lg:self-start space-y-5" data-testid="search-sidebar">
                    <FiltersBlock />

                    {cartItems.length > 0 && (
                        <div className="tc-card-flat p-5" data-testid="cart-summary">
                            <div className="flex items-center gap-2 mb-3">
                                <ShoppingCart size={14} className="text-[#0A0A0B]" />
                                <span className="text-[12px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Cart ({cartItems.length})</span>
                            </div>
                            <div className="space-y-2 mb-3">
                                {cartItems.slice(0, 3).map((it) => (
                                    <div key={it.id} className="flex items-center justify-between text-[12px]">
                                        <span className="truncate">{it.product.model_number} ×{it.qty}</span>
                                        <span className="font-mono">₹{(Number(it.product.price) * it.qty).toLocaleString('en-IN')}</span>
                                    </div>
                                ))}
                                {cartItems.length > 3 && <div className="text-[11px] text-[#6E6E73]">+{cartItems.length - 3} more</div>}
                            </div>
                            <button onClick={() => navigate("/cart")} className="btn-cta w-full text-[12.5px] py-2" data-testid="cart-summary-view-btn">View cart</button>
                        </div>
                    )}
                </aside>

                <main className="lg:col-span-9">
                    <div className="hidden lg:flex items-end justify-between mb-6">
                        <div>
                            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Results</div>
                            <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 2.6vw, 34px)", fontWeight: 300, letterSpacing: "-0.015em", lineHeight: 1.14 }} data-testid="search-results-count">
                                {loading ? "Loading…" : `${products.length} listings${filterCity !== "all" ? ` · ${filterCity}` : ""}`}
                            </h1>
                        </div>
                    </div>

                    {loading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
                        </div>
                    )}

                    {!loading && products.length === 0 && (
                        <div className="tc-card p-8 sm:p-16 text-center" data-testid="search-empty-state">
                            <Boxes className="mx-auto text-[#D2D2D7]" size={48} />
                            <div className="mt-4 text-[#0A0A0B] text-xl font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>No matching toners</div>
                            <div className="text-[#6E6E73] text-[14px] mt-1">Try a different model or clear filters.</div>
                            <button className="btn-cta mt-6" onClick={clearAll} data-testid="empty-clear-btn">Clear filters</button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {products.map((p, idx) => (
                            <div key={p.id} className="tc-reveal" style={{ transitionDelay: `${Math.min(idx * 35, 280)}ms` }}>
                                <ProductCard p={p} qty={getQty(p.id)} setQty={(n) => setQty(p.id, n)} onBuy={onBuy} onCart={onCart} />
                            </div>
                        ))}
                    </div>

                    {!loading && products.length > 0 && page < totalPages && (
                        <div className="mt-8 flex items-center justify-center">
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="btn-light px-8 py-3 text-[13px] font-semibold disabled:opacity-60"
                                data-testid="search-load-more-btn"
                            >
                                {loadingMore ? "Loading more…" : `Load more (page ${page + 1}/${totalPages})`}
                            </button>
                        </div>
                    )}
                </main>
            </div>

            {/* Mobile filter drawer */}
            {filtersOpen && (
                <div className="fixed inset-0 z-[80] lg:hidden" data-testid="mobile-filters-drawer">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
                    <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl max-h-[85vh] overflow-auto p-5 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between sticky top-0 bg-white pb-3 -mx-1 px-1 border-b border-black/[0.06]">
                            <div>
                                <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">Refine</div>
                                <div className="text-[18px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Filters</div>
                            </div>
                            <button onClick={() => setFiltersOpen(false)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-black/[0.05]" aria-label="Close" data-testid="mobile-filters-close-btn">
                                <X size={18} />
                            </button>
                        </div>
                        <FiltersBlock />
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <button onClick={() => { clearAll(); setFiltersOpen(false); }} className="btn-light text-[13px] py-2.5" data-testid="mobile-filters-clear-btn">Clear all</button>
                            <button onClick={() => setFiltersOpen(false)} className="btn-cta text-[13px] py-2.5" data-testid="mobile-filters-apply-btn">Show {products.length} results</button>
                        </div>
                    </div>
                </div>
            )}

            {orderProduct && (
                <OrderRequestDialog product={orderProduct} initialQty={orderQty} onClose={() => setOrderProduct(null)} />
            )}
            <RefilledWarningDialog open={refilledWarn} onClose={() => setRefilledWarn(false)} />
        </div>
    );
}
