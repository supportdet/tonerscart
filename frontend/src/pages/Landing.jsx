import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Camera, ShieldCheck, MapPin } from "lucide-react";
import api from "../lib/api";
import TonerSearchInput from "../components/TonerSearchInput";
import TonerAnimation from "../components/TonerAnimation";
import TonerCartridge from "../components/TonerCartridge";
import { useCity } from "../context/CityContext";
import useReveal from "../hooks/useReveal";

// Brand text styled like logos — each gets its official color in the marquee
const MARQUEE_BRANDS = [
    { name: "HP",       color: "#0096D6" },
    { name: "Canon",    color: "#CC0000" },
    { name: "Brother",  color: "#003087" },
    { name: "Epson",    color: "#1A1A8C" },
    { name: "Ricoh",    color: "#00A0AF" },
    { name: "Xerox",    color: "#FF0000" },
    { name: "Kyocera",  color: "#1A1A1A" },
    { name: "Samsung",  color: "#1428A0" },
];

// Curated popular models — 4 different brands buyers search the most
const POPULAR_CHIPS = [
    { label: "HP 88A",       q: "88A" },
    { label: "Canon 337",    q: "337" },
    { label: "Brother TN-2365", q: "TN-2365" },
    { label: "Xerox 3020",   q: "3020" },
];

// Placeholder featured suppliers — real dealers will upload their logo via dashboard
const FEATURED_SUPPLIERS = [
    {
        id: "fs-1",
        name: "PrintZone Trading Co.",
        city: "Mumbai, Maharashtra",
        tagline: "Original HP & Canon — same-day dispatch.",
    },
    {
        id: "fs-2",
        name: "Toner Hub India",
        city: "Bangalore, Karnataka",
        tagline: "Bulk compatibles · 30-day replacement guarantee.",
    },
    {
        id: "fs-3",
        name: "Digital Office Solutions",
        city: "Delhi NCR",
        tagline: "Enterprise MPS contracts · pan-India delivery.",
    },
];

export default function Landing() {
    const navigate = useNavigate();
    const { city } = useCity();
    const [q, setQ] = useState("");
    const [facets, setFacets] = useState({ brands: [], cities: [], models: [] });
    const [grouped, setGrouped] = useState([]);
    const rootRef = useReveal([grouped.length, city]);

    useEffect(() => {
        api.get("/listings/facets")
            .then((r) => setFacets({ ...(r.data || {}), models: [] }))
            .catch(() => setFacets({ brands: [], cities: [], models: [] }));
    }, []);

    useEffect(() => {
        const params = {};
        if (city) params.city = city;
        api.get("/listings/grouped", { params })
            .then(async (r) => {
                let items = Array.isArray(r.data) ? r.data : [];
                if (items.length === 0) {
                    const all = await api.get("/listings/grouped");
                    items = Array.isArray(all.data) ? all.data : [];
                }
                setGrouped(items.slice(0, 8));
            })
            .catch(() => setGrouped([]));
    }, [city]);

    const submit = (override) => {
        const useQ = override?.query ?? q;
        const params = new URLSearchParams();
        if (useQ) params.set("q", useQ);
        navigate(`/search?${params.toString()}`);
    };

    return (
        <div ref={rootRef} data-testid="landing-page">
            {/* ============================== HERO ============================== */}
            <section className="tc-hero relative pt-8 pb-12 sm:pt-12 sm:pb-20 lg:pt-16 lg:pb-24">
                <div className="tc-hero-grid" />
                <div className="tc-container relative">
                    {/* Search bar — full-width with side gutters */}
                    <div className="flex items-center gap-3 mb-4 tc-fade-up">
                        <span className="tc-strip" />
                        <span className="text-[10px] sm:text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Now serving Pan India</span>
                    </div>
                    <div className="tc-search-shell w-full tc-fade-up tc-fade-up-1" data-testid="hero-search-form">
                        <TonerSearchInput value={q} onChange={setQ} onSubmit={submit} testId="hero-search-input" />
                        <button onClick={() => submit()} className="tc-search-go tc-search-go-yellow" data-testid="hero-search-submit">
                            Search <ArrowRight size={16} />
                        </button>
                    </div>

                    {/* Popular model chips */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 tc-fade-up tc-fade-up-2" data-testid="popular-chips">
                        <span className="text-[10px] sm:text-[11px] tracking-[0.22em] uppercase font-semibold text-white/45 mr-1">Popular:</span>
                        {POPULAR_CHIPS.map((c) => (
                            <button
                                key={c.q}
                                onClick={() => submit({ query: c.q })}
                                className="tc-chip"
                                data-testid={`popular-chip-${c.q}`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>

                    {/* Hero content split */}
                    <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center mt-10 lg:mt-16">
                        <div className="lg:col-span-7 order-2 lg:order-1">
                            <h1
                                className="text-white max-w-2xl tc-fade-up tc-fade-up-3"
                                style={{
                                    fontFamily: "'Montserrat', sans-serif",
                                    fontSize: "clamp(26px, 4vw, 52px)",
                                    lineHeight: 1.14,
                                    letterSpacing: "-0.025em",
                                    fontWeight: 300,
                                }}
                                data-testid="hero-headline"
                            >
                                India&apos;s <span className="text-[#F5C400]" style={{ fontWeight: 600 }}>#1</span> B2B marketplace for <span className="text-[#00B7C7]" style={{ fontWeight: 500 }}>printers</span> &amp; <span className="text-[#E6007E]" style={{ fontWeight: 500 }}>toners</span>
                            </h1>
                            <p className="text-white/65 max-w-xl mt-4 sm:mt-5 text-[14px] sm:text-[16px] tc-fade-up tc-fade-up-4" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="hero-subline">
                                Compare verified suppliers, real stock, better prices — no middlemen.
                            </p>
                        </div>

                        <div className="lg:col-span-5 order-1 lg:order-2 tc-fade-up tc-fade-up-2">
                            <TonerAnimation />
                        </div>
                    </div>
                </div>
            </section>

            {/* ============ BRANDS MARQUEE — colored logo-style text ============ */}
            <section className="tc-brand-marquee" data-testid="brand-marquee">
                <div className="tc-container flex items-center gap-6">
                    <span className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#F5C400] shrink-0">Brands on TonersCart</span>
                    <div className="tc-marquee-mask flex-1">
                        <div className="tc-marquee-track">
                            {[...MARQUEE_BRANDS, ...MARQUEE_BRANDS, ...MARQUEE_BRANDS].map((b, i) => (
                                <span
                                    key={`${b.name}-${i}`}
                                    className="tc-marquee-logo"
                                    style={{ color: b.color }}
                                    data-testid={`marquee-${b.name}`}
                                >
                                    {b.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ============ FEATURED SUPPLIERS ============ */}
            <section className="bg-[#0A0A0B] py-12 sm:py-16" data-testid="featured-suppliers">
                <div className="tc-container">
                    <div className="flex items-end justify-between mb-7 gap-4">
                        <div>
                            <div className="tc-eyebrow text-[#F5C400] inline-flex items-center gap-2">
                                <span className="tc-strip" /> Featured Suppliers
                            </div>
                            <h2 className="mt-3 text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(22px, 3.2vw, 38px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                                Trusted dealers, premium service.
                            </h2>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                        {FEATURED_SUPPLIERS.map((s, i) => (
                            <div
                                key={s.id}
                                className="tc-featured-card tc-reveal"
                                style={{ transitionDelay: `${i * 80}ms` }}
                                data-testid={`featured-card-${s.id}`}
                            >
                                {/* Logo placeholder — circular grey w/ camera icon */}
                                <div className="flex flex-col items-center">
                                    <div className="tc-featured-logo-ph" data-testid={`featured-logo-${s.id}`}>
                                        <Camera size={24} className="text-white/45" strokeWidth={1.6} />
                                    </div>
                                    <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-white/35 mt-2">
                                        Upload Logo
                                    </div>
                                </div>

                                <div className="mt-5 text-center">
                                    <div className="text-white text-[17px] font-semibold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                        {s.name}
                                    </div>
                                    <div className="mt-1 inline-flex items-center gap-1 text-[12px] text-white/55">
                                        <MapPin size={11} /> {s.city}
                                    </div>
                                    <p className="mt-3 text-[13px] text-white/70 leading-relaxed min-h-[40px]">
                                        {s.tagline}
                                    </p>
                                </div>

                                <button
                                    onClick={() => navigate("/search")}
                                    className="mt-5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F5C400] hover:bg-[#FFD119] text-[#0A0A0B] text-[13px] font-semibold py-2.5 transition"
                                    data-testid={`featured-cta-${s.id}`}
                                >
                                    View Listings <ArrowRight size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== STATS STRIP ====== */}
            <section className="bg-white border-b border-black/[0.06]">
                <div className="tc-container py-6 sm:py-8 grid grid-cols-3 gap-4 sm:gap-6" data-testid="stats-strip">
                    {[
                        { v: "250+", k: "Verified suppliers", testid: "stat-suppliers" },
                        { v: "15+",  k: "Cities served",      testid: "stat-cities" },
                        { v: "10+",  k: "Brands listed",      testid: "stat-brands" },
                    ].map((s, i) => (
                        <div key={s.k} className="tc-reveal text-center sm:text-left" style={{ transitionDelay: `${i * 80}ms` }} data-testid={s.testid}>
                            <div className="font-mono text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#0A0A0B] tracking-tight">{s.v}</div>
                            <div className="text-[10px] sm:text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1.5 sm:mt-2">{s.k}</div>
                        </div>
                    ))}
                </div>
                {/* Subtle shiny line — visual separator below stats */}
                <div className="tc-shiny-divider" aria-hidden="true" data-testid="stats-shiny-divider" />
            </section>

            {/* ============== TOP MODELS ============== */}
            <section className="tc-container py-12 sm:py-16 lg:py-20">
                <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
                    <div className="flex-1">
                        <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Top in {city}</div>
                        <h2 className="mt-3 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(22px, 3.2vw, 42px)", lineHeight: 1.14, letterSpacing: "-0.02em", fontWeight: 300 }}>
                            Popular brands and highly compatible models.
                        </h2>
                        <p className="tc-lead mt-2 sm:mt-3 max-w-xl text-[13px] sm:text-[15px]">Quick-pick the cartridges most commonly searched in your city. Tap any model to see every supplier&apos;s price.</p>
                    </div>
                    <button onClick={() => navigate("/search")} className="btn-primary text-[12.5px] sm:text-[13px] hidden sm:inline-flex items-center gap-1.5 shrink-0" data-testid="browse-all-btn">
                        Browse all <ArrowRight size={13} />
                    </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                    {grouped.map((g, idx) => (
                        <button
                            key={g.model_number}
                            onClick={() => navigate(`/search?q=${encodeURIComponent(g.model_number)}`)}
                            className="tc-product-card text-left tc-reveal"
                            style={{ transitionDelay: `${Math.min(idx * 60, 300)}ms` }}
                            data-testid={`model-card-${g.model_number.replace(/\s+/g, '-')}`}
                        >
                            <div className="tc-product-img">
                                <span className="tc-product-img-label">{g.brand}</span>
                                <TonerCartridge color={g.color || "Black"} brand={g.brand} model={g.model_number} />
                            </div>
                            <div className="p-3 sm:p-4 flex flex-col gap-1 flex-1">
                                <div className="font-mono text-[15px] sm:text-[18px] font-semibold text-[#0A0A0B] tracking-tight">{g.model_number}</div>
                                <div className="text-[11px] sm:text-[12.5px] text-[#1D1D1F] line-clamp-1">{g.supplier_count} sellers · {g.cities?.[0] || "Pan-India"}</div>
                                <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-black/[0.05] flex items-end justify-between">
                                    <div>
                                        <div className="text-[9px] sm:text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">From</div>
                                        <div className="font-mono text-[15px] sm:text-[18px] font-semibold text-[#0A0A0B]">₹{Math.round(g.min_price).toLocaleString('en-IN')}</div>
                                    </div>
                                    <span className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F5C400] text-[#0A0A0B]"><ArrowRight size={14} /></span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Mobile-only "browse all" */}
                <div className="mt-6 sm:hidden">
                    <button onClick={() => navigate("/search")} className="btn-primary w-full text-[13px] inline-flex items-center justify-center gap-1.5" data-testid="browse-all-btn-mobile">
                        Browse all toners <ArrowRight size={13} />
                    </button>
                </div>
            </section>

            {/* CTA STRIP */}
            <section className="tc-container pb-12 sm:pb-20">
                <div className="tc-card-flat p-6 sm:p-8 lg:p-10 grid md:grid-cols-2 gap-5 sm:gap-6 items-start md:items-center">
                    <div>
                        <div className="tc-eyebrow flex items-center gap-2"><Sparkles size={12} className="text-[#00B7C7]" /> AI-powered help</div>
                        <h3 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(20px, 2.4vw, 32px)", fontWeight: 300, letterSpacing: "-0.015em", lineHeight: 1.2 }}>Not sure which toner fits your printer?</h3>
                        <p className="tc-lead mt-2 text-[13px] sm:text-[15px]">Tap the chat bubble in the corner — TonerBot answers in seconds.</p>
                    </div>
                    <div className="flex md:justify-end gap-3 flex-wrap">
                        <button className="btn-cta flex-1 md:flex-none" onClick={() => navigate("/register?role=supplier")} data-testid="cta-supplier-signup">Apply as supplier</button>
                        <button className="btn-light flex-1 md:flex-none" onClick={() => navigate("/search")} data-testid="cta-browse">Browse toners</button>
                    </div>
                </div>
            </section>
        </div>
    );
}
