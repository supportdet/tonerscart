import React, { useEffect, useState, useMemo } from "react";
import api, { formatApiError } from "../lib/api";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { Loader2, Boxes } from "lucide-react";
import { toast } from "sonner";
import PageMeta from "../components/PageMeta";
import CategoryFilters from "../components/CategoryFilters";
import UniversalSearch from "../components/UniversalSearch";
import ConsumableProductCard from "../components/cards/ConsumableProductCard";
import ProductRequestForm from "../components/ProductRequestForm";
import BrandChips from "../components/BrandChips";
import ColorChips from "../components/ColorChips";
import { CONSUMABLE_SUBCATEGORIES, CONSUMABLE_CONDITIONS } from "../lib/consumableConstants";

const SORT_OPTIONS = [
    { value: "local", label: "Local suppliers first" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "newest", label: "Newest first" },
];

export default function Consumables() {
    const { city: appCity } = useCity();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sub, setSub] = useState("all");
    const [filters, setFilters] = useState({
        brands: [], colors: [], condition: "", city: "", minPrice: "", maxPrice: "", sort: "local",
    });

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (sub && sub !== "all") params.subcategory = sub;
            if (appCity) params.near_city = appCity;
            const { data } = await api.get("/consumables", { params });
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [sub]);

    const visible = useMemo(() => {
        // Consumables don't have a dedicated `color` column — match against
        // the listing's text (subcategory / model_number / description /
        // compatible_models). "Tri-color" matches text containing tri- /
        // tricolor or all of Cyan+Magenta+Yellow keywords.
        const matchesColor = (r) => {
            if (filters.colors.length === 0) return true;
            const hay = [r.subcategory, r.model_number, r.description, r.compatible_models, r.subcategory_other]
                .filter(Boolean).join(" ").toLowerCase();
            for (const c of filters.colors) {
                if (c === "Tri-color") {
                    if (/tri\s*-?\s*colou?r/.test(hay)) return true;
                    if (/cyan/.test(hay) && /magenta/.test(hay) && /yellow/.test(hay)) return true;
                } else if (hay.includes(c.toLowerCase())) {
                    return true;
                }
            }
            return false;
        };
        let out = rows.filter((r) => {
            if (filters.brands.length > 0 && !filters.brands.includes(r.brand)) return false;
            if (!matchesColor(r)) return false;
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
                title="Buy Printer Consumables Online India — TonersCart"
                description="Buy ink cartridges, drums, fusers, maintenance kits, staple cartridges and transfer belts from verified dealers across India. Compare prices and real stock."
                path="/consumables"
            />
            <div className="tc-container py-8">
                <div className="mb-5" data-testid="consumables-universal-search">
                    <UniversalSearch />
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">Buy Consumables</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                    Inks, drums, fusers &amp; kits from verified dealers
                </h1>

                {/* Subcategory tabs */}
                <div className="mt-6 flex flex-wrap gap-2" data-testid="consumables-subcat-tabs">
                    {[{ key: "all", label: "All" }, ...CONSUMABLE_SUBCATEGORIES.map((s) => ({ key: s, label: s }))].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setSub(t.key)}
                            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition ${sub === t.key ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]"}`}
                            data-testid={`consumables-tab-${t.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Brand filter chips */}
                <BrandChips
                    value={filters.brands}
                    onChange={(b) => setFilters({ ...filters, brands: b })}
                    testidPrefix="consumable-brand-chip"
                />
                {/* Color filter chips */}
                <ColorChips
                    value={filters.colors}
                    onChange={(c) => setFilters({ ...filters, colors: c })}
                    testidPrefix="consumable-color-chip"
                />

                <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 mt-5 bg-[#F5F5F7]/95 backdrop-blur" data-testid="consumables-filters-wrapper">
                    <CategoryFilters
                        selects={[
                            { key: "condition", label: "Condition", allLabel: "All conditions", options: CONSUMABLE_CONDITIONS.map((c) => ({ value: c, label: c })) },
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
                    <div className="py-20 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading consumables…</div>
                ) : visible.length === 0 ? (
                    <div className="mt-10 bg-white border border-black/[0.06] rounded-2xl p-10 text-center" data-testid="consumables-empty">
                        <Boxes size={28} className="mx-auto text-[#86868B]" />
                        <div className="mt-3 text-[15px] font-semibold text-[#0A0A0B]">No consumable listings yet</div>
                        <div className="mt-1 text-[12.5px] text-[#6E6E73]">Verified dealers are onboarding. Check back soon or contact us for bulk needs.</div>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {visible.map((c) => (
                            <ConsumableProductCard key={c.id} c={c} />
                        ))}
                    </div>
                )}
                <ProductRequestForm category="consumable" />
            </div>
        </div>
    );
}
