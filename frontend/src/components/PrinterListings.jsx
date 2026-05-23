import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import CommissionBanner from "./CommissionBanner";

// ============================================================
// Option catalogues — kept aligned with PrintersGuide.jsx so
// buyer answers + dealer specs share the same vocabulary.
// ============================================================

const USAGE_OPTS = [
    { id: "home",        label: "Home" },
    { id: "corporate",   label: "Corporate / Office" },
    { id: "commercial",  label: "Commercial / Industrial" },
    { id: "print_shop",  label: "Print Shop / Copy Center" },
];

const TECH_BY_USAGE = {
    home: [
        { id: "inkjet", label: "Inkjet" }, { id: "laser", label: "Laser" },
        { id: "tank", label: "Tank" }, { id: "thermal", label: "Thermal" },
        { id: "other", label: "Other" },
    ],
    corporate: [
        { id: "laser", label: "Laser" }, { id: "tank", label: "Tank" },
        { id: "inkjet", label: "Inkjet" }, { id: "other", label: "Other" },
    ],
    commercial: [
        { id: "laser", label: "Laser" }, { id: "ink", label: "Ink" },
        { id: "production", label: "Production" },
        { id: "label_barcode", label: "Label / Barcode" },
        { id: "other", label: "Other" },
    ],
    print_shop: [
        { id: "laser", label: "Laser" }, { id: "inkjet", label: "Inkjet" },
        { id: "production", label: "Production" },
        { id: "digital_press", label: "Digital Press" },
        { id: "other", label: "Other" },
    ],
};

const PAPER_SIZES   = ["A4", "A3", "SRA3", "A2", "A1", "Roll"];
const CONNECTIVITY  = ["Wi-Fi", "USB", "Bluetooth", "Ethernet"];

const COLOR_OPTS = [
    { id: "color", label: "Color" }, { id: "bw", label: "B&W" }, { id: "both", label: "Both" },
];

const FUNCTIONS = [
    { id: "print_only",  label: "Print only" },
    { id: "print_scan",  label: "Print + Scan" },
    { id: "all_in_one",  label: "Print + Copy + Scan" },
    { id: "high_volume", label: "High-volume" },
];

// All special features in one combined list — dealer chooses which apply
const ALL_FEATURES = [
    "Duplex", "Mobile printing", "High-resolution", "Voice assistant",
    "Secure printing", "Cloud printing", "Department tracking",
    "Heavy duty", "Oversized media", "Print management software",
    "Large format", "Finishing options", "Advanced color management",
];

const PRETTY = {
    home: "Home", corporate: "Corporate / Office",
    commercial: "Commercial / Industrial", print_shop: "Print Shop / Copy Center",
    color: "Color", bw: "B&W", both: "Both",
    print_only: "Print only", print_scan: "Print + Scan",
    all_in_one: "Print + Copy + Scan", high_volume: "High-volume",
    new: "Brand New", refurbished: "Refurbished",
    other: "Other", inkjet: "Inkjet", laser: "Laser", tank: "Tank",
    thermal: "Thermal", ink: "Ink", production: "Production",
    label_barcode: "Label / Barcode", digital_press: "Digital Press",
};
const fmt = (v) => PRETTY[v] || v;

const EMPTY = {
    brand: "", model_number: "", description: "",
    image_url: "",
    usage_type: "", category: "",
    paper_sizes: [],
    color: "",
    functions: [],
    monthly_volume_min: "",
    monthly_volume_max: "",
    connectivity: [],
    features: [],
    price: "",
    stock: "1",
    condition: "new",
};

// ============================================================

export default function PrinterListings() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/supplier/printers/mine");
            setItems(Array.isArray(data) ? data : []);
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    // External trigger from parent dashboard "+ Add printer" button
    useEffect(() => {
        const handler = () => setOpen(true);
        window.addEventListener("tc-open-add-printer", handler);
        return () => window.removeEventListener("tc-open-add-printer", handler);
    }, []);

    const remove = async (id) => {
        if (!window.confirm("Remove this printer listing?")) return;
        try { await api.delete(`/supplier/printers/${id}`); toast.success("Removed"); load(); }
        catch (err) { toast.error(formatApiError(err)); }
    };

    return (
        <div data-testid="printer-listings-section">
            <div className="flex items-center justify-between mb-4">
                <div className="text-[12px] text-[#6E6E73]">{items.length} {items.length === 1 ? "printer" : "printers"} listed</div>
            </div>

            {loading ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">Loading…</div>
            ) : items.length === 0 ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">
                    No printers yet. Tap <span className="font-semibold text-[#0A0A0B]">Add printer</span> to publish your first printer.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((p) => (
                        <div key={p.id} className="tc-listing-card" data-testid={`printer-listing-${p.id}`}>
                            {p.image_url
                                ? <img src={p.image_url} alt="" className="tc-listing-img" loading="lazy" />
                                : <div className="tc-listing-img-ph"><ImageIcon size={32} /></div>}
                            <div className="p-4 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={p.condition === "new" ? "tc-badge-new" : "tc-badge-refurb"}>
                                        {p.condition === "new" ? "New" : "Refurbished"}
                                    </span>
                                    <span className="tc-badge-tag">{fmt(p.usage_type)} · {fmt(p.category)}</span>
                                </div>
                                <div className="text-[#0A0A0B] text-[16px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.005em" }}>
                                    {p.brand} · {p.model_number}
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="font-mono text-[20px] font-bold text-[#0A0A0B] leading-none">₹{Number(p.price).toLocaleString("en-IN")}</div>
                                    <span className={`tc-stock-dot ${p.stock > 0 ? "is-in" : "is-out"}`}>
                                        {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-end pt-1">
                                    <button
                                        type="button"
                                        onClick={() => remove(p.id)}
                                        className="text-[11.5px] text-red-600 hover:text-red-700 inline-flex items-center gap-1"
                                        data-testid={`remove-printer-${p.id}`}
                                    >
                                        <Trash2 size={11} /> Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AddPrinterWizard
                open={open}
                onClose={() => setOpen(false)}
                onSaved={() => { setOpen(false); load(); }}
            />
        </div>
    );
}

// ============================================================
// 4-step Add-Printer Wizard
// ============================================================

function AddPrinterWizard({ open, onClose, onSaved }) {
    const [step, setStep] = useState(1);
    const [f, setF] = useState(EMPTY);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState("");
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Reset whenever the dialog reopens
    useEffect(() => {
        if (open) {
            setStep(1);
            setF(EMPTY);
            setImageFile(null);
            setImagePreview("");
        }
    }, [open]);

    const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const setVal = (k, v) => setF({ ...f, [k]: v });
    const toggleArr = (k, v) => setF((cur) => ({
        ...cur,
        [k]: (cur[k] || []).includes(v) ? cur[k].filter((x) => x !== v) : [...(cur[k] || []), v],
    }));

    // ---------- Step 1: Basic info ----------
    const onPickFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const uploadImage = async () => {
        if (!imageFile) return f.image_url;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", imageFile);
            const { data: up } = await api.post("/supplier/printer-image", fd);
            return up.url;
        } finally {
            setUploading(false);
        }
    };

    // ---------- Validation per step ----------
    const canNext = () => {
        if (step === 1) {
            if (!f.brand.trim()) return false;
            if (!f.model_number.trim()) return false;
            if (!imageFile && !f.image_url) return false;
            return true;
        }
        if (step === 2) {
            if (!f.usage_type) return false;
            if (!f.category) return false;
            if (!f.paper_sizes.length) return false;
            if (!f.color) return false;
            if (!f.functions.length) return false;
            const minV = Number(f.monthly_volume_min);
            const maxV = Number(f.monthly_volume_max);
            if (!minV || !maxV || minV < 0 || maxV < minV) return false;
            if (!f.connectivity.length) return false;
            return true;
        }
        if (step === 3) {
            if (!f.price || Number(f.price) <= 0) return false;
            if (f.stock === "" || Number(f.stock) < 0) return false;
            if (!f.condition) return false;
            return true;
        }
        return true;
    };

    const goNext = async () => {
        if (!canNext()) { toast.error("Please complete all required fields"); return; }
        if (step === 1 && imageFile && !f.image_url) {
            try {
                const url = await uploadImage();
                setF((cur) => ({ ...cur, image_url: url }));
            } catch (err) {
                toast.error(formatApiError(err) || "Image upload failed");
                return;
            }
        }
        if (step === 2) {
            // If user changes usage but already picked tech from another usage, clear it
            const allowed = (TECH_BY_USAGE[f.usage_type] || []).map((t) => t.id);
            if (f.category && !allowed.includes(f.category)) {
                setF((cur) => ({ ...cur, category: "" }));
                toast.error("Pick a printer technology"); return;
            }
        }
        setStep((s) => Math.min(4, s + 1));
    };

    const goBack = () => setStep((s) => Math.max(1, s - 1));

    const submit = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await api.post("/supplier/printers", {
                brand: f.brand.trim(),
                model_number: f.model_number.trim(),
                description: f.description.trim(),
                image_url: f.image_url,
                condition: f.condition,
                usage_type: f.usage_type,
                category: f.category,
                color: f.color,
                paper_sizes: f.paper_sizes,
                functions: f.functions,
                connectivity: f.connectivity,
                features: f.features,
                monthly_volume_min: Number(f.monthly_volume_min) || 0,
                monthly_volume_max: Number(f.monthly_volume_max) || 0,
                price: parseFloat(f.price),
                stock: parseInt(f.stock || "1", 10),
            });
            toast.success("Printer listed");
            onSaved();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSaving(false);
        }
    };

    const techOpts = TECH_BY_USAGE[f.usage_type] || [];

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[680px] max-h-[92vh] overflow-y-auto p-8 rounded-[20px] tc-shadow-lg" data-testid="add-printer-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[#0A0A0B] text-[22px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.01em" }}>
                        Add a printer
                    </DialogTitle>
                </DialogHeader>

                {/* Step indicator */}
                <div className="flex items-center justify-between mb-1 mt-1" data-testid="wizard-step-indicator">
                    <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">
                        Step {step} of 4 — {["Basic info", "Specs", "Pricing & stock", "Review"][step - 1]}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4].map((n) => (
                            <span
                                key={n}
                                className={`h-1.5 rounded-full transition-all ${n === step ? "w-6 bg-[#0A0A0B]" : n < step ? "w-3 bg-[#F5C400]" : "w-3 bg-[#D2D2D7]"}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Steps */}
                {step === 1 && (
                    <div data-testid="wizard-step-1">
                        <div className="tc-form-section">Basic info</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2">
                                <Label>Product image <span className="text-red-500">*</span></Label>
                                <label className="block mt-1 cursor-pointer">
                                    <input type="file" accept="image/*" onChange={onPickFile} className="hidden" data-testid="wizard-image-input" />
                                    <div className={`tc-image-drop ${imagePreview ? "has-image" : ""}`}>
                                        {imagePreview
                                            ? <img src={imagePreview} alt="preview" className="max-h-32 rounded-md" />
                                            : (
                                                <>
                                                    <ImageIcon size={22} />
                                                    <span>Click to upload printer image</span>
                                                    <span className="text-[11px] text-[#86868B] font-normal">PNG / JPG, max 5 MB</span>
                                                </>
                                            )}
                                    </div>
                                </label>
                            </div>
                            <div>
                                <Label>Brand <span className="text-red-500">*</span></Label>
                                <Input value={f.brand} onChange={upd("brand")} placeholder="HP, Canon, Epson…" className="tc-input-lg" data-testid="wizard-brand" />
                            </div>
                            <div>
                                <Label>Model number <span className="text-red-500">*</span></Label>
                                <Input value={f.model_number} onChange={upd("model_number")} placeholder="M1138w, LBP2900B…" className="tc-input-lg" data-testid="wizard-model" />
                            </div>
                            <div className="sm:col-span-2">
                                <Label>Description (optional)</Label>
                                <Textarea rows={3} value={f.description} onChange={upd("description")} placeholder="Highlight key strengths buyers should know…" className="tc-input-lg" data-testid="wizard-description" />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div data-testid="wizard-step-2">
                        <div className="tc-form-section">Specifications</div>
                        <div className="space-y-4">
                            <SpecGroup label="Usage type" required>
                                <PillRow
                                    options={USAGE_OPTS}
                                    selected={[f.usage_type]}
                                    onClick={(id) => setF({ ...f, usage_type: id, category: "" })}
                                    testKey="usage"
                                />
                            </SpecGroup>

                            <SpecGroup
                                label="Printer technology"
                                required
                                hint={!f.usage_type ? "Pick a usage type first" : undefined}
                            >
                                <PillRow
                                    options={techOpts}
                                    selected={[f.category]}
                                    onClick={(id) => setVal("category", id)}
                                    disabled={!f.usage_type}
                                    testKey="tech"
                                />
                            </SpecGroup>

                            <SpecGroup label="Paper sizes supported" required hint="Choose all that apply">
                                <PillRow
                                    options={PAPER_SIZES.map((p) => ({ id: p, label: p }))}
                                    selected={f.paper_sizes}
                                    onClick={(id) => toggleArr("paper_sizes", id)}
                                    multi
                                    testKey="paper"
                                />
                            </SpecGroup>

                            <SpecGroup label="Color capability" required>
                                <PillRow
                                    options={COLOR_OPTS}
                                    selected={[f.color]}
                                    onClick={(id) => setVal("color", id)}
                                    testKey="color"
                                />
                            </SpecGroup>

                            <SpecGroup label="Functions" required>
                                <PillRow
                                    options={FUNCTIONS}
                                    selected={f.functions}
                                    onClick={(id) => toggleArr("functions", id)}
                                    multi
                                    testKey="function"
                                />
                            </SpecGroup>

                            <SpecGroup label="Monthly volume capacity" required hint="Range the printer supports">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-[11.5px] text-[#6E6E73]">Minimum</Label>
                                        <div className="tc-suffix-wrap">
                                            <Input type="number" min="0" value={f.monthly_volume_min} onChange={upd("monthly_volume_min")} placeholder="500" className="tc-input-lg" data-testid="wizard-vol-min" />
                                            <span className="tc-suffix">pages/month</span>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-[11.5px] text-[#6E6E73]">Maximum</Label>
                                        <div className="tc-suffix-wrap">
                                            <Input type="number" min="0" value={f.monthly_volume_max} onChange={upd("monthly_volume_max")} placeholder="10000" className="tc-input-lg" data-testid="wizard-vol-max" />
                                            <span className="tc-suffix">pages/month</span>
                                        </div>
                                    </div>
                                </div>
                            </SpecGroup>

                            <SpecGroup label="Connectivity" required>
                                <PillRow
                                    options={CONNECTIVITY.map((c) => ({ id: c, label: c }))}
                                    selected={f.connectivity}
                                    onClick={(id) => toggleArr("connectivity", id)}
                                    multi
                                    testKey="conn"
                                />
                            </SpecGroup>

                            <SpecGroup label="Special features (optional)" hint="Choose all that apply">
                                <PillRow
                                    options={ALL_FEATURES.map((c) => ({ id: c, label: c }))}
                                    selected={f.features}
                                    onClick={(id) => toggleArr("features", id)}
                                    multi
                                    testKey="feature"
                                />
                            </SpecGroup>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div data-testid="wizard-step-3">
                        <div className="tc-form-section">Pricing &amp; stock</div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <Label>Price (₹) <span className="text-red-500">*</span></Label>
                                    <Input type="number" min="0" step="0.01" value={f.price} onChange={upd("price")} className="tc-input-lg" data-testid="wizard-price" />
                                </div>
                                <div>
                                    <Label>Stock quantity <span className="text-red-500">*</span></Label>
                                    <Input type="number" min="0" value={f.stock} onChange={upd("stock")} className="tc-input-lg" data-testid="wizard-stock" />
                                </div>
                            </div>
                            <CommissionBanner />
                            <div>
                                <Label>Condition <span className="text-red-500">*</span></Label>
                                <PillRow
                                    options={[{ id: "new", label: "Brand New" }, { id: "refurbished", label: "Refurbished" }]}
                                    selected={[f.condition]}
                                    onClick={(id) => setVal("condition", id)}
                                    testKey="condition"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-3" data-testid="wizard-step-4">
                        <div className="text-[12.5px] text-[#6E6E73] mb-2">
                            Review the details and tap Publish when you&apos;re ready.
                        </div>
                        <div className="bg-black/[0.03] border border-black/[0.06] rounded-xl p-4 grid sm:grid-cols-[120px,1fr] gap-4 text-[#0A0A0B]" data-testid="wizard-review-card">
                            {f.image_url || imagePreview ? (
                                <img src={f.image_url || imagePreview} alt="preview" className="w-full h-24 object-contain bg-white rounded-md border border-black/[0.06]" />
                            ) : (
                                <div className="w-full h-24 grid place-items-center bg-white border border-black/[0.06] rounded-md">
                                    <ImageIcon size={22} className="text-[#D2D2D7]" />
                                </div>
                            )}
                            <div>
                                <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">{f.brand}</div>
                                <div className="font-mono text-[16px] font-semibold mt-0.5">{f.model_number}</div>
                                {f.description && <div className="text-[12.5px] text-[#6E6E73] mt-1 line-clamp-2">{f.description}</div>}
                                <div className="mt-2 font-mono text-[18px] font-bold">₹{Number(f.price || 0).toLocaleString("en-IN")} <span className="text-[12px] text-[#6E6E73] font-normal">· {f.stock} in stock · {fmt(f.condition)}</span></div>
                            </div>
                        </div>

                        <ReviewRow k="Usage type"      v={fmt(f.usage_type)} />
                        <ReviewRow k="Technology"      v={fmt(f.category)} />
                        <ReviewRow k="Paper sizes"     v={f.paper_sizes.join(", ") || "—"} />
                        <ReviewRow k="Color"           v={fmt(f.color)} />
                        <ReviewRow k="Functions"       v={(f.functions || []).map(fmt).join(", ") || "—"} />
                        <ReviewRow k="Monthly volume"  v={`${Number(f.monthly_volume_min || 0).toLocaleString("en-IN")} – ${Number(f.monthly_volume_max || 0).toLocaleString("en-IN")} pages`} />
                        <ReviewRow k="Connectivity"    v={f.connectivity.join(", ") || "—"} />
                        <ReviewRow k="Features"        v={(f.features || []).join(", ") || "—"} />
                    </div>
                )}

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-black/[0.06] flex items-center justify-between">
                    <Button variant="outline" type="button" onClick={step === 1 ? onClose : goBack} disabled={saving || uploading} data-testid="wizard-back-btn">
                        <ChevronLeft size={14} className="mr-1" /> {step === 1 ? "Cancel" : "Back"}
                    </Button>
                    {step < 4 ? (
                        <button type="button" className="btn-pill-cta" onClick={goNext} disabled={!canNext() || uploading} data-testid="wizard-next-btn">
                            {uploading ? "Uploading…" : "Next"} <ChevronRight size={14} />
                        </button>
                    ) : (
                        <button type="button" className="btn-pill-cta" onClick={submit} disabled={saving} data-testid="wizard-publish-btn">
                            {saving ? "Publishing…" : <><CheckCircle2 size={14} /> Publish printer</>}
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// Small primitives
// ============================================================

function SpecGroup({ label, required, hint, children }) {
    return (
        <div>
            <Label>
                {label}
                {required && <span className="text-red-500"> *</span>}
            </Label>
            {hint && <div className="text-[11.5px] text-[#86868B] -mt-0.5 mb-1.5">{hint}</div>}
            <div className="mt-1.5">{children}</div>
        </div>
    );
}

function PillRow({ options, selected, onClick, multi, disabled, testKey }) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.length === 0 ? (
                <div className="text-[12.5px] text-[#86868B]">No options</div>
            ) : options.map((o) => {
                const isSel = (selected || []).includes(o.id);
                return (
                    <button
                        key={o.id}
                        type="button"
                        onClick={() => !disabled && onClick(o.id)}
                        disabled={disabled}
                        className={`tc-pill ${isSel ? "is-selected" : ""}`}
                        data-testid={`wizard-${testKey}-${o.id}`}
                    >
                        {o.label}
                    </button>
                );
            })}
            {multi && <span className="sr-only">multi-select</span>}
        </div>
    );
}

function ReviewRow({ k, v }) {
    return (
        <div className="flex items-start justify-between gap-4 px-1 py-1.5 border-b border-black/[0.04] text-[13px]">
            <span className="text-[#86868B]">{k}</span>
            <span className="text-[#0A0A0B] text-right">{v || "—"}</span>
        </div>
    );
}
