import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Package, Copy, Check } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import CommissionBanner from "./CommissionBanner";

const SIZES = ["A4", "A3", "A5", "Letter"];
const BRANDS = ["JK Paper", "Century", "TNPL", "Bilt", "Trident", "Ballarpur", "Other"];
const GSMS = [70, 75, 80, 90, 100, 120, 150];

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

function emptyForm() {
    return { brand: "JK Paper", size: "A4", gsm: 75, reams_per_box: 10, price_per_ream: "", stock: "" };
}

export default function PaperListings() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm());

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
        const fn = () => { setForm(emptyForm()); setOpen(true); };
        window.addEventListener("tc-open-add-paper", fn);
        return () => window.removeEventListener("tc-open-add-paper", fn);
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.price_per_ream || !form.stock) { toast.error("Price and stock are required"); return; }
        setSaving(true);
        try {
            await api.post("/supplier/papers", {
                brand: form.brand,
                size: form.size,
                gsm: Number(form.gsm),
                reams_per_box: Number(form.reams_per_box),
                price_per_ream: Number(form.price_per_ream),
                stock: Number(form.stock),
            });
            toast.success("Paper listing added");
            setOpen(false);
            setForm(emptyForm());
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
                                <button onClick={() => duplicate(p)} className="text-[12px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`duplicate-paper-${p.id}`}>
                                    <Copy size={12} /> Duplicate
                                </button>
                                <button onClick={() => remove(p.id)} className="text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`remove-paper-${p.id}`}>
                                    <Trash2 size={12} /> Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[560px] max-h-[92vh] overflow-y-auto p-7 rounded-[20px]" data-testid="add-paper-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>Add a paper SKU</DialogTitle>
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
                                <Label>Price per ream (₹) <span className="text-red-500">*</span></Label>
                                <Input type="number" min="1" step="0.01" value={form.price_per_ream} onChange={(e) => setForm({ ...form, price_per_ream: e.target.value })} required className="tc-input-lg" data-testid="paper-price-input" />
                            </div>
                            <div>
                                <Label>Stock (boxes) <span className="text-red-500">*</span></Label>
                                <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required className="tc-input-lg" data-testid="paper-stock-input" />
                            </div>
                        </div>
                        <CommissionBanner />
                        <DialogFooter className="mt-3">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                            <Button type="submit" className="btn-pill-cta" disabled={saving} data-testid="paper-save-btn">
                                {saving ? "Publishing…" : "Publish paper"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
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
