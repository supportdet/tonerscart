import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ChevronLeft, ArrowRight, Printer } from "lucide-react";
import { useCity } from "../context/CityContext";

// ============================================================
// Question catalog
// ============================================================

const USAGES = [
    { id: "home", label: "Home", desc: "For household / personal use" },
    { id: "corporate", label: "Corporate / Office", desc: "Shared by a team or department" },
    { id: "commercial", label: "Commercial / Industrial", desc: "Factory, warehouse, retail chain" },
    { id: "print_shop", label: "Print Shop / Copy Center", desc: "Commercial printing business" },
];

const CATEGORY_BY_USAGE = {
    home: [
        { id: "inkjet", label: "Inkjet" }, { id: "laser", label: "Laser" },
        { id: "tank", label: "Tank" }, { id: "thermal", label: "Thermal" },
        { id: "other", label: "Not sure" },
    ],
    corporate: [
        { id: "laser", label: "Laser" }, { id: "tank", label: "Tank" },
        { id: "inkjet", label: "Inkjet" }, { id: "other", label: "Not sure" },
    ],
    commercial: [
        { id: "laser", label: "Laser" }, { id: "ink", label: "Ink" },
        { id: "production", label: "Production (light commercial)" },
        { id: "label_barcode", label: "Label / Barcode" },
        { id: "other", label: "Not sure" },
    ],
    print_shop: [
        { id: "laser", label: "Laser" }, { id: "inkjet", label: "Inkjet" },
        { id: "production", label: "Production" },
        { id: "digital_press", label: "Digital Press" },
        { id: "other", label: "Not sure" },
    ],
};

const PAPER_SIZES = ["A4", "A3", "SRA3", "A2", "A1", "Roll"];

const COLORS = [
    { id: "color", label: "Color" },
    { id: "bw", label: "Black & White" },
    { id: "both", label: "Both" },
];

const FUNCTIONS = [
    { id: "print_only", label: "Print only" },
    { id: "print_scan", label: "Print + Scan" },
    { id: "all_in_one", label: "All-in-one (Print + Copy + Scan)" },
    { id: "high_volume", label: "High-volume bulk printing" },
];

const VOLUMES_BY_USAGE = {
    home: [
        { id: "1-100", label: "1 – 100 pages", min: 1, max: 100 },
        { id: "100-1000", label: "100 – 1,000 pages", min: 100, max: 1000 },
        { id: "1000-3000", label: "1,000 – 3,000 pages", min: 1000, max: 3000 },
    ],
    corporate: [
        { id: "500-3000", label: "500 – 3,000 pages", min: 500, max: 3000 },
        { id: "3000-10000", label: "3,000 – 10,000 pages", min: 3000, max: 10000 },
        { id: "10000-25000", label: "10,000 – 25,000 pages", min: 10000, max: 25000 },
    ],
    commercial: [
        { id: "10000-50000", label: "10,000 – 50,000 pages", min: 10000, max: 50000 },
        { id: "50000-100000", label: "50,000 – 100,000 pages", min: 50000, max: 100000 },
        { id: "100000+", label: "100,000+ pages", min: 100000, max: 10000000 },
    ],
    print_shop: [
        { id: "10000-50000", label: "10,000 – 50,000 pages", min: 10000, max: 50000 },
        { id: "50000-100000", label: "50,000 – 100,000 pages", min: 50000, max: 100000 },
        { id: "100000-500000", label: "100,000 – 500,000 pages", min: 100000, max: 500000 },
        { id: "500000+", label: "500,000+ pages", min: 500000, max: 10000000 },
    ],
};

const CONNECTIVITY = ["Wi-Fi", "USB", "Bluetooth", "Ethernet"];

const FEATURES_BY_USAGE = {
    home: ["Duplex", "Mobile printing", "High resolution", "Voice assistant"],
    corporate: ["Duplex", "Secure printing", "Cloud printing", "Department usage tracking"],
    commercial: ["Duplex", "Heavy duty cycles", "Oversized media printing", "Print management / reporting software"],
    print_shop: ["Heavy duty", "Large format", "Finishing options", "Advanced color management"],
};

const COUNTS = [
    { id: "1", label: "1", num: 1 },
    { id: "1-5", label: "1 – 5", num: 5 },
    { id: "5-10", label: "5 – 10", num: 10 },
    { id: "10-50", label: "10 – 50", num: 50 },
    { id: "50-100", label: "50 – 100", num: 100 },
    { id: "100+", label: "100+", num: 999 },
];

// ============================================================
// Step config — computed from current answers
// ============================================================

function buildSteps(a) {
    const steps = [
        { key: "usage", type: "single", title: "Where will the printer be used?",
          options: USAGES.map((o) => ({ id: o.id, label: o.label, desc: o.desc })) },
    ];
    if (a.usage) {
        steps.push({ key: "category", type: "single", title: "What type of printer do you need?",
            options: CATEGORY_BY_USAGE[a.usage] });
    }
    const needsPaper = a.usage === "commercial" || a.usage === "print_shop";
    if (needsPaper && a.category) {
        steps.push({ key: "paper_sizes", type: "multi", title: "What print sizes do you need?",
            options: PAPER_SIZES.map((p) => ({ id: p, label: p })) });
    }
    if ((needsPaper ? a.paper_sizes && a.paper_sizes.length : a.category)) {
        steps.push({ key: "color", type: "single", title: "Color preference",
            options: COLORS });
    }
    if (a.color) {
        steps.push({ key: "function", type: "single", title: "What functions do you need?",
            options: FUNCTIONS });
    }
    if (a.function) {
        steps.push({ key: "volume", type: "single", title: "Estimated monthly print volume",
            options: VOLUMES_BY_USAGE[a.usage] });
    }
    if (a.volume) {
        steps.push({ key: "connectivity", type: "multi", title: "Preferred connectivity",
            options: CONNECTIVITY.map((c) => ({ id: c, label: c })) });
    }
    if (a.connectivity && a.connectivity.length >= 0 /* next btn required */) {
        steps.push({ key: "features", type: "multi", title: "Special features",
            options: (FEATURES_BY_USAGE[a.usage] || []).map((f) => ({ id: f, label: f })) });
    }
    if (a.features !== undefined && a.connectivity && a.connectivity.length >= 0) {
        steps.push({ key: "count", type: "single", title: "How many printers do you need?",
            options: COUNTS });
    }
    return steps;
}

// ============================================================
// Component
// ============================================================

export default function MPS() {
    const navigate = useNavigate();
    const { city } = useCity();
    const [idx, setIdx] = useState(0);
    const [answers, setAnswers] = useState({});
    const [dir, setDir] = useState("fwd"); // transition direction

    const steps = useMemo(() => buildSteps(answers), [answers]);
    const step = steps[Math.min(idx, steps.length - 1)] || steps[0];
    const total = steps.length;
    const progress = Math.round(((idx + 1) / Math.max(total, 1)) * 100);

    const advance = (nextAnswers) => {
        // If this was the final "count" step, route.
        if (step.key === "count") {
            const sel = COUNTS.find((c) => c.id === nextAnswers.count);
            if (sel && sel.num > 10) {
                navigate("/mps/contact", { state: { selections: nextAnswers } });
                return;
            }
            // ≤10 → Printers page with filters
            const params = new URLSearchParams();
            if (nextAnswers.usage) params.set("usage_type", nextAnswers.usage);
            if (nextAnswers.category && nextAnswers.category !== "other") params.set("category", nextAnswers.category);
            if (nextAnswers.color) params.set("color", nextAnswers.color);
            if (nextAnswers.function) params.set("function", nextAnswers.function);
            if (nextAnswers.paper_sizes?.length) params.set("paper_size", nextAnswers.paper_sizes[0]);
            if (nextAnswers.connectivity?.length) params.set("connectivity", nextAnswers.connectivity[0]);
            if (nextAnswers.features?.length) params.set("feature", nextAnswers.features[0]);
            const vol = VOLUMES_BY_USAGE[nextAnswers.usage]?.find((v) => v.id === nextAnswers.volume);
            if (vol) {
                params.set("min_volume", String(vol.min));
                params.set("max_volume", String(vol.max));
            }
            if (city) params.set("city", city);
            navigate(`/printers?${params.toString()}`);
            return;
        }
        setDir("fwd");
        // small timeout so transition out can run before the steps rebuild
        setTimeout(() => setIdx((i) => i + 1), 160);
    };

    const pickSingle = (id) => {
        const next = { ...answers, [step.key]: id };
        // Reset downstream answers when a branch-affecting key changes
        if (step.key === "usage") {
            delete next.category; delete next.paper_sizes; delete next.color;
            delete next.function; delete next.volume; delete next.connectivity;
            delete next.features; delete next.count;
        }
        if (step.key === "category") {
            delete next.paper_sizes; delete next.color; delete next.function;
            delete next.volume; delete next.connectivity; delete next.features; delete next.count;
        }
        setAnswers(next);
        advance(next);
    };

    const toggleMulti = (id) => {
        const cur = answers[step.key] || [];
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        setAnswers({ ...answers, [step.key]: next });
    };

    const nextMulti = () => {
        const cur = answers[step.key] || [];
        if (step.key === "paper_sizes" && cur.length === 0) return;
        if (step.key === "connectivity" && cur.length === 0) return;
        // features can be empty
        const next = { ...answers, [step.key]: cur };
        if (step.key === "features" && next.features === undefined) next.features = [];
        setAnswers(next);
        advance(next);
    };

    const back = () => {
        if (idx === 0) { navigate(-1); return; }
        setDir("back");
        setTimeout(() => setIdx((i) => Math.max(0, i - 1)), 160);
    };

    return (
        <div className="tc-hero relative pb-20" data-testid="mps-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14 max-w-3xl">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Managed Print Services</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Find the right printer setup
                </h1>
                <p className="text-white/65 mt-3 text-[14px] max-w-xl">A few quick questions so we can show you the printers that actually fit your workflow. Your answers stay private.</p>

                {/* Progress */}
                <div className="mt-6 flex items-center gap-3">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#00B7C7] transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="text-[11px] text-white/60 font-mono tabular-nums" data-testid="mps-progress">{Math.min(idx + 1, total)} / {total}</div>
                </div>

                {/* Step card */}
                <div key={idx} className={`mt-6 bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-6 sm:p-8 text-[#0A0A0B] transition-all duration-300 ${dir === "back" ? "tc-step-back" : "tc-step-fwd"}`} data-testid={`mps-step-${step.key}`}>
                    <h2 className="text-[#0A0A0B] mb-5" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "22px", fontWeight: 500, letterSpacing: "-0.01em" }}>{step.title}</h2>

                    {step.type === "single" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {step.options.map((o) => (
                                <button key={o.id} onClick={() => pickSingle(o.id)}
                                    className="group text-left p-4 rounded-xl border border-[#D2D2D7] bg-white hover:border-[#0A0A0B] hover:bg-black/[0.03] transition-all"
                                    data-testid={`mps-opt-${step.key}-${o.id}`}>
                                    <div className="font-semibold text-[14.5px] text-[#0A0A0B] flex items-center justify-between" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                        {o.label}
                                        <ArrowRight size={14} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                    {o.desc && <div className="text-[12px] text-[#6E6E73] mt-1">{o.desc}</div>}
                                </button>
                            ))}
                        </div>
                    )}

                    {step.type === "multi" && (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {step.options.map((o) => {
                                    const selected = (answers[step.key] || []).includes(o.id);
                                    return (
                                        <button key={o.id} onClick={() => toggleMulti(o.id)}
                                            className={`px-4 py-2 rounded-full border text-[13px] transition ${selected ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#86868B]"}`}
                                            data-testid={`mps-multi-${step.key}-${o.id}`}>
                                            {o.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {step.options.length === 0 && (
                                <div className="text-[13px] text-[#6E6E73]">No special features for this use case — hit Next to continue.</div>
                            )}
                            <div className="mt-6 flex items-center justify-end">
                                <Button onClick={nextMulti} className="btn-cta inline-flex items-center gap-2" data-testid="mps-next-btn">
                                    Next <ArrowRight size={14} />
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-6 flex items-center justify-between">
                    <button onClick={back} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/80 hover:text-white" data-testid="mps-back-btn">
                        <ChevronLeft size={14} /> Back
                    </button>
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
                        <Printer size={12} /> Takes less than a minute
                    </div>
                </div>
            </div>
        </div>
    );
}
