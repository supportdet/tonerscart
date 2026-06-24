import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Trash2, Boxes, Pencil, ChevronLeft, ImageIcon, X } from "lucide-react";
import { withGst } from "../lib/listingConstants";
import PriceWithGstToggle, { getBasePrice } from "./PriceWithGstToggle";
import api, { formatApiError } from "../lib/api";
import CompetitivePricingNote from "./CompetitivePricingNote";
import DeliveryPolicyNote from "./DeliveryPolicyNote";
import BulkUploadGeneric from "./BulkUploadGeneric";
import { consumableBulkConfig } from "../lib/bulkConfigs";
import CompatibleModelsSelect from "./CompatibleModelsSelect";
import MissingModelLink from "./MissingModelLink";
import { CONSUMABLE_SUBCATEGORIES, CONSUMABLE_CONDITIONS } from "../lib/consumableConstants";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

function emptyForm() {
    return {
        subcategory: "Ink Cartridges", subcategory_other: "", brand: "", model_number: "",
        compatible_models: "", condition: "New", price: "", gst_rate: 18, price_type: null, stock: "", description: "",
        warranty: "1 Year", page_yield: "", cartridge_weight: "",
    };
}

const CONSUMABLE_WARRANTIES = ["1 Year", "2 Years", "3 Years", "On-site", "Carry-in", "No Warranty"];

export default function ConsumableListings() {
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
    const openEdit = (c) => {
        setEditingId(c.id);
        const gstRate = c.gst_rate != null ? Number(c.gst_rate) : 18;
        const inclPrice = c.price != null ? withGst(Number(c.price), gstRate) : "";
        setForm({
            subcategory: c.subcategory || "Ink Cartridges",
            subcategory_other: c.subcategory_other || "",
            brand: c.brand || "",
            model_number: c.model_number || "",
            compatible_models: c.compatible_models || "",
            condition: c.condition || "New",
            price: inclPrice !== "" ? String(inclPrice) : "",
            gst_rate: gstRate,
            price_type: "incl",
            stock: String(c.stock ?? ""),
            description: c.description || "",
            warranty: c.warranty || "1 Year",
            page_yield: c.page_yield != null ? String(c.page_yield) : "",
            cartridge_weight: c.cartridge_weight != null ? String(c.cartridge_weight) : "",
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
            const { data } = await api.get("/supplier/consumables/mine");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    useEffect(() => {
        const fn = () => openAdd();
        window.addEventListener("tc-open-add-consumable", fn);
        const bfn = () => setBulkOpen(true);
        window.addEventListener("tc-open-bulk-consumable", bfn);
        const efn = () => setEditBulkOpen(true);
        window.addEventListener("tc-open-edit-consumable", efn);
        return () => {
            window.removeEventListener("tc-open-add-consumable", fn);
            window.removeEventListener("tc-open-bulk-consumable", bfn);
            window.removeEventListener("tc-open-edit-consumable", efn);
        };
    }, []);

    const [priceTypeError, setPriceTypeError] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.brand.trim() || !form.model_number.trim()) { toast.error("Brand and model are required"); return; }
        if (!form.price_type) { setPriceTypeError(true); toast.error("Pick whether the price is Incl. or Excl. GST"); return; }
        setPriceTypeError(false);
        if (!form.price || !form.stock) { toast.error("Price and stock are required"); return; }
        if (form.subcategory === "Other" && !form.subcategory_other.trim()) { toast.error("Please specify the consumable type"); return; }
        // Wave 73 — warranty + cartridge_weight + page_yield no longer block.
        // Defaults are applied when payload is built below.
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
                subcategory: form.subcategory,
                subcategory_other: form.subcategory === "Other" ? form.subcategory_other.trim() : null,
                brand: form.brand.trim(),
                model_number: form.model_number.trim(),
                compatible_models: (form.compatible_models || "").trim() || null,
                condition: form.condition || "New",
                price: basePrice,
                gst_rate: Number(form.gst_rate || 18),
                stock: Number(form.stock),
                description: (form.description || "").trim() || null,
                warranty: form.warranty || "1 Year",
                page_yield: form.page_yield ? parseInt(form.page_yield, 10) : null,
                cartridge_weight: form.cartridge_weight ? parseInt(form.cartridge_weight, 10) : null,
            };
            if (uploadedUrls.length > 0) {
                payload.image_url = uploadedUrls[0];
                payload.image_urls = uploadedUrls;
            }
            if (editingId) {
                await api.put(`/supplier/consumables/${editingId}`, payload);
                toast.success("Consumable updated");
            } else {
                await api.post("/supplier/consumables", payload);
                toast.success("Consumable listed");
            }
            setOpen(false); setEditingId(null); setForm(emptyForm());
            setImageFiles([]); setImagePreviews([]);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    const remove = async (id) => {
        if (!window.confirm("Remove this consumable listing?")) return;
        try { await api.delete(`/supplier/consumables/${id}`); toast.success("Removed"); load(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div data-testid="supplier-consumables-section">
            {loading ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">Loading consumables…</div>
            ) : rows.length === 0 ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]" data-testid="consumables-empty">
                    <Boxes size={26} className="mx-auto text-[#D2D2D7]" />
                    <div className="mt-2 text-[14px] font-semibold text-[#0A0A0B]">No consumable listings yet</div>
                    <div className="mt-1 text-[12.5px]">Tap <span className="font-semibold text-[#0A0A0B]">Add consumable</span> to publish your first SKU.</div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="consumables-grid">
                    {rows.map((c) => (
                        <div key={c.id} className="tc-product-card p-4" data-testid={`supplier-consumable-${c.id}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">{c.brand}</div>
                                    <div className="text-[15px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>{c.model_number}</div>
                                </div>
                                <span className="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-md border bg-[#FFF8E0] text-[#8C6A00] border-[#F5E5A6] uppercase shrink-0">{c.subcategory === "Other" && c.subcategory_other ? c.subcategory_other : c.subcategory}</span>
                            </div>
                            <div className="mt-3 text-[12.5px] text-[#3a3a40]">
                                <div className="font-mono">{fmtMoney(c.price)}</div>
                                <div className="text-[#86868B] text-[11.5px]">{c.stock} in stock · {c.condition || "New"}</div>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                                <button onClick={() => openEdit(c)} className="text-[12px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`edit-consumable-${c.id}`}>
                                    <Pencil size={12} /> Edit
                                </button>
                                <button onClick={() => remove(c.id)} className="text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`remove-consumable-${c.id}`}>
                                    <Trash2 size={12} /> Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[560px] max-h-[92vh] overflow-y-auto p-7 rounded-[20px]" data-testid="add-consumable-dialog">
                    <DialogHeader>
                        <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3a3a40] hover:text-[#0A0A0B] -ml-1 mb-3 self-start" data-testid="back-to-dashboard-from-consumable">
                            <ChevronLeft size={14} /> Back to Dashboard
                        </button>
                        <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>{editingId ? "Edit consumable" : "Add a consumable"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="mt-2 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Subcategory <span className="text-red-500">*</span></Label>
                                <select value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} className="tc-input-lg w-full" data-testid="consumable-subcategory-select">
                                    {CONSUMABLE_SUBCATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Condition</Label>
                                <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="tc-input-lg w-full" data-testid="consumable-condition-select">
                                    {CONSUMABLE_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            {form.subcategory === "Other" && (
                                <div className="col-span-2">
                                    <Label>Specify type <span className="text-red-500">*</span></Label>
                                    <Input value={form.subcategory_other} onChange={(e) => setForm({ ...form, subcategory_other: e.target.value })} placeholder="e.g. Waste toner box" className="tc-input-lg" data-testid="consumable-subcategory-other" />
                                </div>
                            )}
                            <div>
                                <Label>Brand <span className="text-red-500">*</span></Label>
                                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required placeholder="Brother" className="tc-input-lg" data-testid="consumable-brand-input" />
                            </div>
                            <div>
                                <Label>Model number <span className="text-red-500">*</span></Label>
                                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} required placeholder="DR-2305" className="tc-input-lg" data-testid="consumable-model-input" />
                            </div>
                            <div className="col-span-2">
                                <Label>Suitable for</Label>
                                <CompatibleModelsSelect
                                    mode="printers"
                                    value={form.compatible_models}
                                    onChange={(v) => setForm({ ...form, compatible_models: v })}
                                    brand={form.brand}
                                    testid="consumable-compatible"
                                />
                                <MissingModelLink category="consumable" brand={form.brand} testidPrefix="consumable-missing-model" />
                            </div>
                            <div>
                                <Label>Stock <span className="text-red-500">*</span></Label>
                                <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required className="tc-input-lg" data-testid="consumable-stock-input" />
                            </div>
                            <div className="col-span-2">
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
                                    testIdPrefix="consumable"
                                />
                            </div>
                            <div>
                                <Label>Page yield (sheets){form.subcategory === "Ink Cartridges" && <span className="text-red-500"> *</span>}</Label>
                                <Input type="number" min="1" step="1" value={form.page_yield}
                                    onChange={(e) => setForm({ ...form, page_yield: e.target.value })}
                                    required={form.subcategory === "Ink Cartridges"} placeholder="e.g. 1500"
                                    className="tc-input-lg" data-testid="consumable-page-yield" />
                                {form.subcategory !== "Ink Cartridges" && (
                                    <div className="text-[11px] text-[#86868B] mt-0.5">Optional for {form.subcategory.toLowerCase()}.</div>
                                )}
                            </div>
                            <div>
                                <Label>Cartridge weight (g) <span className="text-[#86868B] font-normal">(optional)</span></Label>
                                <Input type="number" min="1" step="1" value={form.cartridge_weight}
                                    onChange={(e) => setForm({ ...form, cartridge_weight: e.target.value })}
                                    placeholder="e.g. 120"
                                    className="tc-input-lg" data-testid="consumable-cartridge-weight" />
                            </div>
                            <div className="col-span-2">
                                <Label>Warranty</Label>
                                <div className="flex flex-wrap gap-2 mt-1" data-testid="consumable-warranty-pills">
                                    {CONSUMABLE_WARRANTIES.map((w) => (
                                        <button
                                            type="button"
                                            key={w}
                                            onClick={() => setForm({ ...form, warranty: w })}
                                            className={`px-3 py-1.5 rounded-full text-[12.5px] border transition ${form.warranty === w ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#E5E5EA] hover:border-[#00B7C7]"}`}
                                            data-testid={`consumable-warranty-${w.toLowerCase().replace(/\s+/g, "-")}`}
                                        >
                                            {w}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <Label>Description</Label>
                            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="e.g. Genuine drum unit, 12000-page yield." className="tc-input-lg w-full resize-none" data-testid="consumable-description" />
                        </div>

                        <div>
                            <Label>Product images <span className="text-[#86868B] font-normal">(optional, up to 3)</span></Label>
                            <div className="flex flex-wrap items-center gap-3 mt-1" data-testid="consumable-images">
                                {imagePreviews.map((src, i) => (
                                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#E5E5EA]">
                                        <img src={src} alt={`preview ${i + 1}`} className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white" aria-label="Remove image">
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                                {imageFiles.length < 3 && (
                                    <label className="w-20 h-20 rounded-lg border-2 border-dashed border-[#00B7C7]/50 grid place-items-center cursor-pointer hover:border-[#00B7C7] text-[#00B7C7]" data-testid="consumable-image-add">
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
                            <Button type="submit" className="btn-pill-cta" disabled={saving} data-testid="consumable-save-btn">
                                {saving ? (editingId ? "Updating…" : "Publishing…") : (editingId ? "Save changes" : "Publish consumable")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {bulkOpen && (
                <BulkUploadGeneric config={consumableBulkConfig} onClose={() => setBulkOpen(false)} onSuccess={load} />
            )}
            {editBulkOpen && (
                <BulkUploadGeneric config={consumableBulkConfig} editMode initialRows={rows.map(consumableBulkConfig.fromListing)} onClose={() => setEditBulkOpen(false)} onSuccess={load} />
            )}
        </div>
    );
}
