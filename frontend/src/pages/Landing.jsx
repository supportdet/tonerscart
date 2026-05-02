import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, Tag, ShieldCheck, Truck, BadgeCheck, ArrowRight } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import api from "../lib/api";

const POPULAR = ["HP 88A", "HP 12A", "HP 78A", "Canon 925", "Brother TN-2365", "Samsung MLT-D101S", "HP 05A", "HP 26A"];

export default function Landing() {
    const navigate = useNavigate();
    const [q, setQ] = useState("");
    const [brand, setBrand] = useState("all");
    const [city, setCity] = useState("all");
    const [facets, setFacets] = useState({ brands: [], cities: [], models: [] });
    const [grouped, setGrouped] = useState([]);

    useEffect(() => {
        api.get("/products/facets").then((r) => setFacets(r.data)).catch(() => {});
        api.get("/products/grouped").then((r) => setGrouped(r.data.slice(0, 6))).catch(() => {});
    }, []);

    const submit = (e) => {
        e?.preventDefault?.();
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (brand && brand !== "all") params.set("brand", brand);
        if (city && city !== "all") params.set("city", city);
        navigate(`/search?${params.toString()}`);
    };

    return (
        <div data-testid="landing-page">
            {/* HERO */}
            <section className="tc-hero relative overflow-hidden">
                <div className="absolute inset-0 tc-grid-bg opacity-40" />
                <div className="tc-container relative pt-16 pb-20 lg:pt-24 lg:pb-28">
                    <div className="flex items-center gap-3 mb-6 tc-fade-up">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase text-amber-300 font-semibold">India&apos;s focused toner marketplace</span>
                    </div>
                    <h1 className="tc-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white max-w-4xl leading-[1.05] tc-fade-up" data-testid="hero-headline">
                        Source printer toners <span className="text-amber-400">in bulk</span>, from verified suppliers across India.
                    </h1>
                    <p className="text-slate-300 max-w-2xl mt-5 text-base sm:text-lg tc-fade-up">
                        Compare prices from multiple sellers, check live stock in your city, and place order requests in minutes — no payment gateway, just direct B2B trade.
                    </p>

                    {/* SEARCH */}
                    <form onSubmit={submit} className="mt-10 tc-search-wrap tc-fade-up" data-testid="hero-search-form">
                        <div className="flex items-center gap-2 px-3">
                            <Search className="text-slate-400" size={18} />
                            <Input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search by toner model — e.g. HP 88A, Canon 925, TN-2365"
                                className="border-0 shadow-none focus-visible:ring-0 text-base h-12"
                                data-testid="hero-search-input"
                            />
                        </div>
                        <Select value={brand} onValueChange={setBrand}>
                            <SelectTrigger className="h-12 bg-slate-50" data-testid="hero-brand-select">
                                <SelectValue placeholder="Brand" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All brands</SelectItem>
                                {facets.brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={city} onValueChange={setCity}>
                            <SelectTrigger className="h-12 bg-slate-50" data-testid="hero-city-select">
                                <SelectValue placeholder="City" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All cities</SelectItem>
                                {facets.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button type="submit" className="btn-accent text-white h-12 px-6 font-semibold" data-testid="hero-search-submit">
                            Search <ArrowRight size={16} className="ml-1" />
                        </Button>
                    </form>

                    <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                        <span className="tc-eyebrow text-amber-300">Trending</span>
                        {POPULAR.map((m) => (
                            <button
                                key={m}
                                onClick={() => { setQ(m); setTimeout(submit, 0); }}
                                className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs"
                                data-testid={`trending-${m.replace(/\s+/g, '-')}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    <div className="mt-12 grid sm:grid-cols-3 gap-6 max-w-3xl">
                        {[
                            { icon: BadgeCheck, label: "Verified suppliers", note: "Admin-approved sellers only" },
                            { icon: Truck, label: "Direct delivery", note: "Suppliers ship from your city" },
                            { icon: ShieldCheck, label: "No commissions", note: "Trade directly, no middleman" },
                        ].map((f) => (
                            <div key={f.label} className="flex items-start gap-3">
                                <f.icon size={20} className="mt-0.5 text-amber-300" />
                                <div>
                                    <div className="text-white text-sm font-semibold">{f.label}</div>
                                    <div className="text-slate-400 text-xs mt-0.5">{f.note}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* MARQUEE BRAND STRIP */}
            <section className="bg-white border-y border-slate-200 overflow-hidden">
                <div className="py-5 relative">
                    <div className="tc-marquee text-slate-500 text-sm font-mono">
                        {[...facets.brands, ...facets.brands].map((b, i) => (
                            <span key={i} className="flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-amber-500" />
                                <span className="font-semibold text-[#0B1B3D]">{b}</span>
                                <span className="text-slate-400">— compatible toners in stock</span>
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* POPULAR MODELS */}
            <section className="tc-container py-16 lg:py-24">
                <div className="flex items-end justify-between mb-8">
                    <div>
                        <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Top Models</div>
                        <h2 className="tc-display text-3xl sm:text-4xl font-bold text-[#0B1B3D] mt-2">Most-requested toners on the platform</h2>
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
                            <div className="flex items-center justify-between">
                                <div className="tc-eyebrow">{g.brand}</div>
                                <span className="tc-badge tc-badge-blue">{g.supplier_count} suppliers</span>
                            </div>
                            <div className="mt-2 tc-display text-2xl font-bold text-[#0B1B3D]">{g.model_number}</div>
                            <div className="text-sm text-slate-600 mt-1 line-clamp-2">{g.title}</div>
                            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                                <div>
                                    <div className="tc-eyebrow">From</div>
                                    <div className="font-mono font-semibold text-[#0B1B3D] text-lg">₹{g.min_price.toLocaleString('en-IN')}</div>
                                </div>
                                <span className="text-amber-600 text-sm font-semibold flex items-center gap-1">
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
                        <h2 className="tc-display text-3xl sm:text-4xl font-bold text-[#0B1B3D] mt-2 max-w-md">Three steps from search to shipment.</h2>
                        <p className="text-slate-600 mt-4 max-w-md">Built for procurement managers, IT admins and resellers handling recurring bulk toner requirements.</p>
                    </div>
                    <ol className="space-y-6">
                        {[
                            { n: "01", t: "Search & compare", d: "Look up your toner model. See multiple suppliers side-by-side with price, city and stock." },
                            { n: "02", t: "Send order request", d: "Pick a supplier, fill quantity and delivery address. No payment — request is forwarded directly." },
                            { n: "03", t: "Track status", d: "Supplier accepts, ships with tracking, then marks completed. You watch every step." },
                        ].map((s) => (
                            <li key={s.n} className="flex gap-5">
                                <div className="font-mono text-3xl text-amber-500 font-bold leading-none pt-1">{s.n}</div>
                                <div>
                                    <div className="tc-display font-semibold text-[#0B1B3D] text-lg">{s.t}</div>
                                    <div className="text-slate-600 text-sm mt-1 max-w-sm">{s.d}</div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* SUPPLIER CTA */}
            <section className="tc-container py-16 lg:py-24">
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden grid lg:grid-cols-5">
                    <div className="lg:col-span-3 p-8 lg:p-12">
                        <div className="tc-eyebrow"><Tag className="inline mr-1" size={12} /> For suppliers</div>
                        <h3 className="tc-display text-2xl sm:text-3xl font-bold text-[#0B1B3D] mt-3">Are you a toner distributor?</h3>
                        <p className="text-slate-600 mt-3 max-w-lg">Get listed on TonersCart and reach hundreds of verified bulk buyers across India. Manage stock, pricing and incoming orders from one clean dashboard.</p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <Button className="btn-accent text-white" onClick={() => navigate("/register?role=supplier")} data-testid="cta-supplier-signup">
                                Apply as a supplier
                            </Button>
                            <Button variant="outline" onClick={() => navigate("/login")} data-testid="cta-supplier-login">
                                Supplier login
                            </Button>
                        </div>
                    </div>
                    <div className="lg:col-span-2 bg-[#0B1B3D] text-slate-100 p-8 lg:p-12 relative tc-grain">
                        <div className="tc-eyebrow text-amber-300">Live on the platform</div>
                        <div className="grid grid-cols-2 gap-6 mt-5">
                            {[
                                { k: "Cities", v: facets.cities.length || "5+" },
                                { k: "Brands", v: facets.brands.length || "6+" },
                                { k: "Toner SKUs", v: facets.models.length || "12+" },
                                { k: "Suppliers", v: "Multiple" },
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
