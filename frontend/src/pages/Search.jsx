import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapPin, Boxes, ArrowRight, X, SlidersHorizontal } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import OrderRequestDialog from "../components/OrderRequestDialog";
import TonerSearchInput from "../components/TonerSearchInput";
import useReveal from "../hooks/useReveal";

const colorClass = (c) => ({ Cyan: "tc-thumb-cyan", Magenta: "tc-thumb-magenta", Yellow: "tc-thumb-yellow", Black: "tc-thumb-black" })[c] || "tc-thumb-cyan";

const SidebarHeading = ({ accent, children }) => (
    <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-4 rounded-full" style={{ background: accent }} />
        <span className="text-[12px] font-semibold tracking-tight text-[#0A0A0B]">{children}</span>
    </div>
);

const SidebarItem = ({ active, onClick, children, testid }) => (
    <button
        onClick={onClick}
        data-testid={testid}
        className={`block w-full text-left px-3 py-1.5 rounded-lg text-[13.5px] transition-colors ${
            active ? "bg-black/[0.05] text-[#0A0A0B] font-semibold" : "text-[#1D1D1F] hover:bg-black/[0.03]"
        }`}
    >
        {children}
    </button>
);

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
    const rootRef = useReveal([groups.length]);

    useEffect(() => { api.get("/products/facets").then((r) => setFacets(r.data)).catch(() => {}); }, []);

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
            } finally { setLoading(false); }
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
        if (params.get("q")) out.push({ k: "q", label: `"${params.get("q")}"` });
        if (params.get("brand")) out.push({ k: "brand", label: params.get("brand") });
        if (params.get("city")) out.push({ k: "city", label: params.get("city") });
        if (params.get("toner_type")) out.push({ k: "toner_type", label: params.get("toner_type") });
        return out;
    }, [params]);

    const totalListings = groups.reduce((a, g) => a + g.supplier_count, 0);

    return (
        <div className="tc-container py-10" ref={rootRef} data-testid="search-page">
            {/* Premium top search */}
            <div className="tc-search-shell" style={{ gridTemplateColumns: "1fr auto" }} data-testid="search-bar">
                <TonerSearchInput value={q} onChange={setQ} onSubmit={apply} testId="search-input" />
                <button onClick={() => apply()} className="tc-search-go" data-testid="search-apply-btn">
                    <SlidersHorizontal size={15} /> Apply
                </button>
            </div>

            {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-5">
                    <span className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">Active</span>
                    {activeFilters.map((f) => (
                        <button key={f.k} onClick={() => setFilter(f.k, "all")} className="tc-badge tc-badge-gray flex items-center gap-1 hover:bg-black/[0.06]" data-testid={`active-filter-${f.k}`}>
                            {f.label} <X size={10} />
                        </button>
                    ))}
                    <button onClick={clearAll} className="text-[12px] text-[#00B7C7] font-semibold hover:underline" data-testid="clear-filters-btn">Clear all</button>
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-8 mt-8">
                {/* SIDEBAR — sticky on large screens */}
                <aside className="lg:col-span-3 lg:sticky lg:top-20 lg:self-start space-y-5" data-testid="search-sidebar">
                    <div className="tc-card-flat p-5">
                        <SidebarHeading accent="#00B7C7">Brand</SidebarHeading>
                        <div className="space-y-0.5">
                            <SidebarItem active={brand === "all"} onClick={() => setFilter("brand", "all")} testid="filter-brand-all">All brands</SidebarItem>
                            {facets.brands.map((b) => (
                                <SidebarItem key={b} active={brand === b} onClick={() => setFilter("brand", b)} testid={`filter-brand-${b}`}>{b}</SidebarItem>
                            ))}
                        </div>
                    </div>

                    <div className="tc-card-flat p-5">
                        <SidebarHeading accent="#E6007E">Supplier city</SidebarHeading>
                        <div className="space-y-0.5 max-h-72 overflow-auto pr-1">
                            <SidebarItem active={city === "all"} onClick={() => setFilter("city", "all")} testid="filter-city-all">All cities</SidebarItem>
                            {facets.cities.map((c) => (
                                <SidebarItem key={c} active={city === c} onClick={() => setFilter("city", c)} testid={`filter-city-${c}`}>{c}</SidebarItem>
                            ))}
                        </div>
                    </div>

                    <div className="tc-card-flat p-5">
                        <SidebarHeading accent="#F5C400">Toner type</SidebarHeading>
                        <div className="space-y-0.5">
                            {["all", "Original", "Compatible", "Refilled"].map((t) => (
                                <SidebarItem key={t} active={tonerType === t} onClick={() => setFilter("toner_type", t)} testid={`filter-type-${t}`}>
                                    {t === "all" ? "All types" : t}
                                </SidebarItem>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* RESULTS */}
                <main className="lg:col-span-9">
                    <div className="flex items-end justify-between mb-6">
                        <div>
                            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Results</div>
                            <h1 className="tc-h2 text-[#0A0A0B] mt-2" data-testid="search-results-count">
                                {loading ? "Loading…" : `${groups.length} model${groups.length === 1 ? "" : "s"} · ${totalListings} listings`}
                            </h1>
                        </div>
                    </div>

                    {loading && (
                        <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
                    )}

                    {!loading && groups.length === 0 && (
                        <div className="tc-card p-16 text-center" data-testid="search-empty-state">
                            <Boxes className="mx-auto text-[#D2D2D7]" size={48} />
                            <div className="mt-4 tc-h3 text-[#0A0A0B]">No matching toners</div>
                            <div className="text-[#6E6E73] text-[14px] mt-1">Try a different model number, brand or city.</div>
                            <button className="btn-cta mt-6" onClick={clearAll} data-testid="empty-clear-btn">Clear filters</button>
                        </div>
                    )}

                    <div className="space-y-5">
                        {groups.map((g, idx) => (
                            <div key={g.model_number} className="tc-card overflow-hidden tc-reveal" style={{ transitionDelay: `${Math.min(idx * 50, 300)}ms` }} data-testid={`group-${g.model_number.replace(/\s+/g, '-')}`}>
                                <div className="grid lg:grid-cols-12">
                                    <div className="lg:col-span-4 bg-[#FBFBFD] p-6 border-r border-black/[0.06]">
                                        <div className={`tc-thumb ${colorClass(g.color)}`} />
                                        <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-5">{g.brand}</div>
                                        <div className="font-mono text-[26px] font-semibold text-[#0A0A0B] mt-1 tracking-tight">{g.model_number}</div>
                                        <div className="text-[14px] text-[#1D1D1F] mt-1.5 line-clamp-2">{g.title}</div>
                                        {g.compatible_printers && (
                                            <div className="text-[12px] text-[#6E6E73] mt-3 line-clamp-3 leading-relaxed">
                                                <span className="font-semibold text-[#1D1D1F]">Compatible:</span> {g.compatible_printers}
                                            </div>
                                        )}
                                        <div className="mt-5 pt-5 border-t border-black/[0.06] flex items-end justify-between">
                                            <div>
                                                <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">From</div>
                                                <div className="font-mono text-[24px] font-semibold text-[#0A0A0B] mt-0.5">₹{Math.round(g.min_price).toLocaleString('en-IN')}</div>
                                            </div>
                                            <div className="text-right">
                                                <span className="tc-badge tc-badge-cyan">{g.supplier_count} sellers</span>
                                                {g.page_yield && <div className="text-[11px] text-[#6E6E73] mt-2 font-mono">~{g.page_yield} pages</div>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lg:col-span-8 divide-y divide-black/[0.05]">
                                        {g.listings.map((p, i) => (
                                            <div key={p.id} className="p-5 grid md:grid-cols-12 gap-4 items-center hover:bg-black/[0.015] transition-colors" data-testid={`listing-${p.id}`}>
                                                <div className="md:col-span-4">
                                                    <div className="font-semibold text-[15px] text-[#0A0A0B] tracking-tight">{p.supplier_company || p.supplier_name}</div>
                                                    <div className="text-[12px] text-[#6E6E73] flex items-center gap-1 mt-1"><MapPin size={12} /> {p.city}</div>
                                                    <div className="text-[10px] text-[#86868B] mt-1.5 uppercase tracking-[0.14em]">{p.toner_type || "Original"}</div>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Price</div>
                                                    <div className="font-mono font-semibold text-[#0A0A0B] mt-0.5">₹{p.price.toLocaleString('en-IN')}</div>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Stock</div>
                                                    <div className={`text-[14px] font-semibold mt-0.5 ${p.stock > 20 ? "text-emerald-700" : p.stock > 0 ? "text-amber-700" : "text-red-700"}`}>
                                                        {p.stock > 0 ? `${p.stock} units` : "Out of stock"}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-1">
                                                    <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Color</div>
                                                    <div className="text-[13px] mt-0.5">{p.color}</div>
                                                </div>
                                                <div className="md:col-span-3 flex md:justify-end">
                                                    <button
                                                        className={i === 0 ? "btn-cta text-[13px]" : "btn-primary text-[13px]"}
                                                        onClick={() => {
                                                            if (!user) { navigate("/login"); return; }
                                                            if (user.role !== "customer") return;
                                                            setOrderProduct(p);
                                                        }}
                                                        disabled={p.stock <= 0}
                                                        data-testid={`request-order-btn-${p.id}`}
                                                    >
                                                        Request <ArrowRight size={13} className="inline ml-1" />
                                                    </button>
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
