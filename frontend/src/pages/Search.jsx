import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapPin, Boxes, Plus, Minus, ShoppingCart, X } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import OrderRequestDialog from "../components/OrderRequestDialog";
import TonerSearchInput from "../components/TonerSearchInput";
import TonerCartridge from "../components/TonerCartridge";
import useReveal from "../hooks/useReveal";

const SidebarItem = ({ active, onClick, children, testid }) => (
    <button onClick={onClick} data-testid={testid}
        className={`block w-full text-left px-3 py-1.5 rounded-lg text-[13.5px] transition-colors ${
            active ? "bg-black/[0.05] text-[#0A0A0B] font-semibold" : "text-[#1D1D1F] hover:bg-black/[0.03]"
        }`}>
        {children}
    </button>
);

function ProductCard({ p, qty, setQty, onBuy, onCart }) {
    return (
        <div className="tc-product-card" data-testid={`product-card-${p.id}`}>
            <div className="tc-product-img">
                <span className="tc-product-img-label">{p.brand}</span>
                <TonerCartridge color={p.color || "Black"} brand={p.brand} model={p.model_number} />
            </div>
            <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{p.brand}</div>
                    <span className="tc-badge tc-badge-gray">{p.toner_type || "Original"}</span>
                </div>
                <div className="font-mono text-[18px] font-semibold text-[#0A0A0B] tracking-tight">{p.model_number}</div>
                <div className="text-[13px] text-[#1D1D1F] truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                    {p.supplier_company || p.supplier_name}
                </div>
                <div className="text-[12px] text-[#6E6E73] flex items-center gap-1">
                    <MapPin size={11} /> {p.city}
                </div>

                <div className="mt-2 pt-3 border-t border-black/[0.05] flex items-end justify-between gap-2">
                    <div>
                        <div className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">Price</div>
                        <div className="font-mono text-[18px] font-semibold text-[#0A0A0B]">₹{p.price.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="tc-qty" data-testid={`qty-${p.id}`}>
                        <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease"><Minus size={14} /></button>
                        <span data-testid={`qty-value-${p.id}`}>{qty}</span>
                        <button type="button" onClick={() => setQty(Math.min(p.stock, qty + 1))} disabled={qty >= p.stock} aria-label="Increase"><Plus size={14} /></button>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => onCart(p, qty)} className="btn-light text-[12.5px] py-2" data-testid={`cart-${p.id}`}>
                        <ShoppingCart size={13} className="inline mr-1" /> Add
                    </button>
                    <button onClick={() => onBuy(p, qty)} className="btn-cta text-[12.5px] py-2" disabled={p.stock <= 0} data-testid={`buy-${p.id}`}>
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
    const [q, setQ] = useState(params.get("q") || "");
    const [brand, setBrand] = useState(params.get("brand") || "all");
    const [filterCity, setFilterCity] = useState(params.get("city") || "all");
    const [tonerType, setTonerType] = useState(params.get("toner_type") || "all");
    const [facets, setFacets] = useState({ brands: [], cities: [] });
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orderProduct, setOrderProduct] = useState(null);
    const [orderQty, setOrderQty] = useState(1);
    const [qtyMap, setQtyMap] = useState({});
    const [cart, setCart] = useState([]);
    const rootRef = useReveal([products.length]);

    useEffect(() => { api.get("/products/facets").then((r) => setFacets(r.data)).catch(() => {}); }, []);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const qp = {};
            if (params.get("q")) qp.q = params.get("q");
            if (params.get("brand")) qp.brand = params.get("brand");
            if (params.get("city") && params.get("city") !== "all") qp.city = params.get("city");
            try {
                const r = await api.get("/products/search", { params: { ...qp, limit: 500 } });
                let items = r.data;
                if (params.get("toner_type") && params.get("toner_type") !== "all") {
                    items = items.filter((p) => p.toner_type === params.get("toner_type"));
                }
                items.sort((a, b) => a.price - b.price);
                setProducts(items);
            } finally { setLoading(false); }
        };
        fetch();
    }, [params]);

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

    const onBuy = (p, qty) => {
        if (!user) { navigate("/login"); return; }
        if (user.role !== "customer") return;
        setOrderQty(qty); setOrderProduct(p);
    };
    const onCart = (p, qty) => {
        setCart((c) => {
            const i = c.findIndex((it) => it.product.id === p.id);
            if (i >= 0) { const next = [...c]; next[i] = { ...next[i], qty: Math.min(p.stock, next[i].qty + qty) }; return next; }
            return [...c, { product: p, qty }];
        });
    };

    return (
        <div className="tc-container py-10" ref={rootRef} data-testid="search-page">
            <div className="tc-search-shell" style={{ gridTemplateColumns: "1fr auto" }} data-testid="search-bar">
                <TonerSearchInput value={q} onChange={setQ} onSubmit={apply} testId="search-input" />
                <button onClick={() => apply()} className="tc-search-go" data-testid="search-apply-btn">Search</button>
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
                <aside className="lg:col-span-3 lg:sticky lg:top-24 lg:self-start space-y-5" data-testid="search-sidebar">
                    <div className="tc-card-flat p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-1 h-4 rounded-full bg-[#00B7C7]" />
                            <span className="text-[12px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Brand</span>
                        </div>
                        <div className="space-y-0.5">
                            <SidebarItem active={brand === "all"} onClick={() => setFilter("brand", "all")} testid="filter-brand-all">All brands</SidebarItem>
                            {facets.brands.map((b) => (<SidebarItem key={b} active={brand === b} onClick={() => setFilter("brand", b)} testid={`filter-brand-${b}`}>{b}</SidebarItem>))}
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
                                <SidebarItem key={t} active={tonerType === t} onClick={() => setFilter("toner_type", t)} testid={`filter-type-${t}`}>{t === "all" ? "All types" : t}</SidebarItem>
                            ))}
                        </div>
                    </div>

                    {cart.length > 0 && (
                        <div className="tc-card-flat p-5" data-testid="cart-summary">
                            <div className="flex items-center gap-2 mb-3">
                                <ShoppingCart size={14} className="text-[#0A0A0B]" />
                                <span className="text-[12px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Cart ({cart.length})</span>
                            </div>
                            <div className="space-y-2 mb-3">
                                {cart.slice(0, 3).map((it) => (
                                    <div key={it.product.id} className="flex items-center justify-between text-[12px]">
                                        <span className="truncate">{it.product.model_number} ×{it.qty}</span>
                                        <span className="font-mono">₹{(it.product.price * it.qty).toLocaleString('en-IN')}</span>
                                    </div>
                                ))}
                                {cart.length > 3 && <div className="text-[11px] text-[#6E6E73]">+{cart.length - 3} more</div>}
                            </div>
                            <button onClick={() => { const first = cart[0]; if (first) onBuy(first.product, first.qty); }} className="btn-cta w-full text-[12.5px] py-2">Send order request</button>
                        </div>
                    )}
                </aside>

                <main className="lg:col-span-9">
                    <div className="flex items-end justify-between mb-6">
                        <div>
                            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Results</div>
                            <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 2.6vw, 34px)", fontWeight: 300, letterSpacing: "-0.015em", lineHeight: 1.14 }} data-testid="search-results-count">
                                {loading ? "Loading…" : `${products.length} listings${filterCity !== "all" ? ` · ${filterCity}` : ""}`}
                            </h1>
                        </div>
                    </div>

                    {loading && (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
                        </div>
                    )}

                    {!loading && products.length === 0 && (
                        <div className="tc-card p-16 text-center" data-testid="search-empty-state">
                            <Boxes className="mx-auto text-[#D2D2D7]" size={48} />
                            <div className="mt-4 text-[#0A0A0B] text-xl font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>No matching toners</div>
                            <div className="text-[#6E6E73] text-[14px] mt-1">Try a different model or clear filters.</div>
                            <button className="btn-cta mt-6" onClick={clearAll} data-testid="empty-clear-btn">Clear filters</button>
                        </div>
                    )}

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {products.map((p, idx) => (
                            <div key={p.id} className="tc-reveal" style={{ transitionDelay: `${Math.min(idx * 35, 280)}ms` }}>
                                <ProductCard p={p} qty={getQty(p.id)} setQty={(n) => setQty(p.id, n)} onBuy={onBuy} onCart={onCart} />
                            </div>
                        ))}
                    </div>
                </main>
            </div>

            {orderProduct && (
                <OrderRequestDialog product={orderProduct} initialQty={orderQty} onClose={() => setOrderProduct(null)} />
            )}
        </div>
    );
}
