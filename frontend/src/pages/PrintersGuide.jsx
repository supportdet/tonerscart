import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { ChevronLeft, ArrowRight, Printer, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import PhonePrefixInput from "../components/PhonePrefixInput";
import PageMeta from "../components/PageMeta";

// ============================================================
// Question catalog
// ============================================================

const USAGES = [
    { id: "home", label: "Home", desc: "Personal / household use" },
    { id: "corporate", label: "Corporate / Office", desc: "Shared by a team or department" },
    { id: "commercial", label: "Commercial / Industrial", desc: "Factory, warehouse, retail chain" },
    { id: "print_shop", label: "Print Shop / Copy Center", desc: "Commercial printing business" },
];

const TECH_BY_USAGE = {
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

const PAPER_SIZES = [
    { id: "A4", label: "A4", desc: "Standard letter size" },
    { id: "A3", label: "A3" },
    { id: "SRA3", label: "SRA3" },
    { id: "A2", label: "A2" },
    { id: "A1", label: "A1" },
    { id: "Roll", label: "Roll printing" },
];

const COLORS = [
    { id: "color", label: "Color" },
    { id: "bw", label: "Black & White" },
    { id: "both", label: "Both" },
];

const FUNCTIONS = [
    { id: "print_only", label: "Print only" },
    { id: "print_scan", label: "Print + Scan" },
    { id: "all_in_one", label: "Print + Copy + Scan", desc: "All-in-One" },
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
    home: ["Duplex", "Mobile printing", "High-resolution", "Voice assistant"],
    corporate: ["Duplex", "Secure printing", "Cloud printing", "Department tracking"],
    commercial: ["Duplex", "Heavy duty", "Oversized media", "Print management software"],
    print_shop: ["Heavy duty", "Large format", "Finishing options", "Advanced color management"],
};

const BUDGETS = [
    { id: "<15k",     label: "Under ₹15,000",          min: 0,      max: 15000 },
    { id: "15-50k",   label: "₹15,000 – ₹50,000",      min: 15000,  max: 50000 },
    { id: "50-150k",  label: "₹50,000 – ₹1,50,000",   min: 50000,  max: 150000 },
    { id: ">150k",    label: "Above ₹1,50,000",        min: 150000, max: 99999999, leadCapture: true },
];

const QUANTITIES = [
    { id: "1",     label: "1 printer",     num: 1 },
    { id: "2-5",   label: "2 – 5 printers",   num: 5 },
    { id: "6-20",  label: "6 – 20 printers",  num: 20 },
    { id: "20+",   label: "20+ printers",  num: 999, leadCapture: true },
];

// Pretty labels for the summary card on the lead-capture screen
const LABELS = {
    home: "Home", corporate: "Corporate / Office",
    commercial: "Commercial / Industrial", print_shop: "Print Shop / Copy Center",
    color: "Color", bw: "Black & White", both: "Color + B&W",
    print_only: "Print only", print_scan: "Print + Scan",
    all_in_one: "Print + Copy + Scan", high_volume: "High-volume bulk",
    other: "Not sure",
};
function fmt(v) { return LABELS[v] || v; }

// ============================================================
// Step builder
// ============================================================

const ALL_STEPS = [
    "usage", "tech", "paper", "color", "function",
    "volume", "connectivity", "features", "budget", "quantity",
];

function visibleSteps(a) {
    const list = ["usage"];
    if (a.usage) list.push("tech");
    const needsPaper = a.usage === "commercial" || a.usage === "print_shop";
    if (needsPaper && a.tech) list.push("paper");
    // If non-A4 chosen, we short-circuit before color shows
    const nonA4 = a.paper && a.paper !== "A4";
    if (nonA4) return list;          // Stop here — go to lead capture
    if (needsPaper ? a.paper === "A4" : a.tech) list.push("color");
    if (a.color) list.push("function");
    if (a.function) list.push("volume");
    if (a.volume) list.push("connectivity");
    if (a.connectivity !== undefined) list.push("features");
    if (a.features !== undefined) list.push("budget");
    // If budget is "above 1.5L", stop and go to lead capture
    if (a.budget && a.budget !== ">150k") list.push("quantity");
    return list;
}

// ============================================================
// Component
// ============================================================

export default function PrintersGuide({ embedded = false, onClose }) {
    const navigate = useNavigate();
    const { city: currentCity } = useCity();
    const [answers, setAnswers] = useState({});
    const [idx, setIdx] = useState(0);
    const [phase, setPhase] = useState("quiz");  // "quiz" | "lead"
    const [dir, setDir] = useState("fwd");
    const steps = useMemo(() => visibleSteps(answers), [answers]);
    const stepKey = steps[Math.min(idx, steps.length - 1)] || "usage";
    const total = ALL_STEPS.length;
    const progress = Math.min(100, Math.round(((idx + 1) / total) * 100));

    // ---------- routing ----------

    const routeToMarketplace = (a) => {
        const params = new URLSearchParams();
        if (a.usage) params.set("usage_type", a.usage);
        if (a.tech && a.tech !== "other") params.set("category", a.tech);
        if (a.color) params.set("color", a.color);
        if (a.function) params.set("function_", a.function);
        const vol = VOLUMES_BY_USAGE[a.usage]?.find((v) => v.id === a.volume);
        if (vol) { params.set("min_volume", String(vol.min)); params.set("max_volume", String(vol.max)); }
        if (currentCity) params.set("city", currentCity);
        // Note: paper_size, connectivity, feature, budget and quantity are
        // intentionally NOT sent — questionnaire-only signals for routing.
        // Wave 56: when rendered inside the auto-open popup, close it first
        // so the final-step click reveals the freshly-filtered marketplace
        // underneath. Without this the overlay stayed mounted after the URL
        // changed and the user saw the same quiz screen — felt frozen.
        if (embedded && onClose) onClose();
        navigate(`/printers/results?${params.toString()}`);
    };

    const advance = (next) => {
        // Branch: paper size non-A4 → lead capture
        if (next.paper && next.paper !== "A4") return setPhase("lead");
        // Branch: budget above 1.5L → lead capture
        if (next.budget === ">150k") return setPhase("lead");
        // Branch: quantity 20+ → lead capture
        if (next.quantity === "20+") return setPhase("lead");
        // Final step: route to marketplace
        if (stepKey === "quantity") return routeToMarketplace(next);
        setDir("fwd");
        setTimeout(() => setIdx((i) => Math.min(ALL_STEPS.length - 1, i + 1)), 160);
    };

    // ---------- handlers ----------

    const pickSingle = (key, id) => {
        const next = { ...answers, [key]: id };
        // Reset downstream answers when branch-affecting fields change
        if (key === "usage")  { delete next.tech; delete next.paper; delete next.color; delete next.function; delete next.volume; delete next.connectivity; delete next.features; delete next.budget; delete next.quantity; }
        if (key === "tech")   { delete next.paper; delete next.color; delete next.function; delete next.volume; delete next.connectivity; delete next.features; delete next.budget; delete next.quantity; }
        if (key === "paper")  { delete next.color; delete next.function; delete next.volume; delete next.connectivity; delete next.features; delete next.budget; delete next.quantity; }
        setAnswers(next);
        advance(next);
    };

    const toggleMulti = (key, id) => {
        setAnswers((a) => {
            const cur = a[key] || [];
            const list = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
            return { ...a, [key]: list };
        });
    };

    const nextMulti = (key) => {
        const cur = answers[key] || [];
        if (key === "connectivity" && cur.length === 0) { toast.error("Pick at least one connectivity option"); return; }
        const next = { ...answers, [key]: cur };
        if (key === "features" && next.features === undefined) next.features = [];
        setAnswers(next);
        advance(next);
    };

    const back = () => {
        if (idx === 0) {
            if (embedded && onClose) onClose();
            else navigate(-1);
            return;
        }
        setDir("back");
        setTimeout(() => setIdx((i) => Math.max(0, i - 1)), 160);
    };

    // ============================================================
    // Lead Capture Form (rendered instead of last step)
    // ============================================================

    if (phase === "lead") {
        return <LeadCaptureForm answers={answers} currentCity={currentCity} onBack={() => setPhase("quiz")} />;
    }

    // ============================================================
    // Quiz UI
    // ============================================================

    const stepTitle = ({
        usage:        "Where will the printer be used?",
        tech:         "What printer technology do you need?",
        paper:        "What paper size do you need?",
        color:        "What's your color preference?",
        function:     "What functions do you need?",
        volume:       "Estimated monthly print volume",
        connectivity: "Preferred connectivity",
        features:     "Any special features needed?",
        budget:       "What's your budget per printer?",
        quantity:     "How many printers do you need?",
    })[stepKey];

    const stepNum = idx + 1;

    return (
        <div className={`tc-hero relative ${embedded ? "pb-10" : "pb-20"}`} data-testid="printers-guide-page">
            {!embedded && (
                <PageMeta
                    title="Buy Printers Online India — Verified Dealers | TonersCart"
                    description="Buy laser printers, inkjet printers, all-in-one MFDs for home and office in India. Compare prices from verified dealers in Bangalore, Mumbai, Delhi and across India."
                    path="/printers"
                />
            )}
            <div className="tc-hero-grid" />
            <div className={`tc-container relative ${embedded ? "pt-8" : "pt-12 sm:pt-16"} max-w-3xl`}>
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-medium text-white/80">Printers · Guided finder</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Find the right printer setup
                </h1>
                <p className="text-white/65 mt-3 text-[14px] max-w-xl">
                    A few quick questions so we can show you printers that fit your workflow.
                </p>

                {/* Progress */}
                <div className="mt-6 flex items-center gap-3">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#F5C400] transition-all duration-300" style={{ width: `${progress}%` }} data-testid="quiz-progress-bar" />
                    </div>
                    <div className="text-[11px] text-white/65 font-mono tabular-nums" data-testid="quiz-progress">
                        Step {stepNum} of {total}
                    </div>
                </div>

                {/* Step card */}
                <div
                    key={stepKey}
                    className={`mt-6 bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-6 sm:p-8 text-[#0A0A0B] transition-all duration-300 ${dir === "back" ? "tc-step-back" : "tc-step-fwd"}`}
                    data-testid={`quiz-step-${stepKey}`}
                >
                    <h2 className="text-[#0A0A0B] mb-5" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "22px", fontWeight: 500, letterSpacing: "-0.01em" }}>
                        {stepTitle}
                    </h2>

                    {stepKey === "usage" && (
                        <Tiles options={USAGES} onPick={(id) => pickSingle("usage", id)} testKey="usage" />
                    )}

                    {stepKey === "tech" && (
                        <Tiles options={TECH_BY_USAGE[answers.usage] || []} onPick={(id) => pickSingle("tech", id)} testKey="tech" />
                    )}

                    {stepKey === "paper" && (
                        <>
                            <div className="text-[12.5px] text-[#6E6E73] -mt-3 mb-4">
                                Pick the primary paper size. Selecting a size larger than A4 routes your enquiry to our team.
                            </div>
                            <Tiles options={PAPER_SIZES} onPick={(id) => pickSingle("paper", id)} testKey="paper" />
                        </>
                    )}

                    {stepKey === "color" && (
                        <Tiles options={COLORS} onPick={(id) => pickSingle("color", id)} testKey="color" />
                    )}

                    {stepKey === "function" && (
                        <Tiles options={FUNCTIONS} onPick={(id) => pickSingle("function", id)} testKey="function" />
                    )}

                    {stepKey === "volume" && (
                        <Tiles options={VOLUMES_BY_USAGE[answers.usage] || []} onPick={(id) => pickSingle("volume", id)} testKey="volume" />
                    )}

                    {stepKey === "connectivity" && (
                        <MultiSelect
                            options={CONNECTIVITY.map((c) => ({ id: c, label: c }))}
                            selected={answers.connectivity || []}
                            onToggle={(id) => toggleMulti("connectivity", id)}
                            onNext={() => nextMulti("connectivity")}
                            testKey="connectivity"
                        />
                    )}

                    {stepKey === "features" && (
                        <MultiSelect
                            options={(FEATURES_BY_USAGE[answers.usage] || []).map((f) => ({ id: f, label: f }))}
                            selected={answers.features || []}
                            onToggle={(id) => toggleMulti("features", id)}
                            onNext={() => nextMulti("features")}
                            testKey="features"
                            allowEmpty
                        />
                    )}

                    {stepKey === "budget" && (
                        <Tiles options={BUDGETS} onPick={(id) => pickSingle("budget", id)} testKey="budget" />
                    )}

                    {stepKey === "quantity" && (
                        <Tiles options={QUANTITIES} onPick={(id) => pickSingle("quantity", id)} testKey="quantity" />
                    )}
                </div>

                <div className="mt-6 flex items-center justify-between">
                    <button onClick={back} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/80 hover:text-white" data-testid="quiz-back-btn">
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

// ============================================================
// Reusable: option tiles for auto-advance single-select steps
// ============================================================

function Tiles({ options, onPick, testKey }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {options.map((o) => (
                <button
                    key={o.id}
                    onClick={() => onPick(o.id)}
                    className="group text-left p-4 rounded-xl border border-[#D2D2D7] bg-white hover:border-[#F5C400] hover:bg-[#FFFBEB] hover:shadow-md transition-all"
                    data-testid={`quiz-opt-${testKey}-${o.id}`}
                >
                    <div className="font-semibold text-[14.5px] text-[#0A0A0B] flex items-center justify-between" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                        {o.label}
                        <ArrowRight size={14} className="opacity-30 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:text-[#F5C400] transition-all" />
                    </div>
                    {o.desc && <div className="text-[12px] text-[#6E6E73] mt-1">{o.desc}</div>}
                </button>
            ))}
        </div>
    );
}

function MultiSelect({ options, selected, onToggle, onNext, testKey, allowEmpty }) {
    return (
        <>
            <div className="flex flex-wrap gap-2">
                {options.length === 0 ? (
                    <div className="text-[13px] text-[#6E6E73]">No options for this use case — tap Next to continue.</div>
                ) : (
                    options.map((o) => {
                        const isSel = selected.includes(o.id);
                        return (
                            <button
                                key={o.id}
                                onClick={() => onToggle(o.id)}
                                className={`px-4 py-2 rounded-full border text-[13px] font-medium transition ${isSel
                                    ? "bg-[#F5C400] text-[#0A0A0B] border-[#F5C400] shadow-sm"
                                    : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#86868B]"}`}
                                data-testid={`quiz-multi-${testKey}-${o.id}`}
                            >
                                {o.label}
                            </button>
                        );
                    })
                )}
            </div>
            <div className="mt-6 flex items-center justify-end">
                <Button
                    onClick={onNext}
                    className="btn-cta inline-flex items-center gap-2"
                    disabled={!allowEmpty && selected.length === 0 && options.length > 0}
                    data-testid={`quiz-next-${testKey}-btn`}
                >
                    Next <ArrowRight size={14} />
                </Button>
            </div>
        </>
    );
}

// ============================================================
// Lead Capture Form
// ============================================================

function summaryLines(a) {
    const out = [];
    if (a.usage) out.push(["Usage", fmt(a.usage)]);
    if (a.tech) out.push(["Technology", fmt(a.tech)]);
    if (a.paper) out.push(["Paper size", a.paper]);
    if (a.color) out.push(["Color", fmt(a.color)]);
    if (a.function) out.push(["Functions", fmt(a.function)]);
    if (a.volume) {
        const v = VOLUMES_BY_USAGE[a.usage]?.find((x) => x.id === a.volume);
        out.push(["Monthly volume", v?.label || a.volume]);
    }
    if (a.connectivity?.length) out.push(["Connectivity", a.connectivity.join(", ")]);
    if (a.features?.length) out.push(["Features", a.features.join(", ")]);
    if (a.budget) {
        const b = BUDGETS.find((x) => x.id === a.budget);
        out.push(["Budget", b?.label || a.budget]);
    }
    if (a.quantity) {
        const q = QUANTITIES.find((x) => x.id === a.quantity);
        out.push(["Quantity", q?.label || a.quantity]);
    }
    return out;
}

function LeadCaptureForm({ answers, currentCity, onBack }) {
    const [form, setForm] = useState({
        name: "", company: "", phone: "", email: "",
        city: currentCity || "",
        pincode: "",
        notes: "",
    });
    const [summaryOpen, setSummaryOpen] = useState(true);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const lines = summaryLines(answers);

    const qty = QUANTITIES.find((q) => q.id === answers.quantity);
    const estimated = qty ? qty.label : (answers.quantity || "—");

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.company.trim() || !form.phone || !form.email.trim() || !form.pincode) {
            toast.error("Name, company, email, phone and pincode are required");
            return;
        }
        if (form.phone.length !== 10) { toast.error("Enter a valid 10-digit phone"); return; }
        if (!/^[1-9][0-9]{5}$/.test(form.pincode)) { toast.error("Enter a valid 6-digit pincode"); return; }
        setLoading(true);
        try {
            await api.post("/mps/inquiry", {
                name: form.name.trim(),
                email: form.email.trim(),
                phone: `+91 ${form.phone}`,
                description: [
                    form.company ? `Company: ${form.company}` : "",
                    form.city ? `City: ${form.city}` : "",
                    form.pincode ? `Pincode: ${form.pincode}` : "",
                    form.notes ? `Notes: ${form.notes}` : "",
                ].filter(Boolean).join("\n"),
                estimated_printers: estimated,
                selections: {
                    ...answers,
                    company: form.company,
                    contact_city: form.city || null,
                    pincode: form.pincode,
                    source: "printers_guide",
                },
            });
            setDone(true);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tc-hero relative pb-20" data-testid="lead-capture-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14 max-w-3xl">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#F5C400]">Custom requirement</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Let&apos;s find the right printer for you
                </h1>
                <p className="text-white/65 mt-3 text-[14.5px] max-w-2xl">
                    Our team will contact you within 24 hours with options tailored to your needs.
                </p>

                {done ? (
                    <div className="mt-8 bg-white border border-black/[0.06] rounded-2xl p-8 sm:p-10 text-center text-[#0A0A0B]" data-testid="lead-success">
                        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 grid place-items-center">
                            <CheckCircle2 size={26} className="text-emerald-600" />
                        </div>
                        <h2 className="mt-5 text-[22px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Enquiry sent!</h2>
                        <p className="text-[#6E6E73] text-[14px] mt-2">Our team will reach out within 24 hours.</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="mt-8 space-y-5" data-testid="lead-form">
                        {/* Summary card */}
                        <div className="bg-white/[0.06] backdrop-blur border border-white/15 rounded-2xl text-white" data-testid="lead-summary-card">
                            <button
                                type="button"
                                onClick={() => setSummaryOpen((o) => !o)}
                                className="w-full flex items-center justify-between px-5 py-4 text-left"
                                data-testid="lead-summary-toggle"
                            >
                                <div>
                                    <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-white/55">Your selections</div>
                                    <div className="text-[14px] font-semibold mt-0.5">{lines.length} answer{lines.length !== 1 ? "s" : ""} captured</div>
                                </div>
                                {summaryOpen ? <ChevronUp size={18} className="text-white/65" /> : <ChevronDown size={18} className="text-white/65" />}
                            </button>
                            {summaryOpen && (
                                <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                                    {lines.length === 0 ? (
                                        <div className="text-white/60">No selections yet.</div>
                                    ) : (
                                        lines.map(([k, v]) => (
                                            <div key={k} className="flex items-start justify-between gap-3 py-1 border-b border-white/8">
                                                <span className="text-white/55">{k}</span>
                                                <span className="text-white text-right">{v}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Contact form */}
                        <div className="bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-7 space-y-4 text-[#0A0A0B]">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label>Full name <span className="text-red-500">*</span></Label>
                                    <Input value={form.name} onChange={upd("name")} required data-testid="lead-name" />
                                </div>
                                <div>
                                    <Label>Company <span className="text-red-500">*</span></Label>
                                    <Input value={form.company} onChange={upd("company")} required data-testid="lead-company" />
                                </div>
                                <div>
                                    <Label>Phone <span className="text-red-500">*</span></Label>
                                    <PhonePrefixInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required testId="lead-phone" />
                                </div>
                                <div>
                                    <Label>Email <span className="text-red-500">*</span></Label>
                                    <Input type="email" value={form.email} onChange={upd("email")} required data-testid="lead-email" />
                                </div>
                                <div>
                                    <Label>City</Label>
                                    <select
                                        value={form.city}
                                        onChange={upd("city")}
                                        className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]"
                                        data-testid="lead-city"
                                    >
                                        <option value="">Select city…</option>
                                        {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Label>Pincode <span className="text-red-500">*</span></Label>
                                    <Input
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={form.pincode}
                                        onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                                        required
                                        placeholder="6-digit pincode"
                                        data-testid="lead-pincode"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Additional requirements (optional)</Label>
                                <Textarea
                                    rows={4}
                                    value={form.notes}
                                    onChange={upd("notes")}
                                    placeholder="Anything specific — timeline, brand preference, accessories…"
                                    data-testid="lead-notes"
                                />
                            </div>
                            <Button type="submit" className="btn-cta w-full inline-flex items-center justify-center gap-2" disabled={loading} data-testid="lead-submit">
                                {loading ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : "Send Enquiry"}
                            </Button>
                        </div>

                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/80 hover:text-white"
                            data-testid="lead-back-btn"
                        >
                            <ChevronLeft size={14} /> Back to questions
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
