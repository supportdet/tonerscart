import React, { useEffect, useState, useMemo } from "react";
import api, { formatApiError } from "../lib/api";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import PageMeta from "../components/PageMeta";
import CategoryFilters from "../components/CategoryFilters";
import UniversalSearch from "../components/UniversalSearch";
import ScannerProductCard from "../components/cards/ScannerProductCard";
import ProductRequestForm from "../components/ProductRequestForm";
import BrandChips from "../components/BrandChips";
import { SCANNER_TYPES, SCANNER_CONDITIONS } from "../lib/scannerConstants";

const SORT_OPTIONS = [
    { value: "local", label: "Local suppliers first" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "newest", label: "Newest first" },
];

export default function Scanners() {
    const { city: appCity } = useCity();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [type, setType] = useState("all");
    const [filters, setFilters] = useState({
        brands: [], condition: "", city: "", minPrice: "", maxPrice: "", sort: "local",
    });

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (type && type !== "all") params.scanner_type = type;
            if (appCity) params.near_city = appCity;
            const { data } = await api.get("/scanners", { params });
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [type]);

    const visible = useMemo(() => {
        let out = rows.filter((r) => {
            if (filters.brands.length > 0 && !filters.brands.includes(r.brand)) return false;
            if (filters.condition && (r.condition || "New") !== filters.condition) return false;
            const rc = r.supplier_city || r.city;
            if (filters.city && rc !== filters.city) return false;
            const price = Number(r.price || 0);
            if (filters.minPrice && price < Number(filters.minPrice)) return false;
            if (filters.maxPrice && price > Number(filters.maxPrice)) return false;
            return true;
        });
        const priceOf = (r) => Number(r.price || 0);
        if (filters.sort === "price_asc") out = [...out].sort((a, b) => priceOf(a) - priceOf(b));
        else if (filters.sort === "price_desc") out = [...out].sort((a, b) => priceOf(b) - priceOf(a));
        else if (filters.sort === "newest") out = [...out].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        else if (filters.sort === "local" && appCity) {
            out = [...out].sort((a, b) => {
                const al = (a.supplier_city || a.city) === appCity ? 0 : 1;
                const bl = (b.supplier_city || b.city) === appCity ? 0 : 1;
                return al - bl;
            });
        }
        return out;
    }, [rows, filters, appCity]);

    return (
        <div className="min-h-screen bg-[#F5F5F7]">
            <PageMeta
                title="Buy Document Scanners Online India — TonersCart"
                description="Buy flatbed, ADF, sheet-fed and photo scanners from verified dealers across India. Compare resolution, speed, connectivity and real stock."
                path="/scanners"
            />
            <div className="tc-container py-8">
                <div className="mb-5" data-testid="scanners-universal-search">
                    <UniversalSearch />
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">Buy Scanners</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                    Document &amp; photo scanners from verified dealers
                </h1>

                {/* Scanner-type tabs */}
                <div className="mt-6 flex flex-wrap gap-2" data-testid="scanners-type-tabs">
                    {[{ key: "all", label: "All" }, ...SCANNER_TYPES.map((s) => ({ key: s, label: s }))].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setType(t.key)}
                            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition ${type === t.key ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]"}`}
                            data-testid={`scanners-tab-${t.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Brand filter chips */}
                <BrandChips
                    value={filters.brands}
                    onChange={(b) => setFilters({ ...filters, brands: b })}
                    testidPrefix="scanner-brand-chip"
                />

                <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 mt-5 bg-[#F5F5F7]/95 backdrop-blur" data-testid="scanners-filters-wrapper">
                    <CategoryFilters
                        selects={[
                            { key: "condition", label: "Condition", allLabel: "All conditions", options: SCANNER_CONDITIONS.map((c) => ({ value: c, label: c })) },
                            { key: "city", label: "City", allLabel: "All cities", options: KNOWN_CITIES.map((c) => ({ value: c, label: c })) },
                        ]}
                        showPrice
                        sortOptions={SORT_OPTIONS}
                        value={filters}
                        onChange={setFilters}
                        resultCount={visible.length}
                    />
                </div>

                {loading ? (
                    <div className="py-20 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading scanners…</div>
                ) : visible.length === 0 ? (
                    <div className="mt-10 bg-white border border-black/[0.06] rounded-2xl p-10 text-center" data-testid="scanners-empty">
                        <ScanLine size={28} className="mx-auto text-[#86868B]" />
                        <div className="mt-3 text-[15px] font-semibold text-[#0A0A0B]">No scanner listings yet</div>
                        <div className="mt-1 text-[12.5px] text-[#6E6E73]">Verified dealers are onboarding. Check back soon or request a specific model below.</div>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="scanners-grid">
                        {visible.map((sc) => (
                            <ScannerProductCard key={sc.id} s={sc} />
                        ))}
                    </div>
                )}
                <ProductRequestForm category="scanner" />
            </div>
        </div>
    );
}
