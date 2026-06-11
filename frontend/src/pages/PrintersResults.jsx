import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Printer as PrinterIcon, X, Sparkles } from "lucide-react";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import CategoryFilters from "../components/CategoryFilters";
import UniversalSearch from "../components/UniversalSearch";
import PrinterProductCard from "../components/cards/PrinterProductCard";
import ProductRequestForm from "../components/ProductRequestForm";
import PrintersGuide from "./PrintersGuide";
import { PRINTER_TONER_BRANDS } from "../lib/listingConstants";

const PRINTER_CONDITIONS = [
    { value: "new", label: "Brand New" },
    { value: "refurbished", label: "Refurbished" },
];
const PRINTER_TYPES = [
    { value: "laser", label: "Laser" },
    { value: "inkjet", label: "Inkjet" },
    { value: "mfd", label: "MFD (All-in-one)" },
];
const matchType = (p, t) => {
    if (!t) return true;
    const cat = String(p.category || "").toLowerCase();
    const fn = String(p.function_ || p.function || "").toLowerCase();
    const fns = (p.functions || []).map((x) => String(x).toLowerCase());
    if (t === "laser") return cat === "laser";
    if (t === "inkjet") return ["inkjet", "tank", "ink"].includes(cat);
    if (t === "mfd") return cat === "mfd" || ["all_in_one", "print_scan"].includes(fn) || fns.some((x) => ["all_in_one", "print_scan"].includes(x));
    return true;
};
const PRINTER_SORT_OPTIONS = [
    { value: "local", label: "Local suppliers first" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "newest", label: "Newest first" },
];

const LABELS = {
    home: "Home", corporate: "Corporate", commercial: "Commercial", print_shop: "Print Shop",
    inkjet: "Inkjet", laser: "Laser", tank: "Tank", thermal: "Thermal", production: "Production",
    digital_press: "Digital Press", label_barcode: "Label / Barcode", ink: "Ink", other: "Other",
    color: "Color", bw: "B&W", both: "Color + B&W",
    print_only: "Print only", print_scan: "Print + Scan", all_in_one: "All-in-one", high_volume: "High volume",
};

function fmt(v) { return LABELS[v] || v; }

export default function Printers() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { city } = useCity();
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        brand: "", type: "", condition: "", city: "", minPrice: "", maxPrice: "", sort: "local",
    });

    // "Find your printer" popup — auto-opens 15s after landing on /printers,
    // unless the user already started browsing (scrolled the page or clicked
    // inside the printers content — header/cookie banners don't count) or it
    // was already shown this session. Dismissible via a clear X button.
    const [showFinder, setShowFinder] = useState(false);
    const interactedRef = useRef(false);
    const pageRef = useRef(null);
    useEffect(() => {
        if ([...params.keys()].length > 0) return; // arrived with finder/query filters — skip
        try { if (sessionStorage.getItem("tc_finder_popup_shown")) return; } catch { /* ignore */ }
        const onScroll = () => { if (window.scrollY > 120) interactedRef.current = true; };
        const onClick = () => { interactedRef.current = true; };
        const el = pageRef.current;
        window.addEventListener("scroll", onScroll, { passive: true });
        el && el.addEventListener("pointerdown", onClick);
        const t = setTimeout(() => {
            if (!interactedRef.current) {
                setShowFinder(true);
                try { sessionStorage.setItem("tc_finder_popup_shown", "1"); } catch { /* ignore */ }
            }
        }, 15000);
        return () => {
            clearTimeout(t);
            window.removeEventListener("scroll", onScroll);
            el && el.removeEventListener("pointerdown", onClick);
        };
        // eslint-disable-next-line
    }, []);

    // Chips reflect the guided-finder selections passed in the URL (category,
    // usage_type, color, …). The brand/condition/price/city filters below are
    // applied client-side and instant.
    const activeChips = useMemo(() => {
        const chips = [];
        for (const [k, v] of params.entries()) {
            if (["q"].includes(k)) continue;
            chips.push({ k, v });
        }
        return chips;
    }, [params]);

    const load = async () => {
        setLoading(true);
        try {
            const usp = new URLSearchParams(params);
            if (!usp.get("city") && city) usp.set("near_city", city);
            const { data } = await api.get(`/printers?${usp.toString()}`);
            setListings(Array.isArray(data) ? data : []);
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params]);

    const removeChip = (k) => {
        const next = new URLSearchParams(params);
        next.delete(k);
        setParams(next, { replace: true });
    };

    const clearAll = () => { setParams({}, { replace: true }); };

    const brandOptions = PRINTER_TONER_BRANDS.map((b) => ({ value: b, label: b }));

    const visible = useMemo(() => {
        let out = listings.filter((p) => {
            if (filters.brand && p.brand !== filters.brand) return false;
            if (!matchType(p, filters.type)) return false;
            if (filters.condition && (p.condition || "") !== filters.condition) return false;
            const rc = p.supplier_city || p.city;
            if (filters.city && rc !== filters.city) return false;
            const price = Number(p.price || 0);
            if (filters.minPrice && price < Number(filters.minPrice)) return false;
            if (filters.maxPrice && price > Number(filters.maxPrice)) return false;
            return true;
        });
        const priceOf = (p) => Number(p.price || 0);
        if (filters.sort === "price_asc") out = [...out].sort((a, b) => priceOf(a) - priceOf(b));
        else if (filters.sort === "price_desc") out = [...out].sort((a, b) => priceOf(b) - priceOf(a));
        else if (filters.sort === "newest") out = [...out].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        else if (filters.sort === "local" && city) {
            out = [...out].sort((a, b) => {
                const al = (a.supplier_city || a.city) === city ? 0 : 1;
                const bl = (b.supplier_city || b.city) === city ? 0 : 1;
                return al - bl;
            });
        }
        return out;
    }, [listings, filters, city]);

    return (
        <div ref={pageRef} className="relative pb-16" data-testid="printers-page">
            <div className="tc-hero relative pb-10">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase font-medium text-white/80">Printers · India-wide</span>
                    </div>
                    <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                        Verified printers from trusted dealers
                    </h1>
                    <p className="text-white/70 mt-3 text-[14px] max-w-xl">Not sure what you need? <button onClick={() => navigate("/printers/guide")} className="text-[#00B7C7] font-medium inline-flex items-center gap-1 hover:underline" data-testid="printers-to-guide-link"><Sparkles size={12} /> Use our guided finder</button></p>

                    {activeChips.length > 0 && (
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            {activeChips.map(({ k, v }) => (
                                <button key={k} onClick={() => removeChip(k)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white text-[11.5px] hover:bg-white/20 border border-white/15" data-testid={`chip-${k}`}>
                                    <span className="text-white/60">{k}:</span> {fmt(v)} <X size={11} />
                                </button>
                            ))}
                            <button onClick={clearAll} className="text-[11.5px] text-white/70 underline hover:text-white ml-1" data-testid="chips-clear-all">Clear all</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="tc-container py-8">
                <div className="mb-5" data-testid="printers-universal-search">
                    <UniversalSearch />
                </div>
                <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 bg-[#F5F5F7]/95 backdrop-blur" data-testid="printers-filters-wrapper">
                    <CategoryFilters
                        selects={[
                            { key: "brand", label: "Brand", allLabel: "All brands", options: brandOptions },
                            { key: "type", label: "Type", allLabel: "All types", options: PRINTER_TYPES },
                            { key: "condition", label: "Condition", allLabel: "All conditions", options: PRINTER_CONDITIONS },
                            { key: "city", label: "City", allLabel: "All cities", options: KNOWN_CITIES.map((c) => ({ value: c, label: c })) },
                        ]}
                        showPrice
                        sortOptions={PRINTER_SORT_OPTIONS}
                        value={filters}
                        onChange={setFilters}
                        resultCount={visible.length}
                    />
                </div>

                <div className="flex items-end justify-between mb-4 mt-5">
                    <div className="text-[13px] text-[#6E6E73]" data-testid="printers-results-count">
                        {loading ? "Loading…" : `${visible.length} ${visible.length === 1 ? "printer" : "printers"}`}
                    </div>
                </div>
                {loading ? (
                    <div className="text-[#6E6E73] py-8">Loading printers…</div>
                ) : visible.length === 0 ? (
                    <div className="bg-white border border-black/[0.06] rounded-2xl p-10 text-center">
                        <PrinterIcon size={40} className="mx-auto text-[#D2D2D7]" />
                        <div className="mt-3 font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>No printers match these filters yet</div>
                        <p className="text-[13px] text-[#6E6E73] mt-1">Try removing a filter or <button onClick={() => navigate("/printers/guide")} className="text-[#00B7C7] font-semibold hover:underline" data-testid="printers-guide-cta">use the guided finder</button>.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="printers-grid">
                        {visible.map((p) => <PrinterProductCard key={p.id} p={p} />)}
                    </div>
                )}
                <ProductRequestForm category="printer" />
            </div>

            {/* "Find your printer" popup — guided finder questionnaire */}
            {showFinder && (
                <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-6" data-testid="finder-popup-overlay">
                    <div className="relative max-w-3xl mx-auto my-4 rounded-2xl overflow-hidden shadow-2xl">
                        <button
                            onClick={() => setShowFinder(false)}
                            aria-label="Close printer finder"
                            className="absolute top-3 right-3 z-10 w-9 h-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/25 text-white border border-white/20 transition"
                            data-testid="finder-popup-close"
                        >
                            <X size={17} />
                        </button>
                        <PrintersGuide embedded onClose={() => setShowFinder(false)} />
                    </div>
                </div>
            )}
        </div>
    );
}
