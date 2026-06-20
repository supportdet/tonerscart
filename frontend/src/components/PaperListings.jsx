import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Package, Copy, Check, Pencil, ChevronLeft, ImageIcon, X } from "lucide-react";
import D2DRow from "./D2DRow";
import { withGst } from "../lib/listingConstants";
import PriceWithGstToggle, { getBasePrice } from "./PriceWithGstToggle";
import api, { formatApiError } from "../lib/api";
import CommissionBanner from "./CommissionBanner";
import CompetitivePricingNote from "./CompetitivePricingNote";
import DeliveryPolicyNote from "./DeliveryPolicyNote";
import BulkUploadGeneric from "./BulkUploadGeneric";
import { paperBulkConfig } from "../lib/bulkConfigs";

const SIZES = ["A4", "A3", "A5", "Letter"];
const BRANDS = ["JK Paper", "Century", "TNPL", "Bilt", "Trident", "Ballarpur", "Other"];
const GSMS = [70, 75, 80, 90, 100, 120, 150];

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

function emptyForm() {
    return { brand: "JK Paper", size: "A4", gsm: 75, reams_per_box: 10, price_per_ream: "", stock: "", description: "", brightness: "", thickness_microns: "", acid_free: false, suitable_for: [], gst_rate: 18, price_type: null, warranty: "" };
}

const PAPER_WARRANTIES = ["No warranty", "Batch defect replacement", "30 days", "3 months", "6 months", "1 year"];

export default function PaperListings() {
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
    const openEdit = (p) => {
        setEditingId(p.id);
        const gstRate = p.gst_rate != null ? Number(p.gst_rate) : 18;
        // Default to incl-GST type and pre-fill the input with the buyer-facing
        // price so the dealer immediately sees what's published. They can flip
        // the toggle to "excl" to see the base price instead.
        const inclPrice = p.price_per_ream != null ? withGst(Number(p.price_per_ream), gstRate) : "";
        setForm({
            brand: p.brand || "JK Paper",
            size: p.size || "A4",
            gsm: p.gsm || 75,
            reams_per_box: p.reams_per_box || 10,
            price_per_ream: inclPrice !== "" ? String(inclPrice) : "",
            stock: String(p.stock ?? ""),
            description: p.description || "",
            brightness: p.brightness ? String(p.brightness) : "",
            thickness_microns: p.thickness_microns ? String(p.thickness_microns) : "",
            acid_free: !!p.acid_free,
            suitable_for: Array.isArray(p.suitable_for) ? p.suitable_for : [],
            gst_rate: gstRate,
            price_type: "incl",
            warranty: p.warranty || "",
        });
        setImageFiles([]); setImagePreviews([]);
        setOpen(true);
    };

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
            const { data } = await api.get("/supplier/papers/mine");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    useEffect(() => {
        const fn = () => { openAdd(); };
        window.addEventListener("tc-open-add-paper", fn);
        const bfn = () => setBulkOpen(true);
        window.addEventListener("tc-open-bulk-paper", bfn);
        const efn = () => setEditBulkOpen(true);
        window.addEventListener("tc-open-edit-paper", efn);
        return () => {
            window.removeEventListener("tc-open-add-paper", fn);
            window.removeEventListener("tc-open-bulk-paper", bfn);
            window.removeEventListener("tc-open-edit-paper", efn);
        };
    }, []);

    const [priceTypeError, setPriceTypeError] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.price_type) { setPriceTypeError(true); toast.error("Pick whether the price is Incl. or Excl. GST"); return; }
        setPriceTypeError(false);
        if (!form.price_per_ream || !form.stock) { toast.error("Price and stock are required"); return; }
        if (!form.warranty) { toast.error("Warranty is required"); return; }
        setSaving(true);
        try {
            // Upload any newly-picked images first (service-role proxy → public URL).
            let uploadedUrls = [];
            if (imageFiles.length > 0) {
                for (const file of imageFiles) {
                    const fd = new FormData();
                    fd.append("file", file);
                    const { data } = await api.post("/supplier/listing-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
                    if (data?.url) uploadedUrls.push(data.url);
                }
            }
            const basePrice = getBasePrice(form.price_per_ream, form.price_type, form.gst_rate);
            const payload = {
                brand: form.brand,
                size: form.size,
                gsm: Number(form.gsm),
                reams_per_box: Number(form.reams_per_box),
                price_per_ream: basePrice,
                stock: Number(form.stock),
                description: (form.description || "").trim() || null,
                brightness: form.brightness ? Number(form.brightness) : null,
                thickness_microns: form.thickness_microns ? Number(form.thickness_microns) : null,
                acid_free: !!form.acid_free,
                suitable_for: form.suitable_for || [],
                gst_rate: Number(form.gst_rate || 18),
                warranty: form.warranty,
            };
            if (uploadedUrls.length > 0) {
                payload.image_url = uploadedUrls[0];
                payload.image_urls = uploadedUrls;
            }
            if (editingId) {
                await api.put(`/supplier/papers/${editingId}`, payload);
                toast.success("Paper listing updated");
            } else {
                await api.post("/supplier/papers", payload);
                toast.success("Paper listing added");
            }
            setOpen(false);
            setEditingId(null);
            setForm(emptyForm());
            setImageFiles([]); setImagePreviews([]);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    const remove = async (id) => {
        if (!window.confirm("Remove this paper listing?")) return;
        try { await api.delete(`/supplier/papers/${id}`); toast.success("Removed"); load(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    // Bulk stock + Duplicate (paper) — backend endpoints are tolerant 200/503
    const patchStock = async (id, n) => {
        try {
            await api.put(`/supplier/papers/${id}`, { stock: Number(n) });
            toast.success("Stock updated");
            load();
        } catch (e) {
            // Fallback to delete+recreate not safe — surface the error
            toast.error(formatApiError(e));
        }
    };
    const duplicate = async (p) => {
        try {
            await api.post("/supplier/papers", {
                brand: p.brand,
                size: p.size,
                gsm: p.gsm,
                reams_per_box: p.reams_per_box,
                price_per_ream: p.price_per_ream,
                stock: 1,
            });
            toast.success("Paper listing duplicated");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div data-testid="supplier-papers-section">
            {loading ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">Loading papers…</div>
            ) : rows.length === 0 ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]" data-testid="papers-empty">
                    <Package size={26} className="mx-auto text-[#D2D2D7]" />
                    <div className="mt-2 text-[14px] font-semibold text-[#0A0A0B]">No paper listings yet</div>
                    <div className="mt-1 text-[12.5px]">Tap <span className="font-semibold text-[#0A0A0B]">Add paper</span> to publish your first SKU.</div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="papers-grid">
                    {rows.map((p) => (
                        <div key={p.id} className="tc-product-card p-4" data-testid={`supplier-paper-${p.id}`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">{p.brand}</div>
                                    <div className="text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.size} · {p.gsm} GSM</div>
                                </div>
                                <InlinePaperStock stock={p.stock} onSave={(v) => patchStock(p.id, v)} testId={`paper-stock-${p.id}`} />
                            </div>
                            <div className="mt-3 text-[12.5px] text-[#3a3a40]">
                                <div className="font-mono">{fmtMoney(p.price_per_ream)} / ream</div>
                                <div className="text-[#86868B] text-[11.5px]">{p.reams_per_box} reams/box</div>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                                <button onClick={() => openEdit(p)} className="text-[12px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`edit-paper-${p.id}`}>
                                    <Pencil size={12} /> Edit
                                </button>
                                <button onClick={() => duplicate(p)} className="text-[12px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`duplicate-paper-${p.id}`}>
                                    <Copy size={12} /> Duplicate
                                </button>
                                <button onClick={() => remove(p.id)} className="text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`remove-paper-${p.id}`}>
                                    <Trash2 size={12} /> Remove
                                </button>
                            </div>
                            <D2DRow listing={p} endpoint={`/supplier/papers/${p.id}`} onChanged={load} />
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[560px] max-h-[92vh] overflow-y-auto p-7 rounded-[20px]" data-testid="add-paper-dialog">
                    <DialogHeader>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3a3a40] hover:text-[#0A0A0B] -ml-1 mb-3 self-start"
                            data-testid="back-to-dashboard-from-paper"
                        >
                            <ChevronLeft size={14} /> Back to Dashboard
                        </button>
                        <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>{editingId ? "Edit paper SKU" : "Add a paper SKU"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="mt-2 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Brand</Label>
                                <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="tc-input-lg w-full" data-testid="paper-brand-select">
                                    {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Size</Label>
                                <select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="tc-input-lg w-full" data-testid="paper-size-select">
                                    {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>GSM</Label>
                                <select value={form.gsm} onChange={(e) => setForm({ ...form, gsm: e.target.value })} className="tc-input-lg w-full" data-testid="paper-gsm-select">
                                    {GSMS.map((g) => <option key={g} value={g}>{g} GSM</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Reams per box</Label>
                                <Input type="number" min="1" value={form.reams_per_box} onChange={(e) => setForm({ ...form, reams_per_box: e.target.value })} required className="tc-input-lg" data-testid="paper-reams-input" />
                            </div>
                            <div>
                                <Label>Stock (boxes) <span className="text-red-500">*</span></Label>
                                <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required className="tc-input-lg" data-testid="paper-stock-input" />
                            </div>
                            <div className="col-span-2">
                                <CommissionBanner />
                                <PriceWithGstToggle
                                    priceLabel="Price per ream (₹)"
                                    required
                                    value={form.price_per_ream}
                                    onChange={(v) => setForm({ ...form, price_per_ream: v })}
                                    priceType={form.price_type}
                                    onPriceTypeChange={(t) => { setForm({ ...form, price_type: t }); setPriceTypeError(false); }}
                                    gstRate={form.gst_rate}
                                    onGstRateChange={(r) => setForm({ ...form, gst_rate: r })}
                                    error={priceTypeError && !form.price_type}
                                    testIdPrefix="paper"
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <Label>Description</Label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                rows={2}
                                placeholder="e.g. Premium copier paper, smooth finish, jam-free."
                                className="tc-input-lg w-full resize-none"
                                data-testid="paper-description"
                            />
                        </div>

                        {/* Product images (optional, up to 3) */}
                        <div>
                            <Label>Product images <span className="text-[#86868B] font-normal">(optional, up to 3)</span></Label>
                            <div className="flex flex-wrap items-center gap-3 mt-1" data-testid="paper-images">
                                {imagePreviews.map((src, i) => (
                                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#E5E5EA]">
                                        <img src={src} alt={`preview ${i + 1}`} className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white" data-testid={`paper-image-remove-${i}`} aria-label="Remove image">
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                                {imageFiles.length < 3 && (
                                    <label className="w-20 h-20 rounded-lg border-2 border-dashed border-[#00B7C7]/50 grid place-items-center cursor-pointer hover:border-[#00B7C7] text-[#00B7C7]" data-testid="paper-image-add">
                                        <ImageIcon size={20} />
                                        <input type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
                                    </label>
                                )}
                            </div>
                            <div className="text-[11px] text-[#86868B] mt-1">No image? A themed ream graphic auto-renders on your card.</div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                                <Label>Brightness</Label>
                                <Input type="number" min="50" max="120" value={form.brightness} onChange={(e) => setForm({ ...form, brightness: e.target.value })} placeholder="e.g. 102" className="tc-input-lg" data-testid="paper-brightness" />
                            </div>
                            <div>
                                <Label>Thickness (microns)</Label>
                                <Input type="number" min="0" value={form.thickness_microns} onChange={(e) => setForm({ ...form, thickness_microns: e.target.value })} placeholder="e.g. 110" className="tc-input-lg" data-testid="paper-thickness" />
                            </div>
                        </div>
                        <label className="inline-flex items-center gap-2 text-[13px] text-[#0A0A0B] cursor-pointer mt-1">
                            <input type="checkbox" checked={!!form.acid_free} onChange={(e) => setForm({ ...form, acid_free: e.target.checked })} data-testid="paper-acid-free" />
                            Acid-free paper
                        </label>

                        {/* Warranty / batch QC — Wave 49 required field */}
                        <div data-testid="paper-warranty-wrap">
                            <Label>Warranty <span className="text-red-500">*</span></Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {PAPER_WARRANTIES.map((w) => (
                                    <button
                                        type="button"
                                        key={w}
                                        onClick={() => setForm({ ...form, warranty: w })}
                                        className={`px-3 py-1.5 rounded-full text-[12.5px] border transition ${form.warranty === w ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#E5E5EA] hover:border-[#00B7C7]"}`}
                                        data-testid={`paper-warranty-${w.toLowerCase().replace(/\s+/g, "-")}`}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                            {!form.warranty && (
                                <div className="text-[11.5px] text-red-600 mt-1" data-testid="paper-warranty-error">Required — please select a warranty or batch-QC option.</div>
                            )}
                        </div>
                        <div>
                            <Label>Suitable for</Label>
                            <div className="flex flex-wrap gap-2" data-testid="paper-suitable-for">
                                {["Inkjet", "Laser", "Copier", "All"].map((k) => {
                                    const active = (form.suitable_for || []).includes(k);
                                    return (
                                        <button key={k} type="button" onClick={() => setForm({ ...form, suitable_for: active ? form.suitable_for.filter((x) => x !== k) : [...form.suitable_for, k] })} className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition ${active ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]"}`}>{k}</button>
                                    );
                                })}
                            </div>
                        </div>
                        <DeliveryPolicyNote />
                        <CompetitivePricingNote />
                        <DialogFooter className="mt-3">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                            <Button type="submit" className="btn-pill-cta" disabled={saving} data-testid="paper-save-btn">
                                {saving ? (editingId ? "Updating…" : "Publishing…") : (editingId ? "Save changes" : "Publish paper")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {bulkOpen && (
                <BulkUploadGeneric config={paperBulkConfig} onClose={() => setBulkOpen(false)} onSuccess={load} />
            )}
            {editBulkOpen && (
                <BulkUploadGeneric config={paperBulkConfig} editMode initialRows={rows.map(paperBulkConfig.fromListing)} onClose={() => setEditBulkOpen(false)} onSuccess={load} />
            )}
        </div>
    );
}

function InlinePaperStock({ stock, onSave, testId }) {
    const [editing, setEditing] = React.useState(false);
    const [val, setVal] = React.useState(stock);
    React.useEffect(() => { setVal(stock); }, [stock]);
    const commit = () => {
        const n = Number(val);
        if (Number.isNaN(n) || n < 0) { setVal(stock); setEditing(false); return; }
        if (n !== Number(stock)) onSave(n);
        setEditing(false);
    };
    if (!editing) {
        return (
            <button onClick={() => setEditing(true)} className="text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100" data-testid={testId}>
                {stock} boxes
            </button>
        );
    }
    return (
        <div className="inline-flex items-center gap-1">
            <input
                type="number" min="0" value={val} autoFocus
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setVal(stock); setEditing(false); } }}
                className="h-6 w-14 px-1.5 text-[11px] rounded border border-[#00B7C7] bg-white font-mono"
                data-testid={`${testId}-input`}
            />
            <button onClick={commit} className="h-6 w-6 grid place-items-center rounded bg-emerald-600 text-white" data-testid={`${testId}-save`}>
                <Check size={11} />
            </button>
        </div>
    );
}
