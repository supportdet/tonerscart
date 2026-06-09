import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Camera, ShieldCheck, MapPin, Search } from "lucide-react";
import api from "../lib/api";
import TonerSearchInput from "../components/TonerSearchInput";
import TonerAnimation from "../components/TonerAnimation";
import TonerCartridge from "../components/TonerCartridge";
import VerifiedBadge from "../components/VerifiedBadge";
import { useCity } from "../context/CityContext";
import useReveal from "../hooks/useReveal";
import PageMeta from "../components/PageMeta";
import { Skeleton } from "../components/ui/skeleton";
import { categoryRoute } from "../lib/categoryRoute";

// Hardcoded defaults removed — both marquee brands and popular chips
// now come from /api/config/<key>. The backend ships sane defaults so the
// frontend never needs its own fallback array.

// Brand → corporate colour for the marquee pills. Config entries may be plain
// strings (e.g. "HP") or objects ({name, color}); we normalise both shapes so
// the pill always shows the readable brand name in its brand colour.
const BRAND_COLORS = {
    hp: "#0096D6", canon: "#BE0000", epson: "#003399", brother: "#0067B1",
    ricoh: "#D7000F", xerox: "#000000", kyocera: "#D80C24", samsung: "#1428A0",
    "konica minolta": "#0096D6", pantum: "#00A0E9", lexmark: "#00A94F",
    sharp: "#C20E1A", riso: "#ED1C24", oki: "#006341",
};

const normalizeBrands = (raw) => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((b) => {
            const name = (typeof b === "string" ? b : b?.name || "").trim();
            if (!name) return null;
            const color = (typeof b === "object" && b?.color) || BRAND_COLORS[name.toLowerCase()] || "#0A0A0B";
            return { name, color };
        })
        .filter(Boolean);
};

export default function Landing() {
    const navigate = useNavigate();
    const { city } = useCity();
    const [q, setQ] = useState("");
    const [facets, setFacets] = useState({ brands: [], cities: [], models: [] });
    const [grouped, setGrouped] = useState([]);
    const [groupedLoading, setGroupedLoading] = useState(true);
    const [featured, setFeatured] = useState([]);
    const [marqueeBrands, setMarqueeBrands] = useState([]);
    const [popularChips, setPopularChips] = useState([]);
    const [publicStats, setPublicStats] = useState(null);
    const rootRef = useReveal([grouped.length, city]);

    useEffect(() => {
        api.get("/listings/facets")
            .then((r) => setFacets({ ...(r.data || {}), models: [] }))
            .catch(() => setFacets({ brands: [], cities: [], models: [] }));
    }, []);

    useEffect(() => {
        let cancelled = false;
        // Featured ad must be resilient: retry transient failures and never
        // collapse an already-rendered list to empty on a network blip.
        const loadFeatured = async (attempt = 0) => {
            try {
                const r = await api.get("/featured/suppliers", { params: { limit: 6 } });
                if (!cancelled) setFeatured(Array.isArray(r.data) ? r.data : []);
            } catch {
                if (!cancelled && attempt < 2) setTimeout(() => loadFeatured(attempt + 1), 800);
            }
        };
        loadFeatured();
        api.get("/config/marquee_brands")
            .then((r) => setMarqueeBrands(normalizeBrands(r.data?.value)))
            .catch(() => setMarqueeBrands([]));
        api.get("/config/popular_chips")
            .then((r) => setPopularChips(Array.isArray(r.data?.value) ? r.data.value : []))
            .catch(() => setPopularChips([]));
        api.get("/stats/public")
            .then((r) => setPublicStats(r.data || null))
            .catch(() => setPublicStats(null));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        setGroupedLoading(true);
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
            .catch(() => setGrouped([]))
            .finally(() => setGroupedLoading(false));
    }, [city]);

    const submit = (override) => {
        const useQ = override?.query ?? q;
        const route = categoryRoute(useQ);
        if (route) { navigate(route); return; }
        const params = new URLSearchParams();
        if (useQ) params.set("q", useQ);
        navigate(`/search?${params.toString()}`);
    };

    const ldOrg = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WholesaleStore",
                "name": "TonersCart",
                "legalName": "TonersCart Private Limited",
                "url": "https://www.tonerscart.com",
                "logo": "https://www.tonerscart.com/TONERSCART-bg.png",
                "image": "https://www.tonerscart.com/TONERSCART-bg.png",
                "email": "support@tonerscart.com",
                "description": "India's marketplace for printers, toners and MFDs — verified dealers, GST invoices, pan-India delivery",
                "areaServed": "IN",
                "sameAs": ["https://www.linkedin.com/company/tonerscart"],
            },
            {
                "@type": "WebSite",
                "url": "https://www.tonerscart.com",
                "name": "TonersCart",
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": "https://www.tonerscart.com/search?q={search_term_string}",
                    "query-input": "required name=search_term_string",
                },
            },
        ],
    };

    return (
        <div ref={rootRef} data-testid="landing-page">
            <PageMeta
                title={`TonersCart — India's Marketplace for Printers, Toners & MFDs | Buy & Sell Online${city ? ` · ${city}` : ""}`}
                description={city
                    ? `Buy HP, Canon, Brother toner cartridges and printers from verified suppliers in ${city}. Compare prices, real stock, same-day dispatch available.`
                    : "India's trusted marketplace to buy printers, toners and supplies online — for offices and homes. HP, Canon, Brother, Xerox toners from verified suppliers in Bangalore, Mumbai, Delhi, Chennai, Hyderabad and across India."}
                keywords="buy toner cartridges online india, printer toner suppliers bangalore, printer marketplace india, buy hp toner online, canon toner dealers india, compatible toner cartridges, original toner suppliers"
                path="/"
                jsonLd={ldOrg}
            />
            {/* ============================== HERO ============================== */}
            <section className="tc-hero tc-hero-home relative pt-8 pb-12 sm:pt-12 sm:pb-20 lg:pt-16 lg:pb-24">
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
                            <Search size={18} className="sm:hidden" />
                            <span className="tc-search-go-label hidden sm:inline-flex items-center gap-1.5">Search <ArrowRight size={16} /></span>
                        </button>
                    </div>

                    {/* Popular model chips */}
                    {popularChips.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 tc-fade-up tc-fade-up-2" data-testid="popular-chips">
                            <span className="text-[10px] sm:text-[11px] tracking-[0.22em] uppercase font-semibold text-white/45 mr-1">Popular:</span>
                            {popularChips.map((c) => (
                                <button
                                    key={c.query}
                                    onClick={() => submit({ query: c.query })}
                                    className="tc-chip"
                                    data-testid={`popular-chip-${c.query}`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    )}

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
                                India&apos;s <span className="text-[#F5C400]" style={{ fontWeight: 600 }}>digital marketplace</span> for <span className="text-[#00B7C7]" style={{ fontWeight: 500 }}>printers</span>, <span className="text-[#E6007E]" style={{ fontWeight: 500 }}>toners</span> &amp; MFDs
                            </h1>
                            <p className="text-white/65 max-w-xl mt-4 sm:mt-5 text-[14px] sm:text-[16px] tc-fade-up tc-fade-up-4" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="hero-subline">
                                Compare verified suppliers, real stock, better prices.
                            </p>
                        </div>

                        <div className="lg:col-span-5 order-1 lg:order-2 tc-fade-up tc-fade-up-2">
                            <TonerAnimation />
                        </div>
                    </div>
                </div>
            </section>

            {/* ============ BRANDS MARQUEE — colored logo-style text ============ */}
            {marqueeBrands.length > 0 && (
                <section className="tc-brand-marquee" data-testid="brand-marquee">
                    <div className="tc-container flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                        <span className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#F5C400] shrink-0">Brands on TonersCart</span>
                        <div className="tc-marquee-mask w-full sm:flex-1 min-w-0">
                            <div className="tc-marquee-track">
                                {[...marqueeBrands, ...marqueeBrands, ...marqueeBrands].map((b, i) => (
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
            )}

            {/* ============ FEATURED SUPPLIERS ============ */}
            {featured.length > 0 && (
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
                        {featured.map((s) => ({
                            id: s.id,
                            name: s.business_name || "Verified Supplier",
                            city: [s.city, s.state].filter(Boolean).join(", "),
                            tagline: s.tagline || (s.seller_types || []).slice(0, 3).join(" · ") || "Verified TonersCart supplier",
                            logo_url: s.logo_url || null,
                            featured_image_url: s.featured_image_url || null,
                        })).map((s, i) => (
                            <div
                                key={s.id}
                                className="tc-featured-card tc-reveal"
                                style={{ transitionDelay: `${i * 80}ms` }}
                                data-testid={`featured-card-${s.id}`}
                            >
                                {/* Banner image — wide 16:9 rectangle from the dealer's application.
                                    onError degrades gracefully (banner → logo → placeholder) so the
                                    ad never renders as a blank white box if a signed URL fails. */}
                                <div className="tc-featured-banner" data-testid={`featured-logo-${s.id}`}>
                                    {(s.featured_image_url || s.logo_url) ? (
                                        <>
                                            <img
                                                src={s.featured_image_url || s.logo_url}
                                                alt={s.name}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                                onError={(e) => {
                                                    const img = e.currentTarget;
                                                    if (s.logo_url && img.src !== s.logo_url) { img.src = s.logo_url; return; }
                                                    img.style.display = "none";
                                                    if (img.nextElementSibling) img.nextElementSibling.style.display = "grid";
                                                }}
                                            />
                                            <div className="w-full h-full place-items-center" style={{ display: "none" }}>
                                                <Camera size={30} className="text-white/40" strokeWidth={1.6} />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full h-full grid place-items-center">
                                            <Camera size={30} className="text-white/40" strokeWidth={1.6} />
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 text-center">
                                    <div className="inline-flex items-center gap-1.5 text-white text-[17px] font-semibold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                        {s.name}
                                        <VerifiedBadge compact className="[&_svg]:text-emerald-400" />
                                    </div>
                                    <div className="mt-1 inline-flex items-center gap-1 text-[12px] text-white/55">
                                        <MapPin size={11} /> {s.city || "Pan-India"}
                                    </div>
                                    <p className="mt-3 text-[13px] text-white/70 leading-relaxed min-h-[40px]">
                                        {s.tagline}
                                    </p>
                                </div>

                                <button
                                    onClick={() => navigate(`/store/${s.id}`)}
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
            )}

            {/* "Get featured" CTA — always visible, public-facing */}
            <section className="bg-[#0A0A0B] pb-12 sm:pb-16">
                <div className="tc-container">
                    <div
                        className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 rounded-2xl bg-gradient-to-r from-[#1A1B1F] via-[#23252B] to-[#1A1B1F] border border-white/10 p-5 sm:px-6 sm:py-5"
                        data-testid="get-featured-banner"
                    >
                        <div className="flex items-start sm:items-center gap-3">
                            <Sparkles size={18} className="text-[#F5C400] shrink-0 mt-0.5 sm:mt-0" />
                            <div>
                                <div className="text-white text-[14.5px] sm:text-[15.5px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                    Get your brand featured here
                                </div>
                                <div className="text-white/65 text-[12.5px] mt-0.5">Reach thousands of buyers across India.</div>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate("/get-featured")}
                            className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full bg-[#F5C400] hover:bg-[#FFD119] text-[#0A0A0B] text-[13.5px] font-semibold transition shrink-0"
                            data-testid="get-featured-apply-btn"
                        >
                            Apply now <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </section>

            {/* ====== STATS STRIP — Montserrat light, dot-separated, justified ====== */}
            <section className="bg-white border-b border-black/[0.06]">
                <div
                    className="tc-container py-6 sm:py-8 flex items-center justify-between gap-2 sm:gap-4"
                    data-testid="stats-strip"
                >
                    {[
                        { v: "#1",   k: "Marketplace", testid: "stat-marketplace" },
                        { v: "500+", k: "Dealers",     testid: "stat-suppliers" },
                        { v: "10+",  k: "Cities",      testid: "stat-cities" },
                        { v: "15+",  k: "Brands",      testid: "stat-brands" },
                    ].map((s, i, arr) => (
                        <React.Fragment key={s.k}>
                            <div className="tc-reveal text-center flex-1 min-w-0" style={{ transitionDelay: `${i * 80}ms` }} data-testid={s.testid}>
                                <div
                                    className="text-[#0A0A0B]"
                                    style={{
                                        fontFamily: "'Montserrat', sans-serif",
                                        fontWeight: 300,
                                        letterSpacing: "-0.02em",
                                        fontSize: "clamp(24px, 4.4vw, 40px)",
                                        lineHeight: 1.05,
                                    }}
                                >
                                    {s.v}
                                </div>
                                <div className="text-[9.5px] sm:text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1.5 sm:mt-2">
                                    {s.k}
                                </div>
                            </div>
                            {i < arr.length - 1 && (
                                <span className="tc-stat-dot" aria-hidden="true">•</span>
                            )}
                        </React.Fragment>
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
                    {groupedLoading && grouped.length === 0 && (
                        [0, 1, 2, 3].map((i) => (
                            <div key={`s-${i}`} className="tc-product-card" data-testid={`model-card-skeleton-${i}`}>
                                <Skeleton className="aspect-square w-full" />
                                <div className="p-3 sm:p-4 space-y-2">
                                    <Skeleton className="h-4 w-2/3" />
                                    <Skeleton className="h-3 w-1/2" />
                                    <div className="pt-3 border-t border-black/[0.05] flex items-end justify-between">
                                        <div className="space-y-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-4 w-16" /></div>
                                        <Skeleton className="h-8 w-8 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
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
                {!groupedLoading && grouped.length === 0 && (
                    <div className="text-center py-10 tc-card-flat" data-testid="popular-empty">
                        <div className="text-[14px] font-semibold text-[#0A0A0B] mb-1">New listings coming soon</div>
                        <div className="text-[12.5px] text-[#6E6E73]">Verified dealers are onboarding right now. Check back in a few hours.</div>
                    </div>
                )}

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
