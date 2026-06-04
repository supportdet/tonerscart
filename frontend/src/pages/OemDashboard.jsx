import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageMeta from "../components/PageMeta";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Loader2, Plus, Pencil, Trash2, BadgeCheck, Package, Eye, EyeOff, Upload } from "lucide-react";

const CATEGORIES = [
    { value: "toner", label: "Toner" },
    { value: "printer", label: "Printer" },
    { value: "paper", label: "Paper" },
    { value: "other", label: "Other" },
];
const EMPTY = { name: "", category: "toner", model_number: "", description: "", image_url: "", moq: "", price_note: "" };

export default function OemDashboard() {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const [partner, setPartner] = useState(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [editing, setEditing] = useState(null); // product or {} for new
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [confirmDel, setConfirmDel] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [me, prods] = await Promise.all([
                api.get("/oem/me"),
                api.get("/oem/products"),
            ]);
            setPartner(me.data);
            setProducts(prods.data || []);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user || user.role !== "oem") { navigate("/login"); return; }
        load();
    }, [authLoading, user, navigate, load]);

    const openNew = () => { setForm(EMPTY); setEditing({}); };
    const openEdit = (p) => {
        setForm({ name: p.name || "", category: p.category || "toner", model_number: p.model_number || "", description: p.description || "", image_url: p.image_url || "", moq: p.moq || "", price_note: p.price_note || "" });
        setEditing(p);
    };

    const onUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post("/oem/product-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setForm((f) => ({ ...f, image_url: data.url }));
            toast.success("Image uploaded");
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setUploading(false);
        }
    };

    const save = async () => {
        if (!form.name.trim()) { toast.error("Product name is required"); return; }
        setSaving(true);
        try {
            if (editing && editing.id) {
                await api.patch(`/oem/products/${editing.id}`, form);
                toast.success("Product updated");
            } else {
                await api.post("/oem/products", form);
                toast.success("Product added");
            }
            setEditing(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (p) => {
        try {
            await api.patch(`/oem/products/${p.id}`, { is_active: !p.is_active });
            setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x)));
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const doDelete = async () => {
        if (!confirmDel) return;
        try {
            await api.delete(`/oem/products/${confirmDel.id}`);
            toast.success("Product removed");
            setConfirmDel(null);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    if (authLoading || loading) {
        return <div className="min-h-[60vh] flex items-center justify-center text-[#6E6E73] gap-2"><Loader2 className="animate-spin" size={18} /> Loading…</div>;
    }

    return (
        <div className="bg-[#F5F5F7] min-h-screen" data-testid="oem-dashboard">
            <PageMeta title="OEM Dashboard · TonersCart" description="Manage your OEM showcase products." />
            <div className="tc-container max-w-[1100px] py-8 sm:py-10">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-[24px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }} data-testid="oem-dash-brand">{partner?.brand || "OEM"}</h1>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-100"><BadgeCheck size={12} /> Official Brand</span>
                        </div>
                        <p className="text-[13px] text-[#6E6E73] mt-0.5">{partner?.company} · Showcase products on the OEM Marketplace</p>
                    </div>
                    <Button onClick={openNew} className="btn-cta inline-flex items-center gap-1.5" data-testid="oem-add-product-btn"><Plus size={16} /> Add product</Button>
                </div>

                {/* Products */}
                {products.length === 0 ? (
                    <div className="tc-card-flat p-12 text-center" data-testid="oem-dash-empty">
                        <div className="w-12 h-12 mx-auto rounded-xl bg-[#F5F5F7] grid place-items-center mb-3"><Package size={20} className="text-[#86868B]" /></div>
                        <h3 className="text-[16px] font-semibold text-[#0A0A0B]">No products yet</h3>
                        <p className="text-[13px] text-[#6E6E73] mt-1 mb-4">Add your first product to start showcasing on the OEM Marketplace.</p>
                        <Button onClick={openNew} className="btn-cta inline-flex items-center gap-1.5"><Plus size={16} /> Add product</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {products.map((p) => (
                            <div key={p.id} className={`tc-card-flat overflow-hidden flex flex-col ${p.is_active ? "" : "opacity-60"}`} data-testid={`oem-dash-product-${p.id}`}>
                                <div className="aspect-[4/3] bg-[#F5F5F7] flex items-center justify-center overflow-hidden">
                                    {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <Package size={26} className="text-[#C7C7CC]" />}
                                </div>
                                <div className="p-4 flex flex-col flex-1">
                                    <div className="text-[10px] tracking-[0.12em] uppercase font-semibold text-[#86868B] mb-1">{CATEGORIES.find((c) => c.value === p.category)?.label || "Product"}{!p.is_active && " · Hidden"}</div>
                                    <div className="text-[15px] font-semibold text-[#0A0A0B] leading-tight">{p.name}</div>
                                    {p.model_number && <div className="text-[12px] text-[#86868B] mt-0.5">Model: {p.model_number}</div>}
                                    {p.moq && <div className="text-[12px] text-[#6E6E73] mt-1">MOQ: {p.moq}</div>}
                                    <div className="flex-1" />
                                    <div className="flex items-center gap-1.5 mt-3">
                                        <Button variant="outline" size="sm" onClick={() => openEdit(p)} className="flex-1 gap-1" data-testid={`oem-edit-${p.id}`}><Pencil size={13} /> Edit</Button>
                                        <Button variant="outline" size="sm" onClick={() => toggleActive(p)} className="gap-1" data-testid={`oem-toggle-${p.id}`}>{p.is_active ? <EyeOff size={14} /> : <Eye size={14} />}</Button>
                                        <Button variant="outline" size="sm" onClick={() => setConfirmDel(p)} className="text-red-600 border-red-200 hover:bg-red-50" data-testid={`oem-delete-${p.id}`}><Trash2 size={14} /></Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add / Edit modal */}
            <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
                <DialogContent className="max-w-[520px] max-h-[92vh] overflow-y-auto" data-testid="oem-product-dialog">
                    <DialogHeader><DialogTitle>{editing && editing.id ? "Edit product" : "Add product"}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-[12px] font-medium mb-1">Product name *</label>
                            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="oem-form-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[12px] font-medium mb-1">Category</label>
                                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] text-[14px] bg-white" data-testid="oem-form-category">
                                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium mb-1">Model number</label>
                                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} data-testid="oem-form-model" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium mb-1">Description</label>
                            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="oem-form-description" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[12px] font-medium mb-1">MOQ</label>
                                <Input value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })} placeholder="e.g. 100 pcs" data-testid="oem-form-moq" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium mb-1">Price note</label>
                                <Input value={form.price_note} onChange={(e) => setForm({ ...form, price_note: e.target.value })} placeholder="e.g. From ₹450/unit" data-testid="oem-form-price" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium mb-1">Image</label>
                            <div className="flex items-center gap-3">
                                {form.image_url ? (
                                    <img src={form.image_url} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-[#E8E8EC]" />
                                ) : (
                                    <div className="w-16 h-16 rounded-lg bg-[#F5F5F7] grid place-items-center"><Package size={18} className="text-[#C7C7CC]" /></div>
                                )}
                                <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#D2D2D7] text-[13px] font-medium cursor-pointer hover:bg-black/[0.03]" data-testid="oem-form-upload">
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {uploading ? "Uploading…" : "Upload image"}
                                    <input type="file" accept="image/*" className="hidden" onChange={onUpload} disabled={uploading} />
                                </label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button onClick={save} disabled={saving || uploading} className="btn-cta" data-testid="oem-form-save">{saving ? "Saving…" : "Save product"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete confirm */}
            <Dialog open={!!confirmDel} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Remove {confirmDel?.name}?</DialogTitle></DialogHeader>
                    <p className="text-[13px] text-[#6E6E73]">This will permanently remove the product from your showcase.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
                        <Button onClick={doDelete} className="bg-red-600 hover:bg-red-700 text-white" data-testid="oem-delete-confirm">Remove</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
