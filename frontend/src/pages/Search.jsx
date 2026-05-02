import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapPin, Boxes, ChevronRight, X, Filter as FilterIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import OrderRequestDialog from "../components/OrderRequestDialog";
import TonerSearchInput from "../components/TonerSearchInput";

const colorClass = (c) => ({ Cyan: "tc-thumb-cyan", Magenta: "tc-thumb-magenta", Yellow: "tc-thumb-yellow", Black: "tc-thumb-black" })[c] || "tc-thumb-cyan";

export default function SearchPage() {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [q, setQ] = useState(params.get("q") || "");
    const [brand, setBrand] = useState(params.get("brand") || "all");
    const [city, setCity] = useState(params.get("city") || "all");
    const [tonerType, setTonerType] = useState(params.get("toner_type") || "all");
    const [facets, setFacets] = useState({ brands: [], cities: [] });
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orderProduct, setOrderProduct] = useState(null);

    useEffect(() => {
        api.get("/products/facets").then((r) => setFacets(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const qp = {};
            if (params.get("q")) qp.q = params.get("q");
            if (params.get("brand")) qp.brand = params.get("brand");
            if (params.get("city")) qp.city = params.get("city");
            if (params.get("toner_type")) qp.toner_type = params.get("toner_type");
            try {
                const r = await api.get("/products/grouped", { params: qp });
                setGroups(r.data);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [params]);

    const apply = (override) => {
        const useQ = override?.query ?? q;
        const p = new URLSearchParams();
        if (useQ) p.set("q", useQ);
        if (brand && brand !== "all") p.set("brand", brand);
        if (city && city !== "all") p.set("city", city);
        if (tonerType && tonerType !== "all") p.set("toner_type", tonerType);
        setParams(p);
    };

    const setFilter = (key, val) => {
        const p = new URLSearchParams(params);
        if (val === "all" || !val) p.delete(key); else p.set(key, val);
        setParams(p);
        if (key === "brand") setBrand(val);
        if (key === "city") setCity(val);
        if (key === "toner_type") setTonerType(val);
    };

    const clearAll = () => { setQ(""); setBrand("all"); setCity("all"); setTonerType("all"); setParams(new URLSearchParams()); };

    const activeFilters = useMemo(() => {
        const out = [];
        if (params.get("q")) out.push({ k: "q", label: `“${params.get("q")}”` });
        if (params.get("brand")) out.push({ k: "brand", label: params.get("brand") });
        if (params.get("city")) out.push({ k: "city", label: params.get("city") });
        if (params.get("toner_type")) out.push({ k: "toner_type", label: params.get("toner_type") });
        return out;
    }, [params]);

    const totalListings = groups.reduce((a, g) => a + g.supplier_count, 0);

    return (
        <div className="tc-container py-8" data-testid="search-page">
            {/* Top search */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row gap-2 items-stretch" data-testid="search-bar">
                <div className="flex-1 min-w-0">
                    <TonerSearchInput value={q} onChange={setQ} onSubmit={apply} testId="search-input" />
                </div>
                <Button className="btn-primary text-white px-6" onClick={() => apply()} data-testid="search-apply-btn">
                    <FilterIcon size={14} className="mr-1" /> Apply
                </Button>
            </div>

            {/* Active filter chips */}
            {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-4">
                    <span className="tc-eyebrow">Active:</span>
                    {activeFilters.map((f) => (
                        <button key={f.k} onClick={() => setFilter(f.k, "all")} className="tc-badge tc-badge-gray flex items-center gap-1" data-testid={`active-filter-${f.k}`}>
                            {f.label} <X size={10} />
                        </button>
                    ))}
                    <button onClick={clearAll} className="text-xs text-[#00B7C7] font-semibold hover:underline" data-testid="clear-filters-btn">Clear all</button>
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-6 mt-6">
                {/* SIDEBAR */}
                <aside className="lg:col-span-3" data-testid="search-sidebar">
                    <div className="tc-card-flat p-5 mb-4">
                        <div className="font-bold text-sm text-[#0E0F12] mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-4 bg-[#00B7C7]" /> Brand
                        </div>
                        <div className="space-y-1.5 text-sm">
                            <button onClick={() => setFilter("brand", "all")} className={`block w-full text-left px-2 py-1 rounded ${brand === "all" ? "bg-slate-100 font-semibold" : "text-slate-600 hover:bg-slate-50"}`} data-testid="filter-brand-all">All brands</button>
                            {facets.brands.map((b) => (
                                <button key={b} onClick={() => setFilter("brand", b)} className={`block w-full text-left px-2 py-1 rounded ${brand === b ? "bg-slate-100 font-semibold" : "text-slate-600 hover:bg-slate-50"}`} data-testid={`filter-brand-${b}`}>
                                    {b}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="tc-card-flat p-5 mb-4">
                        <div className="font-bold text-sm text-[#0E0F12] mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-4 bg-[#E6007E]" /> Supplier city
                        </div>
                        <div className="space-y-1.5 text-sm max-h-72 overflow-auto">
                            <button onClick={() => setFilter("city", "all")} className={`block w-full text-left px-2 py-1 rounded ${city === "all" ? "bg-slate-100 font-semibold" : "text-slate-600 hover:bg-slate-50"}`} data-testid="filter-city-all">All cities</button>
                            {facets.cities.map((c) => (
                                <button key={c} onClick={() => setFilter("city", c)} className={`block w-full text-left px-2 py-1 rounded ${city === c ? "bg-slate-100 font-semibold" : "text-slate-600 hover:bg-slate-50"}`} data-testid={`filter-city-${c}`}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="tc-card-flat p-5">
                        <div className="font-bold text-sm text-[#0E0F12] mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-4 bg-[#F7C600]" /> Toner type
                        </div>
                        <div className="space-y-1.5 text-sm">
                            {["all", "Original", "Compatible", "Refilled"].map((t) => (
                                <button key={t} onClick={() => setFilter("toner_type", t)} className={`block w-full text-left px-2 py-1 rounded ${tonerType === t ? "bg-slate-100 font-semibold" : "text-slate-600 hover:bg-slate-50"}`} data-testid={`filter-type-${t}`}>
                                    {t === "all" ? "All types" : t}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* RESULTS */}
                <main className="lg:col-span-9">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Results</div>
                            <h1 className="text-2xl font-bold text-[#0E0F12] mt-1" data-testid="search-results-count">
                                {loading ? "Loading…" : `${groups.length} model${groups.length === 1 ? "" : "s"} · ${totalListings} listings`}
                            </h1>
                        </div>
                    </div>

                    {loading && (
                        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
                    )}

                    {!loading && groups.length === 0 && (
                        <div className="tc-card p-12 text-center" data-testid="search-empty-state">
                            <Boxes className="mx-auto text-slate-300" size={42} />
                            <div className="mt-3 text-lg font-bold text-[#0E0F12]">No matching toners</div>
                            <div className="text-slate-500 text-sm mt-1">Try a different model number, brand or city.</div>
                            <Button className="btn-cta mt-4" onClick={clearAll} data-testid="empty-clear-btn">Clear filters</Button>
                        </div>
                    )}

                    <div className="space-y-4">
                        {groups.map((g) => (
                            <div key={g.model_number} className="tc-card overflow-hidden" data-testid={`group-${g.model_number.replace(/\s+/g, '-')}`}>
                                <div className="grid lg:grid-cols-12">
                                    <div className="lg:col-span-4 bg-slate-50 p-5 border-r border-slate-100">
                                        <div className={`tc-thumb ${colorClass(g.color)}`} />
                                        <div className="tc-eyebrow mt-4">{g.brand}</div>
                                        <div className="text-2xl font-bold text-[#0E0F12] mt-1 font-mono">{g.model_number}</div>
                                        <div className="text-sm text-slate-600 mt-1 line-clamp-2">{g.title}</div>
                                        {g.compatible_printers && (
                                            <div className="text-xs text-slate-500 mt-3 line-clamp-3"><span className="font-semibold text-slate-700">Compatible:</span> {g.compatible_printers}</div>
                                        )}
                                        <div className="mt-4 pt-4 border-t border-slate-200 flex items-end justify-between">
                                            <div>
                                                <div className="tc-eyebrow">From</div>
                                                <div className="font-mono text-2xl font-bold text-[#0E0F12]">₹{Math.round(g.min_price).toLocaleString('en-IN')}</div>
                                            </div>
                                            <div className="text-right">
                                                <span className="tc-badge tc-badge-cyan">{g.supplier_count} sellers</span>
                                                {g.page_yield && <div className="text-xs text-slate-500 mt-1.5 font-mono">~{g.page_yield} pages</div>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lg:col-span-8 divide-y divide-slate-100">
                                        {g.listings.map((p, idx) => (
                                            <div key={p.id} className="p-4 grid md:grid-cols-12 gap-3 items-center hover:bg-slate-50/60" data-testid={`listing-${p.id}`}>
                                                <div className="md:col-span-4">
                                                    <div className="font-semibold text-[#0E0F12]">{p.supplier_company || p.supplier_name}</div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {p.city}</div>
                                                    <div className="text-[11px] text-slate-400 mt-1 uppercase tracking-wider">{p.toner_type || "Original"}</div>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="tc-eyebrow">Price/unit</div>
                                                    <div className="font-mono font-semibold text-[#0E0F12]">₹{p.price.toLocaleString('en-IN')}</div>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="tc-eyebrow">Stock</div>
                                                    <div className={`text-sm font-semibold ${p.stock > 20 ? "text-emerald-700" : p.stock > 0 ? "text-amber-700" : "text-red-700"}`}>
                                                        {p.stock > 0 ? `${p.stock} units` : "Out of stock"}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-1">
                                                    <div className="tc-eyebrow">Color</div>
                                                    <div className="text-sm">{p.color}</div>
                                                </div>
                                                <div className="md:col-span-3 flex md:justify-end">
                                                    <Button
                                                        size="sm"
                                                        className={idx === 0 ? "btn-cta" : "btn-primary text-white"}
                                                        onClick={() => {
                                                            if (!user) { navigate("/login"); return; }
                                                            if (user.role !== "customer") return;
                                                            setOrderProduct(p);
                                                        }}
                                                        disabled={p.stock <= 0}
                                                        data-testid={`request-order-btn-${p.id}`}
                                                    >
                                                        Request Order <ChevronRight size={14} className="ml-1" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>

            {orderProduct && <OrderRequestDialog product={orderProduct} onClose={() => setOrderProduct(null)} />}
        </div>
    );
}
