import React, { useState } from "react";
import { toast } from "sonner";
import { Search, Loader2, FileText, AlertTriangle, Star } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import VerifiedBadge from "../VerifiedBadge";
import procApi, { formatApiError } from "../../lib/procApi";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export async function downloadQuotationPdf(id, ref) {
    const res = await procApi.get(`/procurement/quotations/${id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ref || "quotation"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function SearchCompare({ onQuoted }) {
    const [q, setQ] = useState("");
    const [qty, setQty] = useState(1);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [selected, setSelected] = useState(() => new Set());
    const [submitting, setSubmitting] = useState(false);

    const runSearch = async (e) => {
        e?.preventDefault();
        if (!q.trim()) { toast.error("Enter a product to compare"); return; }
        setLoading(true);
        setSelected(new Set());
        try {
            const { data } = await procApi.get("/procurement/compare", { params: { q: q.trim(), qty } });
            setResult(data);
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };

    const toggle = (lid) => setSelected((s) => {
        const n = new Set(s);
        n.has(lid) ? n.delete(lid) : n.add(lid);
        return n;
    });

    const requestQuotation = async () => {
        const ids = [...selected];
        if (ids.length === 0) { toast.error("Select at least one supplier"); return; }
        setSubmitting(true);
        try {
            const { data } = await procApi.post("/procurement/quotations", {
                listing_ids: ids,
                qty: Number(qty) || 1,
                product_label: q.trim(),
            });
            toast.success(`Quotation ${data.ref_number} generated — emailed to you`);
            try { await downloadQuotationPdf(data.id, data.ref_number); } catch { /* download optional */ }
            onQuoted?.();
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setSubmitting(false); }
    };

    const items = result?.items || [];
    const qtyN = Number(qty) || 1;

    return (
        <div className="space-y-5" data-testid="proc-search-compare">
            <div>
                <h2 className="text-[20px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Search &amp; Compare</h2>
                <p className="text-[13px] text-[#6E6E73] mt-0.5">Compare verified suppliers ranked by lowest total price (L1 / L2 / L3), then request a formal quotation.</p>
            </div>

            <form onSubmit={runSearch} className="flex flex-wrap items-end gap-3" data-testid="proc-compare-form">
                <div className="flex-1 min-w-[220px]">
                    <label className="text-[12px] font-semibold text-[#6E6E73]">Product</label>
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. HP 88A, TN-2365, CF217A" className="mt-1" data-testid="proc-compare-query" />
                </div>
                <div className="w-24">
                    <label className="text-[12px] font-semibold text-[#6E6E73]">Quantity</label>
                    <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1" data-testid="proc-compare-qty" />
                </div>
                <Button type="submit" disabled={loading} className="btn-cta inline-flex items-center gap-2 h-10" data-testid="proc-compare-search-btn">
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Compare
                </Button>
            </form>

            {result && (
                <>
                    {result.warning && (
                        <div className="flex items-center gap-2 rounded-xl bg-[#FFF8E0] border border-[#F5E5A6] px-4 py-2.5 text-[12.5px] text-[#8C6A00]" data-testid="proc-compare-warning">
                            <AlertTriangle size={14} className="shrink-0" /> {result.warning}
                        </div>
                    )}

                    {items.length > 0 && (
                        <div className="tc-card-flat overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]" data-testid="proc-compare-table">
                                    <thead>
                                        <tr className="bg-[#0B1220] text-white text-left">
                                            <th className="px-3 py-2.5 font-semibold">Pick</th>
                                            <th className="px-3 py-2.5 font-semibold">Rank</th>
                                            <th className="px-3 py-2.5 font-semibold">Supplier</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Unit (ex GST)</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">GST%</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Total (inc GST)</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Stock</th>
                                            <th className="px-3 py-2.5 font-semibold">Delivery</th>
                                            <th className="px-3 py-2.5 font-semibold">City</th>
                                            <th className="px-3 py-2.5 font-semibold">Rating</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((it) => (
                                            <tr key={it.listing_id} className={`border-b border-black/[0.05] ${it.rank === "L1" ? "bg-[#E6F7F9]" : ""}`} data-testid={`proc-compare-row-${it.rank}`}>
                                                <td className="px-3 py-2.5">
                                                    <input type="checkbox" checked={selected.has(it.listing_id)} onChange={() => toggle(it.listing_id)} className="w-4 h-4 accent-[#00B7C7]" data-testid={`proc-select-${it.rank}`} />
                                                </td>
                                                <td className="px-3 py-2.5"><span className={`font-bold ${it.rank === "L1" ? "text-[#00838F]" : "text-[#0A0A0B]"}`}>{it.rank}</span></td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium text-[#0A0A0B]">{it.supplier_name}</span>
                                                        <VerifiedBadge compact />
                                                    </div>
                                                    <div className="text-[11px] text-[#86868B]">{it.brand} {it.model_number}</div>
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-mono">{inr(it.unit_price)}</td>
                                                <td className="px-3 py-2.5 text-right">{it.gst_rate}%</td>
                                                <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#0A0A0B]">{inr(it.total_price * qtyN)}</td>
                                                <td className="px-3 py-2.5 text-right">{it.stock}</td>
                                                <td className="px-3 py-2.5">{it.delivery_days} days</td>
                                                <td className="px-3 py-2.5">{it.city || "—"}</td>
                                                <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1"><Star size={12} className="text-amber-400 fill-amber-400" /> {it.rating}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-black/[0.06] bg-[#FAFAFB]">
                                <div className="text-[12.5px] text-[#6E6E73]">{selected.size} supplier(s) selected · qty {qtyN}</div>
                                <Button onClick={requestQuotation} disabled={submitting || selected.size === 0} className="btn-cta inline-flex items-center gap-2" data-testid="proc-request-quotation-btn">
                                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Request Quotation
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
