import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Truck, ShieldCheck, Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import api from "../lib/api";
import TonerSearchInput from "../components/TonerSearchInput";
import useReveal from "../hooks/useReveal";

const POPULAR = ["HP 88A", "HP 12A", "HP 78A", "Canon 925", "Brother TN-2365", "Samsung MLT-D101S"];
const colorClass = (c) => ({ Cyan: "tc-thumb-cyan", Magenta: "tc-thumb-magenta", Yellow: "tc-thumb-yellow", Black: "tc-thumb-black" })[c] || "tc-thumb-cyan";

export default function Landing() {
    const navigate = useNavigate();
    const [q, setQ] = useState("");
    const [brand, setBrand] = useState("all");
    const [city, setCity] = useState("all");
    const [facets, setFacets] = useState({ brands: [], cities: [], models: [] });
    const [grouped, setGrouped] = useState([]);
    const rootRef = useReveal([grouped.length]);

    useEffect(() => {
        api.get("/products/facets").then((r) => setFacets(r.data)).catch(() => {});
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
        <div ref={rootRef} data-testid="landing-page" className="-mt-16">
            {/* ============================== HERO ============================== */}
            <section className="tc-hero pt-28 pb-24 lg:pt-36 lg:pb-32">
                <div className="tc-hero-grid" />
                <div className="tc-container relative">
                    <div className="flex items-center gap-3 mb-7 tc-fade-up">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">
                            India&apos;s focused toner marketplace
                        </span>
                    </div>

                    <h1 className="tc-display text-white max-w-5xl tc-fade-up tc-fade-up-1" data-testid="hero-headline">
                        Source printer toners <span className="text-[#F5C400]">in&nbsp;bulk</span>,
                        <br className="hidden md:block" /> from <span className="text-[#00B7C7]">verified</span> suppliers across India.
                    </h1>

                    <p className="tc-lead text-white/70 max-w-2xl mt-7 tc-fade-up tc-fade-up-2">
                        Compare prices from multiple sellers, check live stock by city, and place order requests in minutes — no payment gateway, just direct B2B trade.
                    </p>

                    {/* Premium spotlight search */}
                    <div className="mt-12 tc-fade-up tc-fade-up-3" data-testid="hero-search-form">
                        <div className="tc-search-shell">
                            <TonerSearchInput value={q} onChange={setQ} onSubmit={submit} testId="hero-search-input" />
                            <Select value={brand} onValueChange={setBrand}>
                                <SelectTrigger className="tc-search-pill md:w-44" data-testid="hero-brand-select">
                                    <SelectValue placeholder="All brands" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All brands</SelectItem>
                                    {facets.brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={city} onValueChange={setCity}>
                                <SelectTrigger className="tc-search-pill md:w-44" data-testid="hero-city-select">
                                    <SelectValue placeholder="All cities" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All cities</SelectItem>
                                    {facets.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <button onClick={() => submit()} className="tc-search-go" data-testid="hero-search-submit">
                                Search <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Popular trail */}
                    <div className="mt-7 flex flex-wrap items-center gap-2 tc-fade-up tc-fade-up-4">
                        <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#F5C400]/90">Popular</span>
                        {POPULAR.map((m) => (
                            <button
                                key={m}
                                onClick={() => { setQ(m); submit({ query: m }); }}
                                className="px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[12px] text-white/85 backdrop-blur transition-colors"
                                data-testid={`trending-${m.replace(/\s+/g, '-')}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    {/* Trust strip */}
                    <div className="mt-14 grid sm:grid-cols-3 gap-8 max-w-3xl">
                        {[
                            { icon: BadgeCheck, label: "Verified suppliers", note: "Admin-approved sellers only", c: "#00B7C7" },
                            { icon: Truck, label: "Direct delivery", note: "Suppliers ship from your city", c: "#E6007E" },
                            { icon: ShieldCheck, label: "Zero commissions", note: "Trade directly, no middleman", c: "#F5C400" },
                        ].map((f, i) => (
                            <div key={f.label} className="flex items-start gap-3 tc-fade-up" style={{ animationDelay: `${360 + i * 80}ms` }}>
                                <f.icon size={18} className="mt-0.5" style={{ color: f.c }} />
                                <div>
                                    <div className="text-white text-[14px] font-semibold tracking-tight">{f.label}</div>
                                    <div className="text-white/55 text-[12px] mt-0.5">{f.note}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== STATS STRIP ====== */}
            <section className="bg-white border-b border-black/[0.06]">
                <div className="tc-container py-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {[
                        { v: facets.models.length || "—", k: "Toner SKUs" },
                        { v: 25, k: "Verified suppliers" },
                        { v: facets.cities.length || "—", k: "Cities covered" },
                        { v: facets.brands.length || "—", k: "Brands listed" },
                    ].map((s, i) => (
                        <div key={i} className="tc-reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                            <div className="font-mono text-3xl sm:text-4xl font-semibold text-[#0A0A0B] tracking-tight">{s.v}</div>
                            <div className="text-[12px] tracking-[0.18em] uppercase font-medium text-[#6E6E73] mt-2">{s.k}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ====================== STICKY SPLIT ====================== */}
            <section className="tc-container py-24 lg:py-32">
                <div className="tc-split">
                    {/* Left sticky */}
                    <div className="tc-split-left">
                        <div className="tc-eyebrow tc-reveal"><span className="tc-strip mr-2 align-middle" />Top models</div>
                        <h2 className="tc-h1 mt-4 text-[#0A0A0B] tc-reveal" style={{ transitionDelay: "60ms" }}>
                            The toners
                            <br /> India is buying.
                        </h2>
                        <p className="tc-lead mt-5 max-w-md tc-reveal" style={{ transitionDelay: "120ms" }}>
                            Each model lists every approved supplier carrying it — compare price, city and live stock side by side.
                        </p>
                        <div className="mt-8 flex items-center gap-3 tc-reveal" style={{ transitionDelay: "180ms" }}>
                            <button onClick={() => navigate("/search")} className="btn-primary text-[14px]" data-testid="browse-all-btn">
                                Browse all toners <ArrowRight size={14} className="inline ml-1.5 -mt-0.5" />
                            </button>
                            <span className="text-[12px] text-[#6E6E73] flex items-center gap-1.5">
                                <Sparkles size={13} className="text-[#00B7C7]" /> Smart search included
                            </span>
                        </div>

                        {/* CMYK orb visual */}
                        <div className="hidden lg:block mt-14 relative">
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="tc-orb mx-auto w-72 h-72" />
                            </div>
                            <div className="relative tc-glass rounded-3xl p-6 max-w-sm">
                                <div className="tc-eyebrow">Live preview</div>
                                <div className="font-mono text-2xl font-semibold mt-2 text-[#0A0A0B]">HP 88A</div>
                                <div className="text-[13px] text-[#6E6E73] mt-1">From ₹1,400 · 4 sellers · Delhi · Mumbai · Bangalore</div>
                                <div className="mt-4 flex items-center gap-2">
                                    <span className="tc-badge tc-badge-cyan">In stock</span>
                                    <span className="tc-badge tc-badge-yellow">Best seller</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right scrollable */}
                    <div className="space-y-5">
                        {grouped.map((g, idx) => (
                            <button
                                key={g.model_number}
                                onClick={() => navigate(`/search?q=${encodeURIComponent(g.model_number)}`)}
                                className="tc-card p-6 text-left w-full block tc-reveal"
                                style={{ transitionDelay: `${idx * 70}ms` }}
                                data-testid={`model-card-${g.model_number.replace(/\s+/g, '-')}`}
                            >
                                <div className="flex items-stretch gap-5">
                                    <div className={`tc-thumb ${colorClass(g.color)} w-32 sm:w-44 shrink-0`} />
                                    <div className="flex-1 min-w-0 flex flex-col">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">{g.brand}</div>
                                            <span className="tc-badge tc-badge-cyan">{g.supplier_count} sellers</span>
                                        </div>
                                        <div className="font-mono text-[22px] sm:text-[26px] font-semibold text-[#0A0A0B] mt-1 tracking-tight">{g.model_number}</div>
                                        <div className="text-[14px] text-[#1D1D1F] mt-1 line-clamp-2">{g.title}</div>
                                        <div className="mt-auto pt-4 flex items-end justify-between border-t border-black/[0.06]">
                                            <div>
                                                <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">From</div>
                                                <div className="font-mono text-[20px] font-semibold text-[#0A0A0B] mt-0.5">₹{Math.round(g.min_price).toLocaleString('en-IN')}</div>
                                            </div>
                                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0A0A0B] bg-[#F5C400] rounded-full px-4 py-2">
                                                Compare <ArrowRight size={13} />
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====================== HOW IT WORKS ====================== */}
            <section className="bg-[#0A0A0B] text-white">
                <div className="tc-container py-24 lg:py-32 grid lg:grid-cols-2 gap-16 items-start">
                    <div>
                        <div className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60 tc-reveal"><span className="tc-strip mr-2 align-middle" />How it works</div>
                        <h2 className="tc-h1 mt-4 max-w-md tc-reveal" style={{ transitionDelay: "60ms" }}>
                            Three steps from <span className="text-[#00B7C7]">search</span> to <span className="text-[#F5C400]">shipment</span>.
                        </h2>
                        <p className="text-white/65 mt-5 max-w-md text-[17px] leading-relaxed tc-reveal" style={{ transitionDelay: "120ms" }}>
                            Built for procurement managers, IT admins and resellers handling recurring bulk toner requirements.
                        </p>
                    </div>
                    <ol className="space-y-8">
                        {[
                            { n: "01", t: "Search & compare", d: "Look up your toner model. See multiple suppliers side-by-side with price, city and stock.", c: "#00B7C7" },
                            { n: "02", t: "Send order request", d: "Pick a supplier, fill quantity and delivery address. No payment — request is forwarded directly.", c: "#E6007E" },
                            { n: "03", t: "Track status", d: "Supplier accepts, ships with tracking, then marks completed. Watch every step.", c: "#F5C400" },
                        ].map((s, i) => (
                            <li key={s.n} className="flex gap-6 tc-reveal" style={{ transitionDelay: `${i * 100}ms` }}>
                                <div className="font-mono text-[44px] font-semibold leading-none pt-1" style={{ color: s.c }}>{s.n}</div>
                                <div>
                                    <div className="font-semibold text-white text-[20px] tracking-tight">{s.t}</div>
                                    <div className="text-white/60 text-[15px] mt-1.5 max-w-md leading-relaxed">{s.d}</div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ====================== SUPPLIER CTA ====================== */}
            <section className="tc-container py-24 lg:py-32">
                <div className="tc-card-flat p-10 lg:p-16 grid lg:grid-cols-2 gap-12 items-center">
                    <div className="tc-reveal">
                        <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />For suppliers</div>
                        <h3 className="tc-h2 text-[#0A0A0B] mt-4">Are you a toner distributor?</h3>
                        <p className="tc-lead mt-4 max-w-lg">
                            List your inventory on TonersCart and reach hundreds of verified bulk buyers across India. Manage stock, pricing and incoming orders from one clean dashboard.
                        </p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <button className="btn-cta" onClick={() => navigate("/register?role=supplier")} data-testid="cta-supplier-signup">
                                Apply as a supplier
                            </button>
                            <button className="btn-primary bg-white !text-[#0A0A0B] border border-black/10" onClick={() => navigate("/login")} data-testid="cta-supplier-login">
                                Supplier login
                            </button>
                        </div>
                    </div>
                    <div className="tc-reveal" style={{ transitionDelay: "120ms" }}>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { k: "Cities", v: facets.cities.length || "—", c: "var(--tc-cyan)" },
                                { k: "Brands", v: facets.brands.length || "—", c: "var(--tc-magenta)" },
                                { k: "Toner SKUs", v: facets.models.length || "—", c: "var(--tc-yellow)" },
                                { k: "Suppliers", v: 25, c: "var(--tc-ink)" },
                            ].map((s) => (
                                <div key={s.k} className="tc-glass rounded-2xl p-5">
                                    <div className="w-1.5 h-4 rounded-full mb-3" style={{ background: s.c }} />
                                    <div className="font-mono text-3xl font-semibold text-[#0A0A0B] tracking-tight">{s.v}</div>
                                    <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1.5">{s.k}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
