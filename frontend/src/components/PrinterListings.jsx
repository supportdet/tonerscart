import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon, ChevronLeft, ChevronRight, CheckCircle2, FileText, Pencil, X as XIcon } from "lucide-react";
import D2DRow from "./D2DRow";
import { withGst, PRINTER_SPECIAL_FEATURES } from "../lib/listingConstants";
import PriceWithGstToggle, { getBasePrice } from "./PriceWithGstToggle";
import api, { formatApiError } from "../lib/api";
import CommissionBanner from "./CommissionBanner";
import CompetitivePricingNote from "./CompetitivePricingNote";
import DeliveryPolicyNote from "./DeliveryPolicyNote";
import BulkUploadGeneric from "./BulkUploadGeneric";
import { printerBulkConfig } from "../lib/bulkConfigs";
import CompatibleModelsSelect from "./CompatibleModelsSelect";
import MissingModelLink from "./MissingModelLink";
import PrinterModelSelect from "./PrinterModelSelect";

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

const CONNECTIVITY_OPTS = [
    { id: "USB", label: "USB" }, { id: "WiFi", label: "WiFi" },
    { id: "Ethernet", label: "Ethernet" }, { id: "Bluetooth", label: "Bluetooth" },
    { id: "Wi-Fi Direct", label: "Wi-Fi Direct" }, { id: "NFC", label: "NFC" },
];
const PAPER_SIZE_OPTS = [
    { id: "A4", label: "A4" }, { id: "A3", label: "A3" }, { id: "A5", label: "A5" },
    { id: "Letter", label: "Letter" }, { id: "Legal", label: "Legal" }, { id: "Custom", label: "Custom" },
];
const MOBILE_PRINT_OPTS = [
    { id: "AirPrint", label: "AirPrint" }, { id: "Mopria", label: "Mopria" },
    { id: "Wi-Fi Direct", label: "Wi-Fi Direct" }, { id: "None", label: "None" },
];

const RESOLUTION_OPTS = [
    "600 x 600 dpi", "1200 x 600 dpi", "1200 x 1200 dpi",
    "2400 x 600 dpi", "4800 x 1200 dpi", "4800 x 2400 dpi", "9600 x 2400 dpi",
];

const PAPER_SIZES   = []; /* legacy — buyer-only */
const CONNECTIVITY  = []; /* legacy — buyer-only */

const COLOR_OPTS = [
    { id: "color", label: "Color" }, { id: "bw", label: "B&W" }, { id: "both", label: "Both" },
];

const FUNCTIONS = [
    { id: "print_only",  label: "Print only" },
    { id: "print_scan",  label: "Print + Scan" },
    { id: "all_in_one",  label: "Print + Copy + Scan" },
    { id: "high_volume", label: "High-volume" },
];

// All special features in one combined list — buyer-only (removed from dealer)
const ALL_FEATURES = [];

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
    compatible_models: "",
    image_url: "",
    image_urls: [],
    spec_pdf_path: "",
    usage_type: "", category: "",
    usage_types: [],
    special_features: [],
    color: "",
    functions: [],
    monthly_volume_min: "",
    monthly_volume_max: "",
    monthly_volume_recommended: "",
    print_speed_ppm: "",
    duty_cycle: "",
    connectivity: [],
    max_resolution: "",
    paper_sizes: [],
    mobile_printing: [],
    intercity_delivery_charge: "0",
    gst_rate: 18,
    price_type: null,
    price: "",
    stock: "1",
    condition: "new",
};

// ============================================================

export default function PrinterListings() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null); // listing object being edited
    const [bulkOpen, setBulkOpen] = useState(false);
    const [editBulkOpen, setEditBulkOpen] = useState(false);

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
        const handler = () => { setEditing(null); setOpen(true); };
        window.addEventListener("tc-open-add-printer", handler);
        const bhandler = () => setBulkOpen(true);
        window.addEventListener("tc-open-bulk-printer", bhandler);
        const ehandler = () => setEditBulkOpen(true);
        window.addEventListener("tc-open-edit-printer", ehandler);
        return () => {
            window.removeEventListener("tc-open-add-printer", handler);
            window.removeEventListener("tc-open-bulk-printer", bhandler);
            window.removeEventListener("tc-open-edit-printer", ehandler);
        };
    }, []);

    const remove = async (id) => {
        if (!window.confirm("Remove this printer listing?")) return;
        try { await api.delete(`/supplier/printers/${id}`); toast.success("Removed"); load(); }
        catch (err) { toast.error(formatApiError(err)); }
    };

    const onEdit = (p) => { setEditing(p); setOpen(true); };

    return (
        <div data-testid="printer-listings-section">
            {bulkOpen && (
                <BulkUploadGeneric config={printerBulkConfig} onClose={() => setBulkOpen(false)} onSuccess={load} />
            )}
            {editBulkOpen && (
                <BulkUploadGeneric config={printerBulkConfig} editMode initialRows={items.map(printerBulkConfig.fromListing)} onClose={() => setEditBulkOpen(false)} onSuccess={load} />
            )}
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
                                <div className="flex items-center justify-end pt-1 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => onEdit(p)}
                                        className="text-[11.5px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1"
                                        data-testid={`edit-printer-${p.id}`}
                                    >
                                        <Pencil size={11} /> Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => remove(p.id)}
                                        className="text-[11.5px] text-red-600 hover:text-red-700 inline-flex items-center gap-1"
                                        data-testid={`remove-printer-${p.id}`}
                                    >
                                        <Trash2 size={11} /> Remove
                                    </button>
                                </div>
                                <D2DRow listing={p} endpoint={`/supplier/printers/${p.id}`} onChanged={load} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AddPrinterWizard
                open={open}
                editing={editing}
                onClose={() => { setOpen(false); setEditing(null); }}
                onSaved={() => { setOpen(false); setEditing(null); load(); }}
            />
        </div>
    );
}

// ============================================================
// 4-step Add/Edit Printer Wizard
// ============================================================

function AddPrinterWizard({ open, editing, onClose, onSaved }) {
    const [step, setStep] = useState(1);
    const [f, setF] = useState(EMPTY);
    const [imageFiles, setImageFiles] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [existingImages, setExistingImages] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [brands, setBrands] = useState([]);

    useEffect(() => {
        if (!open) return;
        api.get("/compat/brands")
            .then((r) => setBrands(Array.isArray(r.data) ? r.data : []))
            .catch(() => setBrands(["HP", "Canon", "Epson", "Brother", "Ricoh", "Xerox", "Kyocera", "Samsung", "Konica Minolta", "Pantum", "Riso", "Sharp"]));
    }, [open]);

    // Reset whenever the dialog reopens — or prefill when editing
    useEffect(() => {
        if (!open) return;
        setStep(1);
        setImageFiles([]);
        setImagePreviews([]);
        if (editing) {
            setF({
                brand: editing.brand || "",
                model_number: editing.model_number || "",
                description: editing.description || "",
                compatible_models: editing.compatible_models || "",
                image_url: editing.image_url || "",
                image_urls: Array.isArray(editing.image_urls) ? editing.image_urls : (editing.image_url ? [editing.image_url] : []),
                spec_pdf_path: "",
                usage_type: editing.usage_type || "",
                usage_types: Array.isArray(editing.usage_types) && editing.usage_types.length > 0
                    ? editing.usage_types
                    : (editing.usage_type ? [editing.usage_type] : []),
                special_features: Array.isArray(editing.special_features) ? editing.special_features : [],
                gst_rate: editing.gst_rate != null ? Number(editing.gst_rate) : 18,
                category: editing.category || "",
                color: editing.color || "",
                functions: Array.isArray(editing.functions) ? editing.functions : [],
                monthly_volume_min: editing.monthly_volume_min != null ? String(editing.monthly_volume_min) : "",
                monthly_volume_max: editing.monthly_volume_max != null ? String(editing.monthly_volume_max) : "",
                monthly_volume_recommended: editing.monthly_volume_recommended != null ? String(editing.monthly_volume_recommended) : "",
                print_speed_ppm: editing.print_speed_ppm != null ? String(editing.print_speed_ppm) : "",
                duty_cycle: editing.duty_cycle != null ? String(editing.duty_cycle) : "",
                connectivity: Array.isArray(editing.connectivity) ? editing.connectivity : [],
                max_resolution: editing.max_resolution || "",
                paper_sizes: Array.isArray(editing.paper_sizes) ? editing.paper_sizes : [],
                mobile_printing: Array.isArray(editing.mobile_printing) ? editing.mobile_printing : [],
                intercity_delivery_charge: editing.intercity_delivery_charge != null ? String(editing.intercity_delivery_charge) : "0",
                price_type: "incl",
                price: editing.price != null ? String(withGst(Number(editing.price), editing.gst_rate != null ? Number(editing.gst_rate) : 18)) : "",
                stock: editing.stock != null ? String(editing.stock) : "1",
                condition: editing.condition || "new",
            });
            const imgs = Array.isArray(editing.image_urls) ? editing.image_urls.filter(Boolean) : (editing.image_url ? [editing.image_url] : []);
            setExistingImages(imgs);
        } else {
            setF(EMPTY);
            setExistingImages([]);
        }
    }, [open, editing]);

    const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const setVal = (k, v) => setF({ ...f, [k]: v });
    const toggleArr = (k, v) => setF((cur) => ({
        ...cur,
        [k]: (cur[k] || []).includes(v) ? cur[k].filter((x) => x !== v) : [...(cur[k] || []), v],
    }));

    // ---------- Step 1: Basic info ----------
    const onPickFile = (e) => {
        const files = Array.from(e.target.files || []);
        const merged = imageFiles.filter(Boolean);
        for (const file of files) {
            if (merged.length >= 3) break;
            if (file.size > 5 * 1024 * 1024) { toast.error(`"${file.name}" exceeds 5 MB`); continue; }
            if (!file.type.startsWith("image/")) { toast.error(`"${file.name}" is not an image`); continue; }
            merged.push(file);
        }
        setImageFiles(merged);
        setImagePreviews(merged.map((f) => URL.createObjectURL(f)));
        e.target.value = "";
    };
    void onPickFile;
    const removeImage = (idx) => {
        const next = imageFiles.filter((_, i) => i !== idx);
        setImageFiles(next);
        setImagePreviews(next.map((f) => URL.createObjectURL(f)));
    };
    void removeImage;

    const uploadImages = async () => {
        const filesToUpload = imageFiles.filter(Boolean);
        if (!filesToUpload.length) return f.image_urls || [];
        setUploading(true);
        try {
            const out = [];
            for (const file of filesToUpload) {
                const fd = new FormData();
                fd.append("file", file);
                const { data: up } = await api.post("/supplier/printer-image", fd);
                if (up?.url) out.push(up.url);
            }
            return out;
        } finally {
            setUploading(false);
        }
    };

    // ---------- Validation per step ----------
    const canNext = () => {
        if (step === 1) {
            if (!f.brand.trim()) return false;
            if (!f.model_number.trim()) return false;
            const haveImages = imageFiles.length >= 1 || existingImages.length >= 1 || (Array.isArray(f.image_urls) && f.image_urls.length >= 1);
            if (!haveImages) return false;
            return true;
        }
        if (step === 2) {
            if (!f.usage_types || f.usage_types.length === 0) return false;
            if (!f.category) return false;
            if (!f.color) return false;
            if (!f.functions.length) return false;
            const minV = Number(f.monthly_volume_min);
            const maxV = Number(f.monthly_volume_max);
            if (!minV || !maxV || minV < 0 || maxV < minV) return false;
            return true;
        }
        if (step === 3) {
            if (!f.price_type) return false;
            if (!f.price || Number(f.price) <= 0) return false;
            if (f.stock === "" || Number(f.stock) < 0) return false;
            if (!f.condition) return false;
            return true;
        }
        return true;
    };

    const goNext = async () => {
        if (!canNext()) { toast.error("Please complete all required fields (at least 1 image)"); return; }
        if (step === 1 && imageFiles.length > 0) {
            try {
                const urls = await uploadImages();
                const combined = [...existingImages, ...urls];
                if (combined.length < 1) { toast.error("Need at least 1 successfully uploaded image"); return; }
                setF((cur) => ({ ...cur, image_url: combined[0], image_urls: combined }));
                setExistingImages(combined);
                setImageFiles([]);
                setImagePreviews([]);
            } catch (err) {
                toast.error(formatApiError(err) || "Image upload failed");
                return;
            }
        }
        if (step === 2) {
            const usageList = f.usage_types || [];
            const allowed = new Set();
            for (const u of usageList) {
                for (const t of (TECH_BY_USAGE[u] || [])) allowed.add(t.id);
            }
            if (f.category && !allowed.has(f.category)) {
                setF((cur) => ({ ...cur, category: "" }));
                toast.error("Pick a printer technology that matches the selected usage type(s)"); return;
            }
        }
        setStep((s) => Math.min(4, s + 1));
    };

    const goBack = () => setStep((s) => Math.max(1, s - 1));

    const submit = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const payload = {
                brand: f.brand.trim(),
                model_number: f.model_number.trim(),
                description: f.description.trim(),
                compatible_models: (f.compatible_models || "").trim() || null,
                image_url: f.image_url || (f.image_urls && f.image_urls[0]) || null,
                image_urls: f.image_urls || [],
                condition: f.condition,
                usage_type: (f.usage_types && f.usage_types[0]) || f.usage_type || "",
                usage_types: f.usage_types || (f.usage_type ? [f.usage_type] : []),
                special_features: f.special_features || [],
                gst_rate: Number(f.gst_rate ?? 18),
                category: f.category,
                color: f.color,
                functions: f.functions,
                monthly_volume_min: Number(f.monthly_volume_min) || 0,
                monthly_volume_max: Number(f.monthly_volume_max) || 0,
                monthly_volume_recommended: f.monthly_volume_recommended ? Number(f.monthly_volume_recommended) : null,
                print_speed_ppm: f.print_speed_ppm ? Number(f.print_speed_ppm) : null,
                duty_cycle: f.duty_cycle ? Number(f.duty_cycle) : null,
                connectivity: f.connectivity || [],
                max_resolution: f.max_resolution || null,
                paper_sizes: f.paper_sizes || [],
                mobile_printing: f.mobile_printing || [],
                intercity_delivery_charge: parseFloat(f.intercity_delivery_charge || 0) || 0,
                price: getBasePrice(f.price, f.price_type, f.gst_rate),
                stock: parseInt(f.stock || "1", 10),
            };
            if (editing && editing.id) {
                await api.put(`/supplier/printers/${editing.id}`, payload);
                toast.success("Printer updated");
            } else {
                await api.post("/supplier/printers", payload);
                toast.success("Printer listed");
            }
            onSaved();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSaving(false);
        }
    };

    const techOpts = Array.from(new Set((f.usage_types || []).flatMap((u) => (TECH_BY_USAGE[u] || []).map((t) => t.id))))
        .map((id) => ({ id, label: ((Object.values(TECH_BY_USAGE).flat().find((x) => x.id === id) || {}).label) || id }));

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[680px] max-h-[92vh] overflow-y-auto p-8 rounded-[20px] tc-shadow-lg" data-testid="add-printer-dialog">
                <DialogHeader>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3a3a40] hover:text-[#0A0A0B] -ml-1 mb-3 self-start"
                        data-testid="back-to-dashboard-from-printer"
                    >
                        <ChevronLeft size={14} /> Back to Dashboard
                    </button>
                    <DialogTitle className="text-[#0A0A0B] text-[22px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.01em" }}>
                        {editing ? "Edit printer" : "Add a printer"}
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
                                <Label>Product images <span className="text-red-500">*</span> <span className="text-[12px] text-[#86868B] font-normal">(1 required, up to 3)</span></Label>
                                <div className="grid grid-cols-3 gap-3 mt-2" data-testid="printer-image-box-grid">
                                    {[0, 1, 2].map((idx) => {
                                        const newPrev = imagePreviews[idx];
                                        const newFile = imageFiles[idx];
                                        const existing = existingImages[idx];
                                        const src = newPrev || existing;
                                        return (
                                            <label key={idx} className="block cursor-pointer" data-testid={`printer-image-box-${idx}`}>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        if (file.size > 5 * 1024 * 1024) { toast.error(`"${file.name}" exceeds 5 MB`); e.target.value = ""; return; }
                                                        if (!file.type.startsWith("image/")) { toast.error(`"${file.name}" is not an image`); e.target.value = ""; return; }
                                                        const nf = [...imageFiles]; nf[idx] = file; setImageFiles(nf);
                                                        const np = [...imagePreviews]; np[idx] = URL.createObjectURL(file); setImagePreviews(np);
                                                        e.target.value = "";
                                                    }}
                                                    className="hidden"
                                                    data-testid={`printer-image-input-${idx}`}
                                                />
                                                <div className={`relative aspect-square rounded-xl border-2 ${src ? "border-solid border-[#D2D2D7]" : "border-dashed border-[#D2D2D7] hover:border-[#0A0A0B]"} bg-white grid place-items-center overflow-hidden transition`}>
                                                    {src ? (
                                                        <>
                                                            <img src={src} alt={`Printer ${idx + 1}`} className="w-full h-full object-cover" />
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    if (newFile) {
                                                                        const nf = imageFiles.slice(); nf[idx] = undefined; setImageFiles(nf);
                                                                        const np = imagePreviews.slice(); np[idx] = undefined; setImagePreviews(np);
                                                                    } else if (existing) {
                                                                        const ne = existingImages.filter((_, i) => i !== idx);
                                                                        setExistingImages(ne);
                                                                        setF((cur) => ({ ...cur, image_urls: ne, image_url: ne[0] || "" }));
                                                                    }
                                                                }}
                                                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600 text-white grid place-items-center shadow-sm hover:bg-red-700"
                                                                data-testid={`printer-image-remove-${idx}`}
                                                                aria-label="Remove image"
                                                            >
                                                                <XIcon size={13} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1.5 text-[#86868B]">
                                                            <ImageIcon size={20} />
                                                            <span className="text-[11px] font-semibold">{idx === 0 ? "Add photo *" : "Add photo"}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                                <div className="text-[11px] text-[#86868B] mt-1.5">PNG / JPG · max 5 MB each · auto-compressed.</div>
                            </div>
                            <div>
                                <Label>Brand <span className="text-red-500">*</span></Label>
                                <select value={f.brand} onChange={upd("brand")} className="tc-input-lg w-full" data-testid="wizard-brand">
                                    <option value="">Select brand…</option>
                                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Model number <span className="text-red-500">*</span></Label>
                                <PrinterModelSelect
                                    value={f.model_number}
                                    onChange={(v) => setF((cur) => ({ ...cur, model_number: v }))}
                                    onSelect={(p) => setF((cur) => ({ ...cur, model_number: p.model, brand: p.brand }))}
                                    brand={f.brand}
                                    testid="wizard-model"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <Label>Description (optional)</Label>
                                <Textarea rows={3} value={f.description} onChange={upd("description")} placeholder="Highlight key strengths buyers should know…" className="tc-input-lg" data-testid="wizard-description" />
                            </div>
                            <div>
                                <Label>Compatible cartridges / toners (optional)</Label>
                                <CompatibleModelsSelect
                                    mode="toners"
                                    value={f.compatible_models}
                                    onChange={(v) => setF((p) => ({ ...p, compatible_models: v }))}
                                    brand={f.brand}
                                    testid="wizard-compatible-toners"
                                />
                                <MissingModelLink category="printer" brand={f.brand} testidPrefix="printer-missing-model" />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div data-testid="wizard-step-2">
                        <div className="tc-form-section">Specifications</div>
                        <div className="space-y-4">
                            <SpecGroup label="Usage type" required hint="Pick all that apply — your printer will appear in each of these buyer searches">
                                <PillRow
                                    options={USAGE_OPTS}
                                    selected={f.usage_types || []}
                                    onClick={(id) => toggleArr("usage_types", id)}
                                    multi
                                    testKey="usage"
                                />
                            </SpecGroup>

                            <SpecGroup
                                label="Printer technology"
                                required
                                hint={(!f.usage_types || f.usage_types.length === 0) ? "Pick at least one usage type first" : undefined}
                            >
                                <PillRow
                                    options={techOpts}
                                    selected={[f.category]}
                                    onClick={(id) => setVal("category", id)}
                                    disabled={!f.usage_types || f.usage_types.length === 0}
                                    testKey="tech"
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

                            <SpecGroup label="Print speed (PPM)">
                                <Input type="number" min="0" value={f.print_speed_ppm} onChange={upd("print_speed_ppm")} placeholder="e.g. 20" className="tc-input-lg" data-testid="wizard-print-speed" />
                            </SpecGroup>

                            <SpecGroup label="Connectivity">
                                <PillRow
                                    options={CONNECTIVITY_OPTS}
                                    selected={f.connectivity}
                                    onClick={(id) => toggleArr("connectivity", id)}
                                    multi
                                    testKey="connectivity"
                                />
                            </SpecGroup>

                            <SpecGroup label="Maximum print resolution">
                                <select value={f.max_resolution} onChange={upd("max_resolution")} className="tc-input-lg w-full" data-testid="wizard-max-resolution">
                                    <option value="">Select resolution…</option>
                                    {RESOLUTION_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </SpecGroup>

                            <SpecGroup label="Paper sizes supported">
                                <PillRow
                                    options={PAPER_SIZE_OPTS}
                                    selected={f.paper_sizes}
                                    onClick={(id) => toggleArr("paper_sizes", id)}
                                    multi
                                    testKey="paper-size"
                                />
                            </SpecGroup>

                            <SpecGroup label="Mobile printing support">
                                <PillRow
                                    options={MOBILE_PRINT_OPTS}
                                    selected={f.mobile_printing}
                                    onClick={(id) => toggleArr("mobile_printing", id)}
                                    multi
                                    testKey="mobile-print"
                                />
                            </SpecGroup>

                            <SpecGroup label="Special features" hint="Helps your printer match more buyer searches">
                                <PillRow
                                    options={PRINTER_SPECIAL_FEATURES}
                                    selected={f.special_features || []}
                                    onClick={(id) => toggleArr("special_features", id)}
                                    multi
                                    testKey="special-feature"
                                />
                            </SpecGroup>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div data-testid="wizard-step-3">
                        <div className="tc-form-section">Pricing &amp; stock</div>
                        <div className="space-y-3">
                            <div>
                                <Label>Stock quantity <span className="text-red-500">*</span></Label>
                                <Input type="number" min="0" value={f.stock} onChange={upd("stock")} className="tc-input-lg" data-testid="wizard-stock" />
                            </div>
                            <PriceWithGstToggle
                                priceLabel="Price (₹)"
                                required
                                value={f.price}
                                onChange={(v) => setVal("price", v)}
                                priceType={f.price_type}
                                onPriceTypeChange={(t) => setVal("price_type", t)}
                                gstRate={f.gst_rate}
                                onGstRateChange={(r) => setVal("gst_rate", r)}
                                error={!f.price_type && Number(f.price) > 0}
                                testIdPrefix="wizard"
                            />
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
                            <CompetitivePricingNote />
                            <div>
                                <DeliveryPolicyNote />
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
                            {f.image_url || imagePreviews[0] || existingImages[0] ? (
                                <img src={f.image_url || imagePreviews[0] || existingImages[0]} alt="preview" className="w-full h-24 object-contain bg-white rounded-md border border-black/[0.06]" />
                            ) : (
                                <div className="w-full h-24 grid place-items-center bg-white border border-black/[0.06] rounded-md">
                                    <ImageIcon size={22} className="text-[#D2D2D7]" />
                                </div>
                            )}
                            <div>
                                <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">{f.brand}</div>
                                <div className="font-mono text-[16px] font-semibold mt-0.5">{f.model_number}</div>
                                {f.description && <div className="text-[12.5px] text-[#6E6E73] mt-1 line-clamp-2">{f.description}</div>}
                                {(() => {
                                    const typed = Number(f.price || 0);
                                    const buyerSees = f.price_type === "incl" ? Math.round(typed) : withGst(typed, f.gst_rate);
                                    return (
                                        <div className="mt-2 font-mono text-[18px] font-bold" data-testid="wizard-review-price">
                                            ₹{buyerSees.toLocaleString("en-IN")} <span className="text-[11px] text-[#6E6E73] font-normal uppercase tracking-[0.05em]">incl. GST</span>
                                            <span className="text-[12px] text-[#6E6E73] font-normal"> · {f.stock} in stock · {fmt(f.condition)}</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <ReviewRow k="Usage type"      v={(f.usage_types || []).map(fmt).join(", ") || fmt(f.usage_type)} />
                        <ReviewRow k="Technology"      v={fmt(f.category)} />
                        <ReviewRow k="Color"           v={fmt(f.color)} />
                        <ReviewRow k="Functions"       v={(f.functions || []).map(fmt).join(", ") || "—"} />
                        <ReviewRow k="Monthly volume"  v={`${Number(f.monthly_volume_min || 0).toLocaleString("en-IN")} – ${Number(f.monthly_volume_max || 0).toLocaleString("en-IN")} pages`} />
                        <CompetitivePricingNote />
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
                            {saving ? (editing ? "Updating…" : "Publishing…") : <><CheckCircle2 size={14} /> {editing ? "Save changes" : "Publish printer"}</>}
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
