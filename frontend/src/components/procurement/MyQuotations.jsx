import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Download, Loader2, Clock, ShoppingCart } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import procApi, { formatApiError } from "../../lib/procApi";
import { downloadQuotationPdf } from "./SearchCompare";

const STATUS_STYLES = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    expired: "bg-[#F4F4F6] text-[#86868B] border-[#E5E5EA]",
    converted: "bg-blue-50 text-blue-700 border-blue-200",
};

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function MyQuotations({ active, onOrdered }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [ordering, setOrdering] = useState(null); // quotation being ordered
    const [sel, setSel] = useState(null);           // chosen listing_id
    const [placing, setPlacing] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await procApi.get("/procurement/quotations");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (active) load(); }, [active]); // eslint-disable-line

    const download = async (q) => {
        setBusyId(q.id);
        try { await downloadQuotationPdf(q.id, q.ref_number); }
        catch (e) { toast.error(formatApiError(e)); }
        finally { setBusyId(null); }
    };

    const openOrder = (q) => {
        setOrdering(q);
        setSel((q.items || [])[0]?.listing_id || null);
    };

    const placeOrder = async () => {
        if (!ordering || !sel) return;
        setPlacing(true);
        try {
            const { data } = await procApi.post("/procurement/orders", {
                quotation_id: ordering.id,
                listing_id: sel,
                qty: ordering.qty,
            });
            toast.success(`Order ${data.ref_number} placed`);
            setOrdering(null); setSel(null);
            load();
            onOrdered && onOrdered();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setPlacing(false); }
    };

    if (loading) {
        return <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading quotations…</div>;
    }

    return (
        <div className="space-y-5" data-testid="proc-my-quotations">
            <h2 className="text-[20px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>My Quotations</h2>
            {rows.length === 0 ? (
                <div className="tc-card-flat p-10 text-center" data-testid="proc-quotations-empty">
                    <FileText className="mx-auto text-[#00B7C7] mb-3" size={28} />
                    <div className="text-[15px] font-semibold text-[#0A0A0B]">No quotations yet</div>
                    <p className="text-[13px] text-[#6E6E73] mt-1.5">Use Search &amp; Compare to generate a formal L1/L2/L3 quotation.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((q) => {
                        const expires = (q.expires_at || "").slice(0, 10);
                        const l1 = (q.items || [])[0];
                        return (
                            <div key={q.id} className="tc-card-flat p-4 flex flex-wrap items-center gap-4" data-testid={`proc-quotation-${q.ref_number}`}>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[13.5px] font-semibold text-[#0A0A0B]">{q.ref_number}</span>
                                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_STYLES[q.status] || STATUS_STYLES.active}`} data-testid={`proc-quotation-status-${q.ref_number}`}>{q.status}</span>
                                    </div>
                                    <div className="text-[13px] text-[#1D1D1F] mt-1">{q.product_label} · qty {q.qty}</div>
                                    <div className="text-[11.5px] text-[#86868B] mt-0.5 flex items-center gap-3">
                                        <span>{(q.items || []).length} supplier(s)</span>
                                        {l1 && <span>L1: {l1.supplier_name}</span>}
                                        <span className="inline-flex items-center gap-1"><Clock size={11} /> valid until {expires}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {q.status === "active" && (
                                        <Button onClick={() => openOrder(q)} className="btn-cta inline-flex items-center gap-1.5" data-testid={`proc-place-order-${q.ref_number}`}>
                                            <ShoppingCart size={14} /> Place order
                                        </Button>
                                    )}
                                    <Button onClick={() => download(q)} disabled={busyId === q.id} variant="outline" className="inline-flex items-center gap-1.5" data-testid={`proc-download-${q.ref_number}`}>
                                        {busyId === q.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Choose supplier → confirm order */}
            <Dialog open={!!ordering} onOpenChange={(o) => { if (!o) { setOrdering(null); setSel(null); } }}>
                <DialogContent className="max-w-lg" data-testid="proc-order-dialog">
                    <DialogHeader>
                        <DialogTitle>Place order — {ordering?.ref_number}</DialogTitle>
                    </DialogHeader>
                    <p className="text-[13px] text-[#6E6E73]">{ordering?.product_label} · qty {ordering?.qty}. Choose the supplier to order from:</p>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                        {(ordering?.items || []).map((it) => {
                            const selected = sel === it.listing_id;
                            return (
                                <button
                                    key={it.listing_id}
                                    onClick={() => setSel(it.listing_id)}
                                    className={`w-full text-left rounded-xl border p-3 transition ${selected ? "border-[#00B7C7] bg-[#F2FBFC]" : "border-[#E5E5EA] bg-white hover:border-[#0A0A0B]"}`}
                                    data-testid={`proc-order-pick-${it.rank}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${it.rank === "L1" ? "bg-emerald-100 text-emerald-800" : "bg-[#F4F4F6] text-[#6E6E73]"}`}>{it.rank}</span>
                                            <span className="text-[13px] font-semibold text-[#0A0A0B] truncate">{it.supplier_name}</span>
                                        </div>
                                        <span className="font-mono text-[13.5px] font-bold text-[#0A0A0B]">{fmtMoney((it.total_price || 0) * (ordering?.qty || 1))}</span>
                                    </div>
                                    <div className="text-[11px] text-[#86868B] mt-1">
                                        {fmtMoney(it.unit_price)} + GST {it.gst_rate}% per unit · delivery ~{it.delivery_days} days · {it.city || ""}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setOrdering(null); setSel(null); }}>Cancel</Button>
                        <Button
                            onClick={placeOrder}
                            disabled
                            aria-disabled="true"
                            title="Orders will be enabled soon — we're onboarding more sellers to serve you better."
                            className="btn-cta opacity-60 cursor-not-allowed"
                            data-testid="proc-order-confirm"
                        >
                            Confirm order
                        </Button>
                    </DialogFooter>
                    <div className="text-[11.5px] text-[#6E6E73] text-center px-2 pb-3" data-testid="proc-order-confirm-disabled-hint">
                        Orders will be enabled soon — we&apos;re onboarding more sellers to serve you better.
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
