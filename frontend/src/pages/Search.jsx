import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { MapPin, Boxes, Plus, Minus, ShoppingCart, X, Sparkles } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import TonerCartridge from "../components/TonerCartridge";
import VerifiedBadge from "../components/VerifiedBadge";
import RefilledWarningDialog from "../components/RefilledWarningDialog";
import PageMeta from "../components/PageMeta";
import CategoryFilters from "../components/CategoryFilters";
import UniversalSearch from "../components/UniversalSearch";
import { PRINTER_TONER_BRANDS } from "../lib/listingConstants";
import useReveal from "../hooks/useReveal";
import { colorSwatch } from "../lib/colors";
import { cityMatch, deliveryLabel } from "../lib/location";

const variantColorFromName = (name) => {
    const v = colorSwatch(name);
    return v.startsWith("linear") ? "#C8C8CD" : v;
};

const TONER_SORT_OPTIONS = [
    { value: "local", label: "Local suppliers first" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "newest", label: "Newest first" },
];

function ProductCard({ p, qty, setQty, onBuy, onCart, userCity }) {
    const typeStyle = p.toner_type === "Original"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : p.toner_type === "Compatible"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200";
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const loc = deliveryLabel(p.city || p.supplier_city, userCity);
    return (
        <div className="tc-product-card group relative" data-testid={`product-card-${p.id}`}>
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
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[13px] text-[#1D1D1F] truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        {p.supplier_name || "—"}
                    </span>
                    <VerifiedBadge compact />
                </div>
                <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] text-[#6E6E73] flex items-center gap-1">
                        <MapPin size={11} /> {p.city}
                    </div>
                    {loc.text && (
                        <span
                            className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`}
                            data-testid={`delivery-label-${p.id}`}
                        >
                            {loc.local ? "Local · Free delivery" : loc.text}
                        </span>
                    )}
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
            </div>
        </div>
    );
}

export default function SearchPage() {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { city, setCity } = useCity();
    const cat = params.get("cat") || "all";
    const setCat = (next) => {
        const p = new URLSearchParams(params);
        if (next === "all") p.delete("cat"); else p.set("cat", next);
        setParams(p);
    };
    const [q, setQ] = useState(params.get("q") || "");
    const [brand, setBrand] = useState(params.get("brand") || "all");
    const [filterCity, setFilterCity] = useState(params.get("city") || "all");
    const [tonerType, setTonerType] = useState(params.get("toner_type") || "all");
    const [refilledWarn, setRefilledWarn] = useState(false);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [qtyMap, setQtyMap] = useState({});
    const [minPrice, setMinPrice] = useState("");
    const [maxPrice, setMaxPrice] = useState("");
    const [sortBy, setSortBy] = useState("local");
    const { addItem } = useCart();
    const rootRef = useReveal([products.length]);

    // Universal multi-category results. Keyword search runs instantly; an
    // AI-parsed search (Gemini) runs in parallel and enhances/replaces results.
    const [universal, setUniversal] = useState(null);
    const [aiInfo, setAiInfo] = useState(null); // { answer, params } when Gemini enhanced
    useEffect(() => {
        const qq = (params.get("q") || "").trim();
        let cancelled = false;
        (async () => {
            if (!qq) {
                if (!cancelled) { setUniversal(null); setAiInfo(null); }
                return;
            }
            if (!cancelled) setAiInfo(null);
            let aiApplied = false;
            // 1) Instant keyword results
            const kwP = api.get("/search/universal", { params: { q: qq, limit_per_type: 12 } })
                .then((r) => { if (!cancelled && !aiApplied) setUniversal(r.data || null); })
                .catch(() => { if (!cancelled && !aiApplied) setUniversal(null); });
            // 2) AI-enhanced results in parallel — replace when ready
            const aiP = api.get("/search/ai", { params: { q: qq, limit_per_type: 12 } })
                .then((res) => {
                    if (cancelled || !res.data?.ai) return;
                    const c = res.data.counts || {};
                    const total = (c.toners || 0) + (c.printers || 0) + (c.papers || 0) + (c.consumables || 0) + (c.oem || 0);
                    if (total > 0) { aiApplied = true; setUniversal(res.data); }
                    setAiInfo({ answer: res.data.answer || null, params: res.data.params || null });
                })
                .catch(() => { /* keep keyword results */ });
            await Promise.allSettled([kwP, aiP]);
        })();
        return () => { cancelled = true; };
    }, [params]);

    const buildParams = () => {
        const qp = {};
        if (params.get("q")) qp.q = params.get("q");
        if (params.get("brand")) qp.brand = params.get("brand");
        if (params.get("city") && params.get("city") !== "all") qp.city = params.get("city");
        if (params.get("toner_type") && params.get("toner_type") !== "all") qp.toner_type = params.get("toner_type");
        if (params.get("supplier_id")) qp.supplier_id = params.get("supplier_id");
        // Location-based ordering — surface buyer's-city listings first when not
        // hard-filtered by a specific city.
        if (!(params.get("city") && params.get("city") !== "all") && city) qp.near_city = city;
        return qp;
    };

    // Local-first then cheapest. Mirrors the backend near_city ordering so the
    // client sort doesn't undo it.
    const byCityThenPrice = (a, b) => {
        if (city) {
            const am = cityMatch(a?.city || a?.supplier_city, city) ? 0 : 1;
            const bm = cityMatch(b?.city || b?.supplier_city, city) ? 0 : 1;
            if (am !== bm) return am - bm;
        }
        return (a?.price ?? 0) - (b?.price ?? 0);
    };

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            setPage(1);
            try {
                const r = await api.get("/listings/search/paginated", { params: { ...buildParams(), page: 1, limit: 24 } });
                const items = Array.isArray(r.data?.results) ? [...r.data.results] : [];
                items.sort(byCityThenPrice);
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
                merged.sort(byCityThenPrice);
                return merged;
            });
            setPage(next);
            setTotalPages(r.data?.pages || totalPages);
        } catch { /* silent */ }
        finally { setLoadingMore(false); }
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

    const clearAll = () => { setQ(""); setBrand("all"); setTonerType("all"); setFilterCity("all"); setMinPrice(""); setMaxPrice(""); setSortBy("local"); setParams(new URLSearchParams()); };

    const getQty = (pid) => qtyMap[pid] ?? 1;
    const setQty = (pid, n) => setQtyMap((m) => ({ ...m, [pid]: n }));

    // True when a city is active and none of the loaded results are local —
    // we still show everything, just with a clear "from other cities" note.
    const showingOtherCities = useMemo(() => {
        if (!city || loading || products.length === 0) return false;
        if (params.get("city") && params.get("city") !== "all") return false;
        return !products.some((p) => cityMatch(p.city || p.supplier_city, city));
    }, [products, city, params, loading]);

    // Horizontal filter bar value + handlers. Brand/Type/City are server-driven
    // (refetch via URL params); price + sort are applied client-side on the
    // loaded results so they apply instantly.
    const tonerFilterValue = {
        brand: brand === "all" ? "" : brand,
        type: tonerType === "all" ? "" : tonerType,
        city: filterCity === "all" ? "" : filterCity,
        minPrice, maxPrice, sort: sortBy,
    };
    const onTonerFilterChange = (next) => {
        if ((next.brand || "") !== (tonerFilterValue.brand || "")) setFilter("brand", next.brand || "all");
        if ((next.city || "") !== (tonerFilterValue.city || "")) setFilter("city", next.city || "all");
        if ((next.type || "") !== (tonerFilterValue.type || "")) {
            if (next.type === "Refilled") { setRefilledWarn(true); }
            else setFilter("toner_type", next.type || "all");
        }
        setMinPrice(next.minPrice || "");
        setMaxPrice(next.maxPrice || "");
        setSortBy(next.sort || "local");
    };

    const visibleProducts = useMemo(() => {
        let out = products.filter((p) => {
            const price = Number(p.price || 0);
            if (minPrice && price < Number(minPrice)) return false;
            if (maxPrice && price > Number(maxPrice)) return false;
            return true;
        });
        if (sortBy === "price_asc") out = [...out].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
        else if (sortBy === "price_desc") out = [...out].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
        else if (sortBy === "newest") out = [...out].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        else out = [...out].sort(byCityThenPrice);
        return out;
    }, [products, minPrice, maxPrice, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

    const onBuy = (p, qty) => {
        if (user && user.role === "admin") {
            toast.error("Admins cannot place buyer orders");
            return;
        }
        addItem(p, qty);
        navigate("/checkout");
    };
    const onCart = (p, qty) => {
        addItem(p, qty);
        toast.success(`Added ${p.brand} ${p.model_number} to cart`);
    };

    return (
        <div className="tc-container py-6 sm:py-10" ref={rootRef} data-testid="search-page">
            <PageMeta
                title={q ? `${q} Price India — TonersCart`
                          : `Buy Toner Cartridges Online India — Verified Dealers | TonersCart`}
                description={q ? `Compare prices for ${q} from verified suppliers across India. Original and compatible options available.`
                                : city
                                  ? `Buy HP, Canon, Brother toner cartridges from verified suppliers in ${city}. Compare prices, real stock, same-day dispatch available.`
                                  : "Buy original and compatible printer toner cartridges online in India from verified dealers. Compare prices, real stock. HP 88A, Canon 337, Brother TN-2365, Xerox toners and more."}
                path="/search"
            />
            <div className="mb-5" data-testid="toners-universal-search">
                <UniversalSearch initial={q} />
            </div>
            <div className="flex items-center gap-3 mb-2" data-testid="search-header">
                <span className="tc-strip" />
                <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">{q ? "Search results" : "Buy Toners"}</span>
            </div>
            <h1 className="text-[28px] sm:text-[34px] text-[#0A0A0B] mb-2" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                {q ? `Results for "${q}"` : "Toner cartridges from verified dealers"}
            </h1>

            {/* Universal category tabs — appear when a search query is active */}
            {aiInfo && (
                <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#BFEAEF] bg-[#F5FDFE] px-4 py-3" data-testid="ai-search-banner">
                    <span className="inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold text-[#00838f] bg-white border border-[#BFEAEF] rounded-full px-2 py-0.5" data-testid="ai-powered-badge">
                        <Sparkles size={12} /> AI-powered
                    </span>
                    {aiInfo.answer && <p className="text-[13px] text-[#3a3a40] leading-snug" data-testid="ai-search-answer">{aiInfo.answer}</p>}
                </div>
            )}

            {universal && (
                <div className="mt-5 flex flex-wrap gap-2" data-testid="universal-category-tabs">
                    {[
                        { key: "all", label: "All", n: (universal.counts?.toners || 0) + (universal.counts?.printers || 0) + (universal.counts?.papers || 0) + (universal.counts?.consumables || 0) + (universal.counts?.oem || 0) },
                        { key: "toners", label: "Toners", n: universal.counts?.toners || 0 },
                        { key: "printers", label: "Printers", n: universal.counts?.printers || 0 },
                        { key: "papers", label: "Papers", n: universal.counts?.papers || 0 },
                        { key: "consumables", label: "Consumables", n: universal.counts?.consumables || 0 },
                        { key: "oem", label: "OEM", n: universal.counts?.oem || 0 },
                    ].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setCat(t.key)}
                            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border transition ${cat === t.key ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]"}`}
                            data-testid={`universal-tab-${t.key}`}
                        >
                            {t.label} <span className={cat === t.key ? "text-white/70" : "text-[#86868B]"}>{t.n}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Universal multi-category results — gated by the active category tab */}
            {universal && (universal.counts?.toners + universal.counts?.printers + universal.counts?.papers + (universal.counts?.consumables || 0) + (universal.counts?.oem || 0)) > 0 && (
                <div className="mt-6 space-y-8" data-testid="universal-results">
                    {cat === "all" && universal.counts.toners > 0 && (
                        <section data-testid="universal-section-toners">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Toners <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.toners} found</span>
                                </h2>
                                <button onClick={() => setCat("toners")} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-toners">View all →</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {universal.toners.map((t) => (
                                    <Link key={t.id} to={`/toner/${t.id}`} className="block bg-white border border-black/[0.06] rounded-xl overflow-hidden hover:shadow-md transition" data-testid={`universal-toner-${t.id}`}>
                                        <div className="aspect-square bg-black/[0.03] grid place-items-center">
                                            {t.image_url ? <img src={t.image_url} alt={`${t.brand} ${t.model_number}`} className="w-full h-full object-cover" loading="lazy" /> : <Boxes size={28} className="text-[#D2D2D7]" />}
                                        </div>
                                        <div className="p-2.5">
                                            <div className="text-[11px] text-[#86868B] uppercase tracking-wider truncate">{t.brand}</div>
                                            <div className="text-[12.5px] font-semibold text-[#0A0A0B] truncate">{t.model_number}</div>
                                            <div className="text-[13px] font-mono text-[#0A0A0B] mt-1">₹{Number(t.price || 0).toLocaleString("en-IN")}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                    {(cat === "all" || cat === "printers") && universal.counts.printers > 0 && (
                        <section data-testid="universal-section-printers">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Printers <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.printers} found</span>
                                </h2>
                                <button onClick={() => navigate(`/printers/results?q=${encodeURIComponent(universal.q)}`)} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-printers">Browse printers →</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {universal.printers.map((p) => (
                                    <Link key={p.id} to={`/printer/${p.id}`} className="block bg-white border border-black/[0.06] rounded-xl overflow-hidden hover:shadow-md transition" data-testid={`universal-printer-${p.id}`}>
                                        <div className="aspect-[4/3] bg-black/[0.03] grid place-items-center">
                                            {p.image_url ? <img src={p.image_url} alt={`${p.brand} ${p.model_number}`} className="w-full h-full object-contain" loading="lazy" /> : <Boxes size={28} className="text-[#D2D2D7]" />}
                                        </div>
                                        <div className="p-2.5">
                                            <div className="text-[11px] text-[#86868B] uppercase tracking-wider truncate">{p.brand}</div>
                                            <div className="text-[12.5px] font-semibold text-[#0A0A0B] truncate">{p.model_number}</div>
                                            <div className="text-[13px] font-mono text-[#0A0A0B] mt-1">₹{Number(p.price || 0).toLocaleString("en-IN")}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                    {(cat === "all" || cat === "papers") && universal.counts.papers > 0 && (
                        <section data-testid="universal-section-papers">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Papers <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.papers} found</span>
                                </h2>
                                <button onClick={() => navigate(`/papers?q=${encodeURIComponent(universal.q)}`)} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-papers">Browse papers →</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {universal.papers.map((p) => (
                                    <Link key={p.id} to={`/paper/${p.id}`} className="block bg-white border border-black/[0.06] rounded-xl overflow-hidden hover:shadow-md transition" data-testid={`universal-paper-${p.id}`}>
                                        <div className="aspect-square bg-black/[0.03] grid place-items-center">
                                            {p.image_url ? <img src={p.image_url} alt={`${p.brand} ${p.size}`} className="w-full h-full object-cover" loading="lazy" /> : <Boxes size={28} className="text-[#D2D2D7]" />}
                                        </div>
                                        <div className="p-2.5">
                                            <div className="text-[11px] text-[#86868B] uppercase tracking-wider truncate">{p.brand}</div>
                                            <div className="text-[12.5px] font-semibold text-[#0A0A0B] truncate">{p.size} · {p.gsm} GSM</div>
                                            <div className="text-[13px] font-mono text-[#0A0A0B] mt-1">₹{Number(p.price_per_ream || 0).toLocaleString("en-IN")}/ream</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                    {(cat === "all" || cat === "consumables") && (universal.counts.consumables || 0) > 0 && (
                        <section data-testid="universal-section-consumables">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Consumables <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.consumables} found</span>
                                </h2>
                                <button onClick={() => navigate(`/consumables`)} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-consumables">Browse consumables →</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {universal.consumables.map((c) => (
                                    <Link key={c.id} to={`/consumable/${c.id}`} className="block bg-white border border-black/[0.06] rounded-xl overflow-hidden hover:shadow-md transition" data-testid={`universal-consumable-${c.id}`}>
                                        <div className="aspect-square bg-black/[0.03] grid place-items-center">
                                            {c.image_url ? <img src={c.image_url} alt={`${c.brand} ${c.model_number}`} className="w-full h-full object-cover" loading="lazy" /> : <Boxes size={28} className="text-[#D2D2D7]" />}
                                        </div>
                                        <div className="p-2.5">
                                            <div className="text-[11px] text-[#86868B] uppercase tracking-wider truncate">{c.brand} · {c.subcategory}</div>
                                            <div className="text-[12.5px] font-semibold text-[#0A0A0B] truncate">{c.model_number}</div>
                                            <div className="text-[13px] font-mono text-[#0A0A0B] mt-1">₹{Number(c.price || 0).toLocaleString("en-IN")}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                    {(cat === "all" || cat === "oem") && (universal.counts.oem || 0) > 0 && (
                        <section data-testid="universal-section-oem">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    OEM Marketplace <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.oem} found</span>
                                </h2>
                                <button onClick={() => navigate(`/oem`)} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-oem">Browse OEM →</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {universal.oem.map((o) => (
                                    <Link key={o.id} to={`/oem`} className="block bg-white border border-black/[0.06] rounded-xl overflow-hidden hover:shadow-md transition" data-testid={`universal-oem-${o.id}`}>
                                        <div className="aspect-square bg-black/[0.03] grid place-items-center">
                                            {o.image_url ? <img src={o.image_url} alt={`${o.brand} ${o.name}`} className="w-full h-full object-contain" loading="lazy" /> : <Boxes size={28} className="text-[#D2D2D7]" />}
                                        </div>
                                        <div className="p-2.5">
                                            <div className="text-[11px] text-[#86868B] uppercase tracking-wider truncate">{o.brand}</div>
                                            <div className="text-[12.5px] font-semibold text-[#0A0A0B] truncate">{o.name || o.model_number}</div>
                                            <div className="text-[11.5px] font-semibold text-[#00B7C7] mt-1">Enquiry only →</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}

            {/* Detailed toner browse (full filters) — default view & the "Toners" tab */}
            {(!params.get("q") || cat === "toners") && (
                <div className="mt-4">
                    <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 bg-[#F5F5F7]/95 backdrop-blur" data-testid="toners-filters-wrapper">
                        <CategoryFilters
                            selects={[
                                { key: "brand", label: "Brand", allLabel: "All brands", options: PRINTER_TONER_BRANDS.map((b) => ({ value: b, label: b })) },
                                { key: "type", label: "Condition", allLabel: "All conditions", options: [{ value: "Original", label: "Original" }, { value: "Compatible", label: "Compatible" }, { value: "Refilled", label: "Refilled" }] },
                                { key: "city", label: "City", allLabel: "All cities", options: KNOWN_CITIES.map((c) => ({ value: c, label: c })) },
                            ]}
                            showPrice
                            sortOptions={TONER_SORT_OPTIONS}
                            value={tonerFilterValue}
                            onChange={onTonerFilterChange}
                            resultCount={visibleProducts.length}
                        />
                    </div>

                    <div className="flex items-center justify-between mt-5 mb-1">
                        <div className="text-[13px] text-[#6E6E73]" data-testid="search-results-count">
                            {loading ? "Loading…" : `${visibleProducts.length} listing${visibleProducts.length === 1 ? "" : "s"}${filterCity !== "all" ? ` · ${filterCity}` : ""}`}
                        </div>
                    </div>

                    {loading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 mt-4">
                            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
                        </div>
                    )}

                    {!loading && visibleProducts.length === 0 && (
                        <div className="tc-card p-8 sm:p-16 text-center mt-4" data-testid="search-empty-state">
                            <Boxes className="mx-auto text-[#D2D2D7]" size={48} />
                            <div className="mt-4 text-[#0A0A0B] text-xl font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>No matching toners</div>
                            <div className="text-[#6E6E73] text-[14px] mt-1">Try a different model or clear filters.</div>
                            <button className="btn-cta mt-6" onClick={clearAll} data-testid="empty-clear-btn">Clear filters</button>
                        </div>
                    )}

                    {showingOtherCities && (
                        <div className="mb-5 mt-4 flex items-center gap-2 rounded-xl bg-[#FFF8E0] border border-[#F5E5A6] px-4 py-3 text-[12.5px] text-[#8C6A00]" data-testid="other-cities-banner">
                            <MapPin size={14} className="shrink-0" />
                            No local dealers in <strong className="mx-1">{city}</strong> for this — showing results from other cities.
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 mt-4">
                        {visibleProducts.map((p, idx) => (
                            <div key={p.id} className="tc-reveal" style={{ transitionDelay: `${Math.min(idx * 35, 280)}ms` }}>
                                <ProductCard p={p} qty={getQty(p.id)} setQty={(n) => setQty(p.id, n)} onBuy={onBuy} onCart={onCart} userCity={city} />
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
                </div>
            )}

            <RefilledWarningDialog open={refilledWarn} onClose={() => setRefilledWarn(false)} />
        </div>
    );
}
