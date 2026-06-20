import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Trash2, ScanLine, Pencil, ChevronLeft, ImageIcon, X } from "lucide-react";
import { withGst, PRINTER_TONER_BRANDS } from "../lib/listingConstants";
import PriceWithGstToggle, { getBasePrice } from "./PriceWithGstToggle";
import api, { formatApiError } from "../lib/api";
import CommissionBanner from "./CommissionBanner";
import CompetitivePricingNote from "./CompetitivePricingNote";
import DeliveryPolicyNote from "./DeliveryPolicyNote";
import BulkUploadGeneric from "./BulkUploadGeneric";
import { scannerBulkConfig } from "../lib/bulkConfigs";
import {
    SCANNER_TYPES, SCANNER_CONDITIONS, SCANNER_RESOLUTIONS,
    SCANNER_CONNECTIVITY, SCANNER_COLOR_MODES, SCANNER_WARRANTIES,
} from "../lib/scannerConstants";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

function emptyForm() {
    return {
        brand: "", model_number: "", scanner_type: "Flatbed", condition: "New",
        scan_resolution: "1200dpi", connectivity: [], scan_speed_ppm: "", color_mode: "Color",
        warranty: "No warranty", price: "", gst_rate: 18, price_type: null, stock: "", description: "",
    };
}

export default function ScannerListings() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [editingId, setEditingId] = useState(null);
    const [imageFiles, setImageFiles] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [editBulkOpen, setEditBulkOpen] = useState(false);

    const openAdd = () => { setEditingId(null); setForm(emptyForm()); setImageFiles([]); setImagePreviews([]); setOpen(true); };
    const openEdit = (s) => {
        setEditingId(s.id);
        const gstRate = s.gst_rate != null ? Number(s.gst_rate) : 18;
        const inclPrice = s.price != null ? withGst(Number(s.price), gstRate) : "";
        setForm({
            brand: s.brand || "",
            model_number: s.model_number || "",
            scanner_type: s.scanner_type || "Flatbed",
            condition: s.condition || "New",
            scan_resolution: s.scan_resolution || "1200dpi",
            connectivity: Array.isArray(s.connectivity) ? s.connectivity : [],
            scan_speed_ppm: s.scan_speed_ppm != null ? String(s.scan_speed_ppm) : "",
            color_mode: s.color_mode || "Color",
            warranty: s.warranty || "No warranty",
            price: inclPrice !== "" ? String(inclPrice) : "",
            gst_rate: gstRate,
            price_type: "incl",
            stock: String(s.stock ?? ""),
            description: s.description || "",
        });
        setImageFiles([]); setImagePreviews([]);
        setOpen(true);
    };

    const toggleConn = (c) => setForm((f) => ({
        ...f,
        connectivity: f.connectivity.includes(c) ? f.connectivity.filter((x) => x !== c) : [...f.connectivity, c],
    }));

    const onPickImages = (e) => {
        const files = Array.from(e.target.files || []);
        const merged = [...imageFiles];
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
    const removeImage = (idx) => {
        const next = imageFiles.filter((_, i) => i !== idx);
        setImageFiles(next);
        setImagePreviews(next.map((f) => URL.createObjectURL(f)));
    };

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/supplier/scanners/mine");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    useEffect(() => {
        const fn = () => openAdd();
        window.addEventListener("tc-open-add-scanner", fn);
        const bfn = () => setBulkOpen(true);
        window.addEventListener("tc-open-bulk-scanner", bfn);
        const efn = () => setEditBulkOpen(true);
        window.addEventListener("tc-open-edit-scanner", efn);
        return () => {
            window.removeEventListener("tc-open-add-scanner", fn);
            window.removeEventListener("tc-open-bulk-scanner", bfn);
            window.removeEventListener("tc-open-edit-scanner", efn);
        };
    }, []);

    const [priceTypeError, setPriceTypeError] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.brand.trim() || !form.model_number.trim()) { toast.error("Brand and model are required"); return; }
        if (!form.price_type) { setPriceTypeError(true); toast.error("Pick whether the price is Incl. or Excl. GST"); return; }
        setPriceTypeError(false);
        if (!form.price || !form.stock) { toast.error("Price and stock are required"); return; }
        setSaving(true);
        try {
            let uploadedUrls = [];
            if (imageFiles.length > 0) {
                for (const file of imageFiles) {
                    const fd = new FormData();
                    fd.append("file", file);
                    const { data } = await api.post("/supplier/listing-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
                    if (data?.url) uploadedUrls.push(data.url);
                }
            }
            const basePrice = getBasePrice(form.price, form.price_type, form.gst_rate);
            const payload = {
                brand: form.brand.trim(),
                model_number: form.model_number.trim(),
                scanner_type: form.scanner_type || "Flatbed",
                condition: form.condition || "New",
                scan_resolution: form.scan_resolution || null,
                connectivity: form.connectivity,
                scan_speed_ppm: form.scan_speed_ppm !== "" ? Number(form.scan_speed_ppm) : null,
                color_mode: form.color_mode || "Color",
                warranty: form.warranty || "No warranty",
                price: basePrice,
                gst_rate: Number(form.gst_rate || 18),
                stock: Number(form.stock),
                description: (form.description || "").trim() || null,
            };
            if (uploadedUrls.length > 0) {
                payload.image_url = uploadedUrls[0];
                payload.image_urls = uploadedUrls;
            }
            if (editingId) {
                await api.put(`/supplier/scanners/${editingId}`, payload);
                toast.success("Scanner updated");
            } else {
                await api.post("/supplier/scanners", payload);
                toast.success("Scanner listed");
            }
            setOpen(false); setEditingId(null); setForm(emptyForm());
            setImageFiles([]); setImagePreviews([]);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    const remove = async (id) => {
        if (!window.confirm("Remove this scanner listing?")) return;
        try { await api.delete(`/supplier/scanners/${id}`); toast.success("Removed"); load(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div data-testid="supplier-scanners-section">
            {loading ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">Loading scanners…</div>
            ) : rows.length === 0 ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]" data-testid="scanners-empty">
                    <ScanLine size={26} className="mx-auto text-[#D2D2D7]" />
                    <div className="mt-2 text-[14px] font-semibold text-[#0A0A0B]">No scanner listings yet</div>
                    <div className="mt-1 text-[12.5px]">Tap <span className="font-semibold text-[#0A0A0B]">Add scanner</span> to publish your first SKU.</div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="scanners-grid">
                    {rows.map((s) => (
                        <div key={s.id} className="tc-product-card p-4" data-testid={`supplier-scanner-${s.id}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">{s.brand}</div>
                                    <div className="text-[15px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>{s.model_number}</div>
                                </div>
                                <span className="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-md border bg-[#EAF6FF] text-[#0369A1] border-[#BFE3FB] uppercase shrink-0">{s.scanner_type}</span>
                            </div>
                            <div className="mt-3 text-[12.5px] text-[#3a3a40]">
                                <div className="font-mono">{fmtMoney(s.price)}</div>
                                <div className="text-[#86868B] text-[11.5px]">{s.stock} in stock · {s.condition || "New"}{s.scan_resolution ? ` · ${s.scan_resolution}` : ""}</div>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                                <button onClick={() => openEdit(s)} className="text-[12px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`edit-scanner-${s.id}`}>
                                    <Pencil size={12} /> Edit
                                </button>
                                <button onClick={() => remove(s.id)} className="text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`remove-scanner-${s.id}`}>
                                    <Trash2 size={12} /> Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[560px] max-h-[92vh] overflow-y-auto p-7 rounded-[20px]" data-testid="add-scanner-dialog">
                    <DialogHeader>
                        <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3a3a40] hover:text-[#0A0A0B] -ml-1 mb-3 self-start" data-testid="back-to-dashboard-from-scanner">
                            <ChevronLeft size={14} /> Back to Dashboard
                        </button>
                        <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>{editingId ? "Edit scanner" : "Add a scanner"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="mt-2 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Brand <span className="text-red-500">*</span></Label>
                                <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="tc-input-lg w-full" data-testid="scanner-brand-select">
                                    <option value="">Select brand</option>
                                    {PRINTER_TONER_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Model number <span className="text-red-500">*</span></Label>
                                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} required placeholder="CanoScan LiDE 400" className="tc-input-lg" data-testid="scanner-model-input" />
                            </div>
                            <div>
                                <Label>Scanner type <span className="text-red-500">*</span></Label>
                                <select value={form.scanner_type} onChange={(e) => setForm({ ...form, scanner_type: e.target.value })} className="tc-input-lg w-full" data-testid="scanner-type-select">
                                    {SCANNER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Condition</Label>
                                <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="tc-input-lg w-full" data-testid="scanner-condition-select">
                                    {SCANNER_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Scanning resolution</Label>
                                <select value={form.scan_resolution} onChange={(e) => setForm({ ...form, scan_resolution: e.target.value })} className="tc-input-lg w-full" data-testid="scanner-resolution-select">
                                    {SCANNER_RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Color / Mono</Label>
                                <select value={form.color_mode} onChange={(e) => setForm({ ...form, color_mode: e.target.value })} className="tc-input-lg w-full" data-testid="scanner-colormode-select">
                                    {SCANNER_COLOR_MODES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="col-span-2">
                                <Label>Connectivity</Label>
                                <div className="flex flex-wrap gap-2 mt-1" data-testid="scanner-connectivity">
                                    {SCANNER_CONNECTIVITY.map((c) => (
                                        <button
                                            type="button"
                                            key={c}
                                            onClick={() => toggleConn(c)}
                                            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition ${form.connectivity.includes(c) ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]"}`}
                                            data-testid={`scanner-conn-${c.toLowerCase()}`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Label>Scanning speed (ppm)</Label>
                                <Input type="number" min="0" step="0.1" value={form.scan_speed_ppm} onChange={(e) => setForm({ ...form, scan_speed_ppm: e.target.value })} placeholder="8" className="tc-input-lg" data-testid="scanner-speed-input" />
                            </div>
                            <div>
                                <Label>Warranty</Label>
                                <select value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} className="tc-input-lg w-full" data-testid="scanner-warranty-select">
                                    {SCANNER_WARRANTIES.map((w) => <option key={w} value={w}>{w}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Stock <span className="text-red-500">*</span></Label>
                                <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required className="tc-input-lg" data-testid="scanner-stock-input" />
                            </div>
                            <div className="col-span-2">
                                <CommissionBanner />
                                <PriceWithGstToggle
                                    priceLabel="Price (₹)"
                                    required
                                    value={form.price}
                                    onChange={(v) => setForm({ ...form, price: v })}
                                    priceType={form.price_type}
                                    onPriceTypeChange={(t) => { setForm({ ...form, price_type: t }); setPriceTypeError(false); }}
                                    gstRate={form.gst_rate}
                                    onGstRateChange={(r) => setForm({ ...form, gst_rate: r })}
                                    error={priceTypeError && !form.price_type}
                                    testIdPrefix="scanner"
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Description</Label>
                            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="e.g. Compact flatbed scanner, 4800 dpi optical resolution." className="tc-input-lg w-full resize-none" data-testid="scanner-description" />
                        </div>

                        <div>
                            <Label>Product images <span className="text-[#86868B] font-normal">(optional, up to 3)</span></Label>
                            <div className="flex flex-wrap items-center gap-3 mt-1" data-testid="scanner-images">
                                {imagePreviews.map((src, i) => (
                                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#E5E5EA]">
                                        <img src={src} alt={`preview ${i + 1}`} className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white" aria-label="Remove image">
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                                {imageFiles.length < 3 && (
                                    <label className="w-20 h-20 rounded-lg border-2 border-dashed border-[#00B7C7]/50 grid place-items-center cursor-pointer hover:border-[#00B7C7] text-[#00B7C7]" data-testid="scanner-image-add">
                                        <ImageIcon size={20} />
                                        <input type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
                                    </label>
                                )}
                            </div>
                        </div>

                        <DeliveryPolicyNote />
                        <CompetitivePricingNote />
                        <DialogFooter className="mt-3">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                            <Button type="submit" className="btn-pill-cta" disabled={saving} data-testid="scanner-save-btn">
                                {saving ? (editingId ? "Updating…" : "Publishing…") : (editingId ? "Save changes" : "Publish scanner")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {bulkOpen && (
                <BulkUploadGeneric config={scannerBulkConfig} onClose={() => setBulkOpen(false)} onSuccess={load} />
            )}
            {editBulkOpen && (
                <BulkUploadGeneric config={scannerBulkConfig} editMode initialRows={rows.map(scannerBulkConfig.fromListing)} onClose={() => setEditBulkOpen(false)} onSuccess={load} />
            )}
        </div>
    );
}
