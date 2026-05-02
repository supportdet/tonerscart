import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, MapPin, Boxes, ChevronRight, Filter } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import OrderRequestDialog from "../components/OrderRequestDialog";

export default function SearchPage() {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [q, setQ] = useState(params.get("q") || "");
    const [brand, setBrand] = useState(params.get("brand") || "all");
    const [city, setCity] = useState(params.get("city") || "all");
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
            try {
                const r = await api.get("/products/grouped", { params: qp });
                setGroups(r.data);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [params]);

    const apply = () => {
        const p = new URLSearchParams();
        if (q) p.set("q", q);
        if (brand && brand !== "all") p.set("brand", brand);
        if (city && city !== "all") p.set("city", city);
        setParams(p);
    };

    return (
        <div className="tc-container py-8" data-testid="search-page">
            {/* SEARCH BAR */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col md:flex-row gap-2" data-testid="search-bar">
                <div className="flex items-center gap-2 px-2 flex-1">
                    <Search className="text-slate-400" size={16} />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Toner model number" className="border-0 shadow-none focus-visible:ring-0" data-testid="search-input" onKeyDown={(e) => e.key === 'Enter' && apply()} />
                </div>
                <Select value={brand} onValueChange={setBrand}>
                    <SelectTrigger className="md:w-44" data-testid="search-brand-select"><SelectValue placeholder="Brand" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All brands</SelectItem>
                        {facets.brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={city} onValueChange={setCity}>
                    <SelectTrigger className="md:w-44" data-testid="search-city-select"><SelectValue placeholder="City" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All cities</SelectItem>
                        {facets.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button className="btn-primary text-white" onClick={apply} data-testid="search-apply-btn"><Filter size={14} className="mr-1" />Apply</Button>
            </div>

            <div className="flex items-center justify-between mt-6 mb-3">
                <div>
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Search results</div>
                    <h1 className="tc-display text-2xl font-bold text-[#0B1B3D] mt-1" data-testid="search-results-count">
                        {loading ? "Loading…" : `${groups.length} toner model${groups.length === 1 ? "" : "s"} found`}
                    </h1>
                </div>
            </div>

            {loading && (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
            )}

            {!loading && groups.length === 0 && (
                <div className="tc-card p-12 text-center" data-testid="search-empty-state">
                    <Boxes className="mx-auto text-slate-300" size={40} />
                    <div className="mt-3 tc-display text-lg font-semibold text-[#0B1B3D]">No matching toners</div>
                    <div className="text-slate-500 text-sm mt-1">Try a different model number, brand or city.</div>
                </div>
            )}

            <div className="space-y-5">
                {groups.map((g) => (
                    <div key={g.model_number} className="tc-card overflow-hidden" data-testid={`group-${g.model_number.replace(/\s+/g, '-')}`}>
                        <div className="grid lg:grid-cols-12">
                            <div className="lg:col-span-3 bg-slate-50 p-5 border-r border-slate-100">
                                <div className="tc-eyebrow">{g.brand}</div>
                                <div className="tc-display text-2xl font-bold text-[#0B1B3D] mt-1">{g.model_number}</div>
                                <div className="text-sm text-slate-600 mt-1">{g.title}</div>
                                <div className="mt-4 pt-4 border-t border-slate-200">
                                    <div className="tc-eyebrow">Lowest price</div>
                                    <div className="font-mono text-2xl font-bold text-[#0B1B3D]">₹{g.min_price.toLocaleString('en-IN')}</div>
                                    <div className="text-xs text-slate-500 mt-1">{g.supplier_count} supplier{g.supplier_count === 1 ? "" : "s"} listing</div>
                                </div>
                            </div>
                            <div className="lg:col-span-9 divide-y divide-slate-100">
                                {g.listings.map((p, idx) => (
                                    <div key={p.id} className="p-4 grid md:grid-cols-12 gap-3 items-center hover:bg-slate-50/60" data-testid={`listing-${p.id}`}>
                                        <div className="md:col-span-4">
                                            <div className="font-semibold text-[#0B1B3D]">{p.supplier_company || p.supplier_name}</div>
                                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                <MapPin size={12} /> {p.city}
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="tc-eyebrow">Price / unit</div>
                                            <div className="font-mono font-semibold text-[#0B1B3D]">₹{p.price.toLocaleString('en-IN')}</div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="tc-eyebrow">Stock</div>
                                            <div className={`text-sm font-semibold ${p.stock > 20 ? "text-emerald-700" : p.stock > 0 ? "text-amber-700" : "text-red-700"}`}>
                                                {p.stock > 0 ? `${p.stock} units` : "Out of stock"}
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="tc-eyebrow">Color</div>
                                            <div className="text-sm">{p.color}</div>
                                        </div>
                                        <div className="md:col-span-2 flex md:justify-end">
                                            <Button
                                                size="sm"
                                                className={idx === 0 ? "btn-accent text-white" : "btn-primary text-white"}
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

            {orderProduct && (
                <OrderRequestDialog product={orderProduct} onClose={() => setOrderProduct(null)} />
            )}
        </div>
    );
}
