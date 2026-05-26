import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Printer as PrinterIcon, X, SlidersHorizontal, Search as SearchIcon, Sparkles } from "lucide-react";
import { useCity } from "../context/CityContext";
import WhatsAppEnquiry from "../components/WhatsAppEnquiry";

const CONDITIONS = [
    { id: "new", label: "Brand New" },
    { id: "refurbished", label: "Refurbished" },
];

const LABELS = {
    home: "Home", corporate: "Corporate", commercial: "Commercial", print_shop: "Print Shop",
    inkjet: "Inkjet", laser: "Laser", tank: "Tank", thermal: "Thermal", production: "Production",
    digital_press: "Digital Press", label_barcode: "Label / Barcode", ink: "Ink", other: "Other",
    color: "Color", bw: "B&W", both: "Color + B&W",
    print_only: "Print only", print_scan: "Print + Scan", all_in_one: "All-in-one", high_volume: "High volume",
};

function fmt(v) { return LABELS[v] || v; }

function PrinterCard({ p, onRequest }) {
    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden transition hover:shadow-xl group relative" data-testid={`printer-card-${p.id}`}>
            <div className="absolute top-3 right-3 z-10">
                <WhatsAppEnquiry brand={p.brand} model={p.model_number} />
            </div>
            <Link to={`/printer/${p.id}`} className="block bg-black/[0.03] aspect-[4/3] grid place-items-center hover:opacity-95" data-testid={`printer-link-${p.id}`}>
                {p.image_url ? (
                    <img src={p.image_url} alt={`${p.brand} ${p.model_number}`} className="w-full h-full object-contain" loading="lazy" />
                ) : (
                    <PrinterIcon size={42} className="text-[#D2D2D7]" />
                )}
            </Link>
            <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] tracking-[0.14em] uppercase font-semibold px-2 py-0.5 rounded-full ${p.condition === "new" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {p.condition === "new" ? "Brand New" : "Refurbished"}
                    </span>
                    <span className="text-[10px] text-[#86868B]">{fmt(p.usage_type)} · {fmt(p.category)}</span>
                </div>
                <div className="font-mono text-[14px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.brand} · {p.model_number}
                </div>
                <div className="text-[12px] text-[#6E6E73] flex items-center gap-2 flex-wrap">
                    <span>{fmt(p.color)}</span>
                    {p.paper_sizes?.length > 0 && <span>· {p.paper_sizes.slice(0, 3).join(", ")}</span>}
                    {p.connectivity?.length > 0 && <span>· {p.connectivity.slice(0, 2).join(" / ")}</span>}
                </div>
                <div className="text-[11px] text-[#86868B]">{p.supplier_name}{p.city ? ` · ${p.city}` : ""}</div>
                <div className="flex items-center justify-between mt-2">
                    <div className="font-mono text-[18px] font-bold text-[#0A0A0B]">₹{Number(p.price).toLocaleString("en-IN")}</div>
                    <Button size="sm" className="btn-cta" onClick={() => onRequest(p)} data-testid={`printer-request-${p.id}`}>Request</Button>
                </div>
                <div className="text-[10.5px] text-emerald-700 font-semibold">{p.stock} in stock</div>
            </div>
        </div>
    );
}

export default function Printers() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { city } = useCity();
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState(params.get("q") || "");
    const [condition, setCondition] = useState(params.get("condition") || "");
    const [showFilters, setShowFilters] = useState(false);

    const activeChips = useMemo(() => {
        const chips = [];
        for (const [k, v] of params.entries()) {
            if (["q"].includes(k)) continue;
            chips.push({ k, v });
        }
        return chips;
    }, [params]);

    const load = async () => {
        setLoading(true);
        try {
            const usp = new URLSearchParams(params);
            if (q.trim()) usp.set("q", q.trim()); else usp.delete("q");
            if (condition) usp.set("condition", condition); else usp.delete("condition");
            // City is opt-in — only applied when explicitly present in URL params (e.g. coming from the guided finder).
            const { data } = await api.get(`/printers?${usp.toString()}`);
            setListings(Array.isArray(data) ? data : []);
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [params, condition]);

    const removeChip = (k) => {
        const next = new URLSearchParams(params);
        next.delete(k);
        setParams(next, { replace: true });
    };

    const clearAll = () => { setParams({}, { replace: true }); setCondition(""); setQ(""); };

    const submitQ = (e) => { e.preventDefault(); load(); };

    const onRequest = (p) => {
        toast.success(`Request noted for ${p.brand} ${p.model_number} — ${p.supplier_name} will reach out. For now please call +91 9742270585.`);
    };

    return (
        <div className="relative pb-16" data-testid="printers-page">
            <div className="tc-hero relative pb-10">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-10 sm:pt-14">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Printers · India-wide</span>
                    </div>
                    <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                        Verified printers from trusted dealers
                    </h1>
                    <p className="text-white/65 mt-3 text-[14px] max-w-xl">Not sure what you need? <button onClick={() => navigate("/printers")} className="text-[#00B7C7] font-semibold inline-flex items-center gap-1 hover:underline" data-testid="printers-to-guide-link"><Sparkles size={12} /> Use our guided finder</button></p>

                    <form onSubmit={submitQ} className="mt-6 bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-2 flex items-center gap-2" data-testid="printers-search-form">
                        <SearchIcon size={16} className="text-white/70 ml-2" />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by brand or model — HP MFP 1138, Canon LBP, Epson L3250…" className="bg-transparent border-none text-white placeholder-white/50 h-10 focus-visible:ring-0" data-testid="printers-search-input" />
                        <button type="button" onClick={() => setShowFilters((s) => !s)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white text-[12.5px] hover:bg-white/20" data-testid="printers-toggle-filters">
                            <SlidersHorizontal size={13} /> Filters
                        </button>
                        <Button type="submit" className="btn-cta">Search</Button>
                    </form>

                    {showFilters && (
                        <div className="mt-3 bg-white/10 backdrop-blur-xl border border-white/15 rounded-xl p-3 text-white text-[13px]">
                            <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-white/60 mb-2">Condition</div>
                            <div className="flex gap-2">
                                {CONDITIONS.map((c) => (
                                    <button key={c.id} onClick={() => setCondition(condition === c.id ? "" : c.id)}
                                        className={`px-3 py-1.5 rounded-full border text-[12.5px] ${condition === c.id ? "bg-white text-[#0A0A0B] border-white" : "bg-transparent text-white border-white/30"}`}
                                        data-testid={`filter-condition-${c.id}`}>
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeChips.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {activeChips.map(({ k, v }) => (
                                <button key={k} onClick={() => removeChip(k)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white text-[11.5px] hover:bg-white/20 border border-white/15" data-testid={`chip-${k}`}>
                                    <span className="text-white/60">{k}:</span> {fmt(v)} <X size={11} />
                                </button>
                            ))}
                            <button onClick={clearAll} className="text-[11.5px] text-white/70 underline hover:text-white ml-1" data-testid="chips-clear-all">Clear all</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="tc-container py-8">
                {/* Sticky search bar — light, below navbar */}
                <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-2 pb-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-black/[0.04]" data-testid="printers-sticky-wrapper">
                    <form onSubmit={submitQ} className="tc-search-shell tc-search-light" data-testid="printers-sticky-search">
                        <div className="flex items-center gap-2 flex-1 px-3">
                            <SearchIcon size={16} className="text-[#86868B]" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search printers by brand or model…"
                                className="tc-search-input flex-1 bg-transparent border-none outline-none text-[14px] h-10"
                                data-testid="printers-sticky-search-input"
                            />
                        </div>
                        <button type="submit" className="tc-search-go" data-testid="printers-sticky-search-btn">Search</button>
                    </form>
                </div>

                <div className="flex items-end justify-between mb-4 mt-4">
                    <div>
                        <div className="tc-eyebrow">Results</div>
                        <h2 className="text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "22px", fontWeight: 500 }}>{listings.length} {listings.length === 1 ? "printer" : "printers"}</h2>
                    </div>
                </div>
                {loading ? (
                    <div className="text-[#6E6E73] py-8">Loading printers…</div>
                ) : listings.length === 0 ? (
                    <div className="bg-white border border-black/[0.06] rounded-2xl p-10 text-center">
                        <PrinterIcon size={40} className="mx-auto text-[#D2D2D7]" />
                        <div className="mt-3 font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>No printers match these filters yet</div>
                        <p className="text-[13px] text-[#6E6E73] mt-1">Try removing a filter or <button onClick={() => navigate("/printers")} className="text-[#00B7C7] font-semibold hover:underline" data-testid="printers-guide-cta">use the guided finder</button>.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="printers-grid">
                        {listings.map((p) => <PrinterCard key={p.id} p={p} onRequest={onRequest} />)}
                    </div>
                )}
            </div>
        </div>
    );
}
