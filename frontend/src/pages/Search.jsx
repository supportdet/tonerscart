import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { MapPin, Boxes, Sparkles } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import api from "../lib/api";
import { searchCacheGet, searchCacheSet } from "../lib/searchCache";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import RefilledWarningDialog from "../components/RefilledWarningDialog";
import PageMeta from "../components/PageMeta";
import CategoryFilters from "../components/CategoryFilters";
import UniversalSearch from "../components/UniversalSearch";
import TonerProductCard from "../components/cards/TonerProductCard";
import ProductRequestForm from "../components/ProductRequestForm";
import PrinterProductCard from "../components/cards/PrinterProductCard";
import PaperProductCard from "../components/cards/PaperProductCard";
import ConsumableProductCard from "../components/cards/ConsumableProductCard";
import ScannerProductCard from "../components/cards/ScannerProductCard";
import BrandChips from "../components/BrandChips";
import ColorChips from "../components/ColorChips";
import useReveal from "../hooks/useReveal";
import { cityMatch } from "../lib/location";

const TONER_SORT_OPTIONS = [
    { value: "local", label: "Local suppliers first" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "newest", label: "Newest first" },
];

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
    // Brand multi-select — seeded from URL ?brand= (if present) but no longer
    // synced to the URL or sent to the backend; filtering happens client-side
    // on the loaded results.
    const [selectedBrands, setSelectedBrands] = useState(() => {
        const b = params.get("brand");
        return b && b !== "all" ? [b] : [];
    });
    const [selectedColors, setSelectedColors] = useState([]);
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
            // Check cache first — repeated searches for the same query render
            // instantly without re-hitting the network.
            const cached = searchCacheGet("/search/universal", { q: qq, limit_per_type: 12 });
            if (cached && !cancelled) setUniversal(cached);
            const cachedAi = searchCacheGet("/search/ai", { q: qq, limit_per_type: 12 });
            if (cachedAi && !cancelled) {
                const c = cachedAi.counts || {};
                const total = (c.toners || 0) + (c.printers || 0) + (c.papers || 0) + (c.consumables || 0) + (c.oem || 0);
                if (total > 0) setUniversal(cachedAi);
                setAiInfo({ answer: cachedAi.answer || null, params: cachedAi.params || null });
                if (cached) return; // both endpoints cached → done
            } else if (!cancelled) {
                setAiInfo(null);
            }
            let aiApplied = false;
            // 1) Instant keyword results — skip if already served from cache.
            const kwP = cached ? Promise.resolve() : api.get("/search/universal", { params: { q: qq, limit_per_type: 12 } })
                .then((r) => {
                    if (cancelled || aiApplied) return;
                    setUniversal(r.data || null);
                    searchCacheSet("/search/universal", { q: qq, limit_per_type: 12 }, r.data || null);
                })
                .catch(() => { if (!cancelled && !aiApplied) setUniversal(null); });
            // 2) AI-enhanced results in parallel — but only for queries that
            // actually benefit from NLP parsing (≥ 3 chars). Short prefixes
            // are noise — the keyword search alone is more precise and Gemini
            // calls are the slowest dependency in the search hot path.
            const aiP = (cachedAi || qq.length < 3) ? Promise.resolve() : api.get("/search/ai", { params: { q: qq, limit_per_type: 12 } })
                .then((res) => {
                    if (cancelled || !res.data?.ai) return;
                    const c = res.data.counts || {};
                    const total = (c.toners || 0) + (c.printers || 0) + (c.papers || 0) + (c.consumables || 0) + (c.oem || 0);
                    if (total > 0) { aiApplied = true; setUniversal(res.data); }
                    setAiInfo({ answer: res.data.answer || null, params: res.data.params || null });
                    searchCacheSet("/search/ai", { q: qq, limit_per_type: 12 }, res.data);
                })
                .catch(() => { /* keep keyword results */ });
            await Promise.allSettled([kwP, aiP]);
        })();
        return () => { cancelled = true; };
    }, [params]);

    const buildParams = () => {
        const qp = {};
        if (params.get("q")) qp.q = params.get("q");
        if (selectedBrands.length > 0) qp.brands = selectedBrands.join(",");
        if (selectedColors.length > 0) qp.colors = selectedColors.join(",");
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
            const reqParams = { ...buildParams(), page: 1, limit: 24 };
            // Cache hit — instantly populate while still refreshing in the
            // background (stale-while-revalidate).
            const cached = searchCacheGet("/listings/search/paginated", reqParams);
            if (cached) {
                const items = Array.isArray(cached.results) ? [...cached.results] : [];
                items.sort(byCityThenPrice);
                setProducts(items);
                setTotalPages(cached.pages || 1);
                setLoading(false);
            }
            try {
                const r = await api.get("/listings/search/paginated", { params: reqParams });
                const items = Array.isArray(r.data?.results) ? [...r.data.results] : [];
                items.sort(byCityThenPrice);
                setProducts(items);
                setTotalPages(r.data?.pages || 1);
                searchCacheSet("/listings/search/paginated", reqParams, r.data);
            } catch {
                if (!cached) {
                    setProducts([]);
                    setTotalPages(1);
                }
            } finally { setLoading(false); }
        };
        fetch();
    }, [params, selectedBrands, selectedColors]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (key === "toner_type") setTonerType(val);
        if (key === "city") {
            setFilterCity(val);
            if (val !== "all") setCity(val);
        }
    };

    const clearAll = () => { setQ(""); setSelectedBrands([]); setSelectedColors([]); setTonerType("all"); setFilterCity("all"); setMinPrice(""); setMaxPrice(""); setSortBy("local"); setParams(new URLSearchParams()); };

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
        type: tonerType === "all" ? "" : tonerType,
        city: filterCity === "all" ? "" : filterCity,
        minPrice, maxPrice, sort: sortBy,
    };
    const onTonerFilterChange = (next) => {
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
                        { key: "all", label: "All", n: (universal.counts?.toners || 0) + (universal.counts?.printers || 0) + (universal.counts?.papers || 0) + (universal.counts?.consumables || 0) + (universal.counts?.scanners || 0) + (universal.counts?.oem || 0) },
                        { key: "toners", label: "Toners", n: universal.counts?.toners || 0 },
                        { key: "printers", label: "Printers", n: universal.counts?.printers || 0 },
                        { key: "papers", label: "Papers", n: universal.counts?.papers || 0 },
                        { key: "consumables", label: "Inks & Consumables", n: universal.counts?.consumables || 0 },
                        { key: "scanners", label: "Scanners", n: universal.counts?.scanners || 0 },
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
            {universal && (universal.counts?.toners + universal.counts?.printers + universal.counts?.papers + (universal.counts?.consumables || 0) + (universal.counts?.scanners || 0) + (universal.counts?.oem || 0)) > 0 && (
                <div className="mt-6 space-y-8" data-testid="universal-results">
                    {cat === "all" && universal.counts.toners > 0 && (
                        <section data-testid="universal-section-toners">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Toners <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.toners} found</span>
                                </h2>
                                <button onClick={() => setCat("toners")} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-toners">View all →</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                                {universal.toners.map((t) => (
                                    <TonerProductCard key={t.id} p={t} qty={getQty(t.id)} setQty={(n) => setQty(t.id, n)} onBuy={onBuy} onCart={onCart} userCity={city} />
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
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                                {universal.printers.map((p) => (
                                    <PrinterProductCard key={p.id} p={p} />
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
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                                {universal.papers.map((p) => (
                                    <PaperProductCard key={p.id} p={p} />
                                ))}
                            </div>
                        </section>
                    )}
                    {(cat === "all" || cat === "consumables") && (universal.counts.consumables || 0) > 0 && (
                        <section data-testid="universal-section-consumables">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Inks &amp; Consumables <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.consumables} found</span>
                                </h2>
                                <button onClick={() => navigate(`/consumables`)} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-consumables">Browse consumables →</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                                {universal.consumables.map((c) => (
                                    <ConsumableProductCard key={c.id} c={c} />
                                ))}
                            </div>
                        </section>
                    )}
                    {(cat === "all" || cat === "scanners") && (universal.counts.scanners || 0) > 0 && (
                        <section data-testid="universal-section-scanners">
                            <div className="flex items-baseline justify-between mb-3">
                                <h2 className="text-[18px] font-semibold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Scanners <span className="text-[13px] font-normal text-[#86868B]">· {universal.counts.scanners} found</span>
                                </h2>
                                <button onClick={() => navigate(`/scanners`)} className="text-[12.5px] font-semibold text-[#00B7C7] hover:underline" data-testid="universal-view-all-scanners">Browse scanners →</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                                {(universal.scanners || []).map((sc) => (
                                    <ScannerProductCard key={sc.id} s={sc} />
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
                    <BrandChips
                        value={selectedBrands}
                        onChange={setSelectedBrands}
                        testidPrefix="toner-brand-chip"
                    />
                    <ColorChips
                        value={selectedColors}
                        onChange={setSelectedColors}
                        testidPrefix="toner-color-chip"
                    />
                    <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 bg-[#F5F5F7]/95 backdrop-blur" data-testid="toners-filters-wrapper">
                        <CategoryFilters
                            selects={[
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
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 mt-4">
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

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 mt-4">
                        {visibleProducts.map((p, idx) => (
                            <div key={p.id} className="tc-reveal" style={{ transitionDelay: `${Math.min(idx * 35, 280)}ms` }}>
                                <TonerProductCard p={p} qty={getQty(p.id)} setQty={(n) => setQty(p.id, n)} onBuy={onBuy} onCart={onCart} userCity={city} />
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
            <ProductRequestForm category="toner" />
        </div>
    );
}
