import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import api from "../lib/api";
import TonerSearchInput from "../components/TonerSearchInput";
import TonerAnimation from "../components/TonerAnimation";
import { useCity } from "../context/CityContext";
import useReveal from "../hooks/useReveal";

const POPULAR = ["HP 88A", "HP 12A", "HP 78A", "Canon 925", "Brother TN-2365"];
const colorClass = (c) => ({ Cyan: "tc-pi-cyan", Magenta: "tc-pi-magenta", Yellow: "tc-pi-yellow", Black: "tc-pi-black" })[c] || "tc-pi-cyan";

export default function Landing() {
    const navigate = useNavigate();
    const { city } = useCity();
    const [q, setQ] = useState("");
    const [brand, setBrand] = useState("all");
    const [facets, setFacets] = useState({ brands: [], cities: [], models: [] });
    const [grouped, setGrouped] = useState([]);
    const rootRef = useReveal([grouped.length, city]);

    useEffect(() => {
        api.get("/products/facets").then((r) => setFacets(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        const params = {};
        if (city) params.city = city;
        api.get("/products/grouped", { params }).then((r) => setGrouped(r.data.slice(0, 8))).catch(() => {});
    }, [city]);

    const submit = (override) => {
        const useQ = override?.query ?? q;
        const params = new URLSearchParams();
        if (useQ) params.set("q", useQ);
        if (brand && brand !== "all") params.set("brand", brand);
        if (city) params.set("city", city);
        navigate(`/search?${params.toString()}`);
    };

    return (
        <div ref={rootRef} data-testid="landing-page">
            {/* ============================== HERO ============================== */}
            <section className="tc-hero relative -mt-[78px] pt-[110px] pb-20 lg:pt-[130px] lg:pb-24">
                <div className="tc-hero-grid" />
                <div className="tc-container relative grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
                    {/* Left: search + tagline */}
                    <div className="lg:col-span-7">
                        <div className="flex items-center gap-3 mb-5 tc-fade-up">
                            <span className="tc-strip" />
                            <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">
                                Now serving Bangalore
                            </span>
                        </div>

                        {/* SEARCH ON TOP */}
                        <div className="tc-search-shell tc-fade-up tc-fade-up-1" data-testid="hero-search-form" style={{ gridTemplateColumns: "1fr auto auto" }}>
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
                            <button onClick={() => submit()} className="tc-search-go" data-testid="hero-search-submit">
                                Search <ArrowRight size={16} />
                            </button>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 tc-fade-up tc-fade-up-2">
                            <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#F5C400]/90">Popular</span>
                            {POPULAR.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => { setQ(m); submit({ query: m }); }}
                                    className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[12px] text-white/85 backdrop-blur transition-colors"
                                    data-testid={`trending-${m.replace(/\s+/g, '-')}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>

                        {/* Tagline */}
                        <h1
                            className="text-white max-w-2xl mt-10 tc-fade-up tc-fade-up-3"
                            style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(34px, 4.6vw, 60px)", lineHeight: 1.08, letterSpacing: "-0.025em", fontWeight: 700 }}
                            data-testid="hero-headline"
                        >
                            India&apos;s marketplace for printer toners — <span className="text-[#00B7C7]">verified suppliers</span>, <span className="text-[#F5C400]">real stock</span>, <span className="text-[#E6007E]">better prices</span>.
                        </h1>

                        <p className="text-white/65 max-w-xl mt-5 text-[15px] sm:text-[16px] tc-fade-up tc-fade-up-4" style={{ fontFamily: "'Inter', sans-serif" }}>
                            Search any model, compare every supplier in {city}, and place an order request in minutes. No payment gateway, just direct B2B trade.
                        </p>
                    </div>

                    {/* Right: toner animation */}
                    <div className="lg:col-span-5 tc-fade-up tc-fade-up-2">
                        <TonerAnimation />
                    </div>
                </div>
            </section>

            {/* ====== STATS STRIP ====== */}
            <section className="bg-white border-b border-black/[0.06]">
                <div className="tc-container py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {[
                        { v: facets.models.length || "—", k: "Toner SKUs" },
                        { v: 25, k: "Verified suppliers" },
                        { v: facets.cities.length || "—", k: "Cities (soon)" },
                        { v: facets.brands.length || "—", k: "Brands listed" },
                    ].map((s, i) => (
                        <div key={i} className="tc-reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                            <div className="font-mono text-2xl sm:text-3xl font-semibold text-[#0A0A0B] tracking-tight">{s.v}</div>
                            <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-2">{s.k}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ============== TOP MODELS — clean compact product grid ============== */}
            <section className="tc-container py-16 lg:py-20">
                <div className="flex items-end justify-between mb-8">
                    <div>
                        <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Top in {city}</div>
                        <h2 className="tc-h1 text-[#0A0A0B] mt-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>Most-bought toners this month.</h2>
                        <p className="tc-lead mt-3 max-w-xl">Direct from approved suppliers in {city}. Compare every listing, then send an order request — no payment online.</p>
                    </div>
                    <button onClick={() => navigate("/search")} className="btn-primary text-[13px] hidden sm:inline-flex items-center gap-1.5" data-testid="browse-all-btn">
                        Browse all <ArrowRight size={13} />
                    </button>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {grouped.map((g, idx) => (
                        <button
                            key={g.model_number}
                            onClick={() => navigate(`/search?q=${encodeURIComponent(g.model_number)}&city=${encodeURIComponent(city)}`)}
                            className="tc-product-card text-left tc-reveal"
                            style={{ transitionDelay: `${Math.min(idx * 60, 300)}ms` }}
                            data-testid={`model-card-${g.model_number.replace(/\s+/g, '-')}`}
                        >
                            <div className={`tc-product-img ${colorClass(g.color)}`} />
                            <div className="p-4 flex flex-col gap-1 flex-1">
                                <div className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{g.brand}</div>
                                <div className="font-mono text-[18px] font-semibold text-[#0A0A0B] tracking-tight">{g.model_number}</div>
                                <div className="text-[12.5px] text-[#1D1D1F] line-clamp-1">{g.cities?.[0] || city} · {g.supplier_count} sellers</div>
                                <div className="mt-3 pt-3 border-t border-black/[0.05] flex items-end justify-between">
                                    <div>
                                        <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">From</div>
                                        <div className="font-mono text-[18px] font-semibold text-[#0A0A0B]">₹{Math.round(g.min_price).toLocaleString('en-IN')}</div>
                                    </div>
                                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#F5C400] text-[#0A0A0B]">
                                        <ArrowRight size={15} />
                                    </span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {!grouped.length && (
                    <div className="tc-card p-12 text-center">
                        <div className="tc-eyebrow">No listings yet for {city}</div>
                        <div className="tc-h3 text-[#0A0A0B] mt-2">Coming soon — try browsing all cities</div>
                        <button onClick={() => navigate("/search")} className="btn-cta mt-6">Browse all toners</button>
                    </div>
                )}
            </section>

            {/* CTA STRIP — compact */}
            <section className="tc-container pb-20">
                <div className="tc-card-flat p-8 lg:p-10 grid md:grid-cols-2 gap-6 items-center">
                    <div>
                        <div className="tc-eyebrow flex items-center gap-2"><Sparkles size={12} className="text-[#00B7C7]" /> AI-powered help</div>
                        <h3 className="tc-h2 text-[#0A0A0B] mt-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>Not sure which toner fits your printer?</h3>
                        <p className="tc-lead mt-2">Tap the chat bubble in the corner — TonerBot answers in seconds.</p>
                    </div>
                    <div className="flex md:justify-end gap-3">
                        <button className="btn-cta" onClick={() => navigate("/register?role=supplier")} data-testid="cta-supplier-signup">Apply as supplier</button>
                        <button className="btn-primary bg-white !text-[#0A0A0B] border border-black/10" onClick={() => navigate("/search")}>Browse toners</button>
                    </div>
                </div>
            </section>
        </div>
    );
}
