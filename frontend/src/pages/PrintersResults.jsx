import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Printer as PrinterIcon, X, Sparkles, ShoppingCart } from "lucide-react";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import VerifiedBadge from "../components/VerifiedBadge";
import CategoryFilters from "../components/CategoryFilters";
import UniversalSearch from "../components/UniversalSearch";
import { PRINTER_TONER_BRANDS } from "../lib/listingConstants";
import { deliveryLabel } from "../lib/location";
import { useCart } from "../context/CartContext";

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

function PrinterCard({ p }) {
    const navigate = useNavigate();
    const { add } = useCart();
    const { city: userCity } = useCity();
    const loc = deliveryLabel(p.city || p.supplier_city, userCity);
    const onAdd = (e) => {
        e.preventDefault(); e.stopPropagation();
        add(p, 1);
        toast.success(`Added ${p.brand} ${p.model_number} to cart`);
    };
    const onBuyNow = (e) => {
        e.preventDefault(); e.stopPropagation();
        add(p, 1);
        navigate("/checkout");
    };
    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden transition hover:shadow-xl group relative" data-testid={`printer-card-${p.id}`}>
            <Link to={`/printer/${p.id}`} className="block bg-black/[0.03] aspect-[4/3] grid place-items-center hover:opacity-95" data-testid={`printer-link-${p.id}`}>
                {p.image_url ? (
                    <img src={p.image_url} alt={`${p.brand} ${p.model_number}`} className="w-full h-full object-contain" loading="lazy" />
                ) : (
                    <PrinterIcon size={42} className="text-[#D2D2D7]" />
                )}
            </Link>
            <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] tracking-[0.14em] uppercase font-semibold px-2 py-0.5 rounded-full ${p.condition === "new" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {p.condition === "new" ? "Brand New" : "Refurbished"}
                    </span>
                    <span className="text-[10px] text-[#86868B]">{fmt(p.usage_type)} · {fmt(p.category)}</span>
                </div>
                <div className="font-mono text-[14px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.brand} · {p.model_number}
                </div>
                <div className="text-[12px] text-[#6E6E73] flex items-center gap-2 flex-wrap">
                    <span>{fmt(p.color)}</span>
                    {p.paper_sizes?.length > 0 && <span>· {p.paper_sizes.slice(0, 3).join(", ")}</span>}
                    {p.connectivity?.length > 0 && <span>· {p.connectivity.slice(0, 2).join(" / ")}</span>}
                </div>
                <div className="text-[11px] text-[#86868B] flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{p.supplier_name}{p.city ? ` · ${p.city}` : ""}</span>
                    <VerifiedBadge compact />
                </div>
                {loc.text && (
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border w-fit ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`} data-testid={`printer-delivery-${p.id}`}>
                        {loc.local ? "Local · Free delivery" : loc.text}
                    </span>
                )}
                <div className="font-mono text-[18px] font-bold text-[#0A0A0B] mt-2">₹{Number(p.price).toLocaleString("en-IN")}</div>
                <div className="text-[10.5px] text-emerald-700 font-semibold">{p.stock} in stock</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button size="sm" variant="outline" className="text-[12px] h-9 gap-1.5" onClick={onAdd} data-testid={`printer-add-to-cart-${p.id}`}>
                        <ShoppingCart size={13} /> Add to cart
                    </Button>
                    <Button size="sm" className="btn-cta text-[12px] h-9" onClick={onBuyNow} data-testid={`printer-buy-now-${p.id}`}>
                        Buy now
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function Printers() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { city } = useCity();
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        brand: "", type: "", condition: "", city: "", minPrice: "", maxPrice: "", sort: "local",
    });

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
        <div className="relative pb-16" data-testid="printers-page">
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
                    <p className="text-white/70 mt-3 text-[14px] max-w-xl">Not sure what you need? <button onClick={() => navigate("/printers")} className="text-[#00B7C7] font-medium inline-flex items-center gap-1 hover:underline" data-testid="printers-to-guide-link"><Sparkles size={12} /> Use our guided finder</button></p>

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
                        <p className="text-[13px] text-[#6E6E73] mt-1">Try removing a filter or <button onClick={() => navigate("/printers")} className="text-[#00B7C7] font-semibold hover:underline" data-testid="printers-guide-cta">use the guided finder</button>.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="printers-grid">
                        {visible.map((p) => <PrinterCard key={p.id} p={p} />)}
                    </div>
                )}
            </div>
        </div>
    );
}
