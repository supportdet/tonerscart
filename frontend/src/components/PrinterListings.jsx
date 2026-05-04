import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const USAGE_OPTS = [
    { id: "home", label: "Home" },
    { id: "corporate", label: "Corporate / Office" },
    { id: "commercial", label: "Commercial / Industrial" },
    { id: "print_shop", label: "Print Shop / Copy Center" },
];

const CATEGORY_OPTS = [
    { id: "inkjet", label: "Inkjet" },
    { id: "laser", label: "Laser" },
    { id: "tank", label: "Tank" },
    { id: "thermal", label: "Thermal" },
    { id: "production", label: "Production" },
    { id: "digital_press", label: "Digital Press" },
    { id: "label_barcode", label: "Label / Barcode" },
    { id: "ink", label: "Ink" },
    { id: "other", label: "Other" },
];

const COLOR_OPTS = [
    { id: "color", label: "Color" },
    { id: "bw", label: "Black & White" },
    { id: "both", label: "Both" },
];

const PAPER_SIZES = ["A4", "A3", "SRA3", "A2", "A1", "Roll"];
const CONNECTIVITY = ["Wi-Fi", "USB", "Bluetooth", "Ethernet"];
const FUNCTIONS = [
    { id: "print_only", label: "Print only" },
    { id: "print_scan", label: "Print + Scan" },
    { id: "all_in_one", label: "All-in-one" },
    { id: "high_volume", label: "High-volume" },
];

export default function PrinterListings() {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const empty = {
        brand: "", model_number: "", description: "",
        condition: "new", usage_type: "corporate", category: "laser", color: "color",
        paper_sizes: [], functions: [], connectivity: [], features: [],
        monthly_volume_min: 0, monthly_volume_max: 0,
        price: "", stock: "1",
    };
    const [f, setF] = useState(empty);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState("");

    const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const toggleArr = (k, v) => setF({ ...f, [k]: (f[k] || []).includes(v) ? f[k].filter((x) => x !== v) : [...(f[k] || []), v] });

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/supplier/printers/mine");
            setItems(data || []);
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const onPickFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const reset = () => { setF(empty); setImageFile(null); setImagePreview(""); };
    const openDialog = () => { reset(); setOpen(true); };

    const submit = async (e) => {
        e.preventDefault();
        if (!f.brand.trim() || !f.model_number.trim()) { toast.error("Brand and model are required"); return; }
        if (!f.price || Number(f.price) <= 0) { toast.error("Price is required"); return; }
        if (!imageFile) { toast.error("A product image is required"); return; }
        setSaving(true);
        try {
            // Upload via backend (service role — bypasses storage RLS)
            const fd = new FormData();
            fd.append("file", imageFile);
            const { data: up } = await api.post("/supplier/printer-image", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            const image_url = up.url;
            await api.post("/supplier/printers", {
                brand: f.brand.trim(), model_number: f.model_number.trim(),
                description: f.description.trim(),
                image_url,
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
            setOpen(false);
            reset();
            load();
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setSaving(false); }
    };

    const remove = async (id) => {
        if (!window.confirm("Remove this printer listing?")) return;
        try { await api.delete(`/supplier/printers/${id}`); toast.success("Removed"); load(); }
        catch (err) { toast.error(formatApiError(err)); }
    };

    return (
        <div data-testid="printer-listings-section">
            <div className="flex items-center justify-between mb-4">
                <div className="text-[12px] text-[#6E6E73]">{items.length} {items.length === 1 ? "printer" : "printers"} listed</div>
                <Button className="btn-cta inline-flex items-center gap-2" onClick={openDialog} data-testid="add-printer-btn">
                    <Plus size={14} /> Add printer
                </Button>
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
                        <div key={p.id} className="bg-white border border-black/[0.06] rounded-xl overflow-hidden" data-testid={`printer-listing-${p.id}`}>
                            <div className="bg-black/[0.03] aspect-[4/3] grid place-items-center">
                                {p.image_url
                                    ? <img src={p.image_url} alt="" className="w-full h-full object-contain" loading="lazy" />
                                    : <ImageIcon size={32} className="text-[#D2D2D7]" />}
                            </div>
                            <div className="p-4 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-[0.08em] ${p.condition === "new" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                                        {p.condition === "new" ? "New" : "Refurbished"}
                                    </span>
                                    <span className="text-[10px] text-[#86868B]">{p.usage_type} · {p.category}</span>
                                </div>
                                <div className="font-mono text-[14px] font-semibold text-[#0A0A0B]">{p.brand} · {p.model_number}</div>
                                <div className="flex items-center justify-between">
                                    <div className="font-mono text-[16px] font-semibold text-[#0A0A0B]">₹{Number(p.price).toLocaleString("en-IN")}</div>
                                    <div className="text-[12px] text-[#6E6E73]">Stock: <span className="font-mono font-semibold text-[#0A0A0B]">{p.stock}</span></div>
                                </div>
                                <button onClick={() => remove(p.id)} className="mt-1 text-[11.5px] text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`remove-printer-${p.id}`}>
                                    <Trash2 size={11} /> Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="add-printer-dialog">
                    <DialogHeader><DialogTitle className="text-[#0A0A0B]">Add a printer</DialogTitle></DialogHeader>
                    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                            <Label>Product image *</Label>
                            <label className="block mt-1 cursor-pointer">
                                <input type="file" accept="image/*" onChange={onPickFile} className="hidden" data-testid="printer-image-input" />
                                <div className={`border-2 border-dashed rounded-lg px-4 py-6 text-center transition ${imagePreview ? "border-emerald-300 bg-emerald-50" : "border-[#D2D2D7] hover:border-[#86868B]"}`}>
                                    {imagePreview
                                        ? <img src={imagePreview} alt="preview" className="max-h-32 mx-auto rounded" />
                                        : <div className="text-[#6E6E73] text-[13px] flex items-center justify-center gap-2"><ImageIcon size={16} /> Click to upload (required, max 5 MB)</div>}
                                </div>
                            </label>
                        </div>
                        <div><Label>Brand *</Label><Input value={f.brand} onChange={upd("brand")} placeholder="HP, Canon, Epson…" required data-testid="printer-brand" /></div>
                        <div><Label>Model number *</Label><Input value={f.model_number} onChange={upd("model_number")} placeholder="M1138w, LBP2900B…" required data-testid="printer-model" /></div>
                        <div>
                            <Label>Condition *</Label>
                            <select value={f.condition} onChange={upd("condition")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="printer-condition">
                                <option value="new">Brand New</option>
                                <option value="refurbished">Refurbished</option>
                            </select>
                        </div>
                        <div>
                            <Label>Usage *</Label>
                            <select value={f.usage_type} onChange={upd("usage_type")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="printer-usage">
                                {USAGE_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Category *</Label>
                            <select value={f.category} onChange={upd("category")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="printer-category">
                                {CATEGORY_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Color *</Label>
                            <select value={f.color} onChange={upd("color")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="printer-color">
                                {COLOR_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Paper sizes</Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {PAPER_SIZES.map((p) => (
                                    <button key={p} type="button" onClick={() => toggleArr("paper_sizes", p)}
                                        className={`px-3 py-1.5 rounded-full border text-[12.5px] ${f.paper_sizes.includes(p) ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7]"}`}
                                        data-testid={`printer-paper-${p}`}>{p}</button>
                                ))}
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Functions</Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {FUNCTIONS.map((fn) => (
                                    <button key={fn.id} type="button" onClick={() => toggleArr("functions", fn.id)}
                                        className={`px-3 py-1.5 rounded-full border text-[12.5px] ${f.functions.includes(fn.id) ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7]"}`}
                                        data-testid={`printer-function-${fn.id}`}>{fn.label}</button>
                                ))}
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Connectivity</Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {CONNECTIVITY.map((c) => (
                                    <button key={c} type="button" onClick={() => toggleArr("connectivity", c)}
                                        className={`px-3 py-1.5 rounded-full border text-[12.5px] ${f.connectivity.includes(c) ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7]"}`}
                                        data-testid={`printer-conn-${c}`}>{c}</button>
                                ))}
                            </div>
                        </div>
                        <div><Label>Monthly volume min</Label><Input type="number" min="0" value={f.monthly_volume_min} onChange={upd("monthly_volume_min")} data-testid="printer-vol-min" /></div>
                        <div><Label>Monthly volume max</Label><Input type="number" min="0" value={f.monthly_volume_max} onChange={upd("monthly_volume_max")} data-testid="printer-vol-max" /></div>
                        <div><Label>Price (₹) *</Label><Input type="number" min="0" step="0.01" value={f.price} onChange={upd("price")} required data-testid="printer-price" /></div>
                        <div><Label>Stock *</Label><Input type="number" min="0" value={f.stock} onChange={upd("stock")} required data-testid="printer-stock" /></div>
                        <div className="sm:col-span-2"><Label>Description (optional)</Label><Textarea rows={2} value={f.description} onChange={upd("description")} data-testid="printer-description" /></div>

                        <DialogFooter className="sm:col-span-2 mt-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="printer-cancel-btn">Cancel</Button>
                            <Button type="submit" className="btn-cta" disabled={saving} data-testid="printer-save-btn">{saving ? "Saving…" : "Publish printer"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
