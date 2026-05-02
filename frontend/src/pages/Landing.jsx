import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Truck, ShieldCheck, MapPin, Tag, Boxes } from "lucide-react";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import api from "../lib/api";
import TonerSearchInput from "../components/TonerSearchInput";

const POPULAR = ["HP 88A", "HP 12A", "HP 78A", "Canon 925", "Brother TN-2365", "Samsung MLT-D101S"];

const colorClass = (c) => ({ Cyan: "tc-thumb-cyan", Magenta: "tc-thumb-magenta", Yellow: "tc-thumb-yellow", Black: "tc-thumb-black" })[c] || "tc-thumb-cyan";

export default function Landing() {
    const navigate = useNavigate();
    const [q, setQ] = useState("");
    const [brand, setBrand] = useState("all");
    const [city, setCity] = useState("all");
    const [facets, setFacets] = useState({ brands: [], cities: [], models: [] });
    const [grouped, setGrouped] = useState([]);
    const [stats, setStats] = useState({ tm: 0, sup: 0, cit: 0 });

    useEffect(() => {
        api.get("/products/facets").then((r) => {
            setFacets(r.data);
            setStats((s) => ({ ...s, sup: 25, cit: r.data.cities.length, tm: r.data.models.length }));
        }).catch(() => {});
        api.get("/products/grouped").then((r) => setGrouped(r.data.slice(0, 6))).catch(() => {});
    }, []);

    const submit = (override) => {
        const useQ = override?.query ?? q;
        const params = new URLSearchParams();
        if (useQ) params.set("q", useQ);
        if (brand && brand !== "all") params.set("brand", brand);
        if (city && city !== "all") params.set("city", city);
        navigate(`/search?${params.toString()}`);
    };

    return (
        <div data-testid="landing-page">
            {/* HERO */}
            <section className="tc-hero">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-16 pb-20 lg:pt-24 lg:pb-28">
                    <div className="flex items-center gap-3 mb-6 tc-fade-up">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-slate-300">India&apos;s focused toner marketplace</span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white max-w-4xl leading-[1.05] tc-fade-up" data-testid="hero-headline">
                        Source printer toners <span className="text-[#F7C600]">in bulk</span>, from <span className="text-[#00B7C7]">verified</span> suppliers across India.
                    </h1>
                    <p className="text-slate-300 max-w-2xl mt-5 text-base sm:text-lg tc-fade-up">
                        Compare prices from multiple sellers, check live stock by city, and place order requests in minutes — no payment gateway, just direct B2B trade.
                    </p>

                    <div className="mt-10 tc-search tc-fade-up" data-testid="hero-search-form">
                        <TonerSearchInput value={q} onChange={setQ} onSubmit={submit} size="lg" testId="hero-search-input" />
                        <Select value={brand} onValueChange={setBrand}>
                            <SelectTrigger className="h-14 bg-slate-50 rounded-md" data-testid="hero-brand-select">
                                <SelectValue placeholder="Brand" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All brands</SelectItem>
                                {facets.brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={city} onValueChange={setCity}>
                            <SelectTrigger className="h-14 bg-slate-50 rounded-md" data-testid="hero-city-select">
                                <SelectValue placeholder="City" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All cities</SelectItem>
                                {facets.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button onClick={() => submit()} className="btn-cta h-14 px-7 font-semibold" data-testid="hero-search-submit">
                            Search <ArrowRight size={16} className="ml-1" />
                        </Button>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                        <span className="tc-eyebrow text-[#F7C600]">Popular</span>
                        {POPULAR.map((m) => (
                            <button
                                key={m}
                                onClick={() => { setQ(m); submit({ query: m }); }}
                                className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs text-white"
                                data-testid={`trending-${m.replace(/\s+/g, '-')}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    <div className="mt-12 grid sm:grid-cols-3 gap-6 max-w-3xl">
                        {[
                            { icon: BadgeCheck, label: "Verified suppliers", note: "Admin-approved sellers only", c: "#00B7C7" },
                            { icon: Truck, label: "Direct delivery", note: "Suppliers ship from your city", c: "#E6007E" },
                            { icon: ShieldCheck, label: "Zero commissions", note: "Trade directly, no middleman", c: "#F7C600" },
                        ].map((f) => (
                            <div key={f.label} className="flex items-start gap-3">
                                <f.icon size={20} className="mt-0.5" style={{ color: f.c }} />
                                <div>
                                    <div className="text-white text-sm font-semibold">{f.label}</div>
                                    <div className="text-slate-400 text-xs mt-0.5">{f.note}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* STATS STRIP */}
            <section className="border-b border-slate-200 bg-white">
                <div className="tc-container py-6 grid grid-cols-3 sm:grid-cols-4 gap-4 text-center sm:text-left">
                    {[
                        { v: facets.models.length, k: "Toner SKUs listed" },
                        { v: stats.sup, k: "Verified suppliers" },
                        { v: stats.cit, k: "Cities covered" },
                        { v: facets.brands.length, k: "Brands" },
                    ].map((s, i) => (
                        <div key={i} className="flex sm:flex-col items-center sm:items-start gap-2">
                            <div className="font-mono text-2xl sm:text-3xl font-bold text-[#0E0F12]">{s.v}</div>
                            <div className="tc-eyebrow">{s.k}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* POPULAR MODELS */}
            <section className="tc-container py-16 lg:py-24">
                <div className="flex items-end justify-between mb-8">
                    <div>
                        <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Top models</div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#0E0F12] mt-2">Most-requested toners on the platform</h2>
                    </div>
                    <Button variant="outline" onClick={() => navigate('/search')} data-testid="browse-all-btn">Browse all</Button>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {grouped.map((g) => (
                        <button
                            key={g.model_number}
                            onClick={() => navigate(`/search?q=${encodeURIComponent(g.model_number)}`)}
                            className="tc-card p-5 text-left"
                            data-testid={`model-card-${g.model_number.replace(/\s+/g, '-')}`}
                        >
                            <div className={`tc-thumb ${colorClass(g.color)}`} />
                            <div className="flex items-center justify-between mt-4">
                                <div className="tc-eyebrow">{g.brand}</div>
                                <span className="tc-badge tc-badge-cyan">{g.supplier_count} sellers</span>
                            </div>
                            <div className="mt-2 text-xl font-bold text-[#0E0F12] font-mono">{g.model_number}</div>
                            <div className="text-sm text-slate-600 mt-1 line-clamp-2">{g.title}</div>
                            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                                <div>
                                    <div className="tc-eyebrow">From</div>
                                    <div className="font-mono font-semibold text-[#0E0F12] text-lg">₹{Math.round(g.min_price).toLocaleString('en-IN')}</div>
                                </div>
                                <span className="text-[#0E0F12] text-sm font-semibold flex items-center gap-1 bg-[#F7C600] px-3 py-1.5 rounded-md">
                                    Compare <ArrowRight size={14} />
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="bg-white border-y border-slate-200">
                <div className="tc-container py-16 lg:py-24 grid lg:grid-cols-2 gap-12">
                    <div>
                        <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />How it works</div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#0E0F12] mt-2 max-w-md">Three steps from search to shipment.</h2>
                        <p className="text-slate-600 mt-4 max-w-md">Built for procurement managers, IT admins and resellers handling recurring bulk toner requirements.</p>
                    </div>
                    <ol className="space-y-6">
                        {[
                            { n: "01", t: "Search & compare", d: "Look up your toner model. See multiple suppliers side-by-side with price, city and stock.", c: "#00B7C7" },
                            { n: "02", t: "Send order request", d: "Pick a supplier, fill quantity and delivery address. No payment — request is forwarded directly.", c: "#E6007E" },
                            { n: "03", t: "Track status", d: "Supplier accepts, ships with tracking number, then marks completed. Watch every step.", c: "#F7C600" },
                        ].map((s) => (
                            <li key={s.n} className="flex gap-5">
                                <div className="font-mono text-3xl font-bold leading-none pt-1" style={{ color: s.c }}>{s.n}</div>
                                <div>
                                    <div className="font-semibold text-[#0E0F12] text-lg">{s.t}</div>
                                    <div className="text-slate-600 text-sm mt-1 max-w-sm">{s.d}</div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* SUPPLIER CTA */}
            <section className="tc-container py-16 lg:py-24">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden grid lg:grid-cols-5">
                    <div className="lg:col-span-3 p-8 lg:p-12">
                        <div className="tc-eyebrow"><Tag className="inline mr-1" size={12} /> For suppliers</div>
                        <h3 className="text-2xl sm:text-3xl font-bold text-[#0E0F12] mt-3">Are you a toner distributor?</h3>
                        <p className="text-slate-600 mt-3 max-w-lg">Get listed on TonersCart and reach hundreds of verified bulk buyers across India. Manage stock, pricing and incoming orders from one clean dashboard.</p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <Button className="btn-cta" onClick={() => navigate("/register?role=supplier")} data-testid="cta-supplier-signup">
                                Apply as a supplier
                            </Button>
                            <Button variant="outline" onClick={() => navigate("/login")} data-testid="cta-supplier-login">
                                Supplier login
                            </Button>
                        </div>
                    </div>
                    <div className="lg:col-span-2 bg-[#0E0F12] text-slate-100 p-8 lg:p-12 relative overflow-hidden">
                        <div className="absolute -bottom-10 -right-10 w-60 h-60 opacity-20 tc-cmyk-dots" />
                        <div className="tc-eyebrow text-[#F7C600] relative">Live on the platform</div>
                        <div className="grid grid-cols-2 gap-6 mt-5 relative">
                            {[
                                { k: "Cities", v: facets.cities.length || "—" },
                                { k: "Brands", v: facets.brands.length || "—" },
                                { k: "Toner SKUs", v: facets.models.length || "—" },
                                { k: "Suppliers", v: stats.sup || "—" },
                            ].map((s) => (
                                <div key={s.k}>
                                    <div className="font-mono text-3xl text-white font-bold">{s.v}</div>
                                    <div className="tc-eyebrow text-slate-400 mt-1">{s.k}</div>
                                </div>
                            ))}
                        </div>
                        <div className="absolute bottom-6 right-6 flex items-center gap-2 text-xs text-slate-400">
                            <MapPin size={12} /> Pan-India
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
