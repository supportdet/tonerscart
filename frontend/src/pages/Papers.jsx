import React, { useEffect, useState, useMemo } from "react";
import api, { formatApiError } from "../lib/api";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import PageMeta from "../components/PageMeta";
import CategoryFilters from "../components/CategoryFilters";
import UniversalSearch from "../components/UniversalSearch";
import PaperProductCard from "../components/cards/PaperProductCard";
import ProductRequestForm from "../components/ProductRequestForm";
import { PAPER_BRANDS } from "../lib/listingConstants";

const SIZES = ["A4", "A3", "A5", "Letter"];
const GSMS = [70, 75, 80, 90, 100, 120];
const SORT_OPTIONS = [
    { value: "local", label: "Local suppliers first" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "newest", label: "Newest first" },
];

export default function Papers() {
    const { city: appCity } = useCity();
    const [allRows, setAllRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        brand: "", size: "", gsm: "", city: "", minPrice: "", maxPrice: "", sort: "local",
    });

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (appCity) params.near_city = appCity;
            const { data } = await api.get("/papers", { params });
            setAllRows(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const brandOptions = PAPER_BRANDS.map((b) => ({ value: b, label: b }));

    const visible = useMemo(() => {
        let out = allRows.filter((r) => {
            if (filters.brand && r.brand !== filters.brand) return false;
            if (filters.size && r.size !== filters.size) return false;
            if (filters.gsm && String(r.gsm) !== String(filters.gsm)) return false;
            const rc = r.supplier_city || r.city;
            if (filters.city && rc !== filters.city) return false;
            const price = Number(r.price_per_ream || 0);
            if (filters.minPrice && price < Number(filters.minPrice)) return false;
            if (filters.maxPrice && price > Number(filters.maxPrice)) return false;
            return true;
        });
        const priceOf = (r) => Number(r.price_per_ream || 0);
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
    }, [allRows, filters, appCity]);

    return (
        <div className="min-h-screen bg-[#F5F5F7]">
            <PageMeta
                title="Buy Printing Paper Online India — Verified Dealers | TonersCart"
                description="Buy A4, A3, A5 and Letter-size papers in bulk from verified suppliers across India. Compare GSM, price per ream and box from real stock."
                path="/papers"
            />
            <div className="tc-container py-8">
                <div className="mb-5" data-testid="papers-universal-search">
                    <UniversalSearch />
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">Buy Papers</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                    A4 / A3 papers from verified suppliers
                </h1>

                <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 mt-6 bg-[#F5F5F7]/95 backdrop-blur" data-testid="papers-filters-wrapper">
                    <CategoryFilters
                        selects={[
                            { key: "brand", label: "Brand", allLabel: "All brands", options: brandOptions },
                            { key: "size", label: "Size", allLabel: "All sizes", options: SIZES.map((s) => ({ value: s, label: s })) },
                            { key: "gsm", label: "GSM", allLabel: "All GSM", options: GSMS.map((g) => ({ value: String(g), label: `${g} GSM` })) },
                            { key: "city", label: "City", allLabel: "All cities", options: KNOWN_CITIES.map((c) => ({ value: c, label: c })) },
                        ]}
                        showPrice={false}
                        sortOptions={SORT_OPTIONS}
                        value={filters}
                        onChange={setFilters}
                        resultCount={visible.length}
                    />
                </div>

                {loading ? (
                    <div className="py-20 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading papers…</div>
                ) : visible.length === 0 ? (
                    <div className="mt-10 bg-white border border-black/[0.06] rounded-2xl p-10 text-center" data-testid="papers-empty">
                        <Package size={28} className="mx-auto text-[#86868B]" />
                        <div className="mt-3 text-[15px] font-semibold text-[#0A0A0B]">No paper listings yet</div>
                        <div className="mt-1 text-[12.5px] text-[#6E6E73]">Suppliers are onboarding. Check back soon or contact us for bulk needs.</div>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {visible.map((p) => (
                            <PaperProductCard key={p.id} p={p} />
                        ))}
                    </div>
                )}
                <ProductRequestForm category="paper" />
            </div>
        </div>
    );
}
