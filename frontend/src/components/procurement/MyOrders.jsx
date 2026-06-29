import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Package, Loader2, Upload, FileText, Check, ExternalLink, Download } from "lucide-react";
import { Button } from "../ui/button";
import procApi, { formatApiError } from "../../lib/procApi";

const STEPS = ["confirmed", "processing", "shipped", "delivered"];
const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? String(s).slice(0, 10) : "—");

function StatusTimeline({ order }) {
    const idx = STEPS.indexOf(order.status);
    return (
        <div className="flex items-center gap-0" data-testid={`proc-order-timeline-${order.ref_number}`}>
            {STEPS.map((s, i) => {
                const done = i <= idx;
                return (
                    <React.Fragment key={s}>
                        {i > 0 && <div className={`h-[2px] w-6 sm:w-10 ${i <= idx ? "bg-emerald-500" : "bg-[#E5E5EA]"}`} />}
                        <div className="flex flex-col items-center gap-1">
                            <div className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold ${done ? "bg-emerald-500 text-white" : "bg-[#E5E5EA] text-[#86868B]"}`}>
                                {done ? <Check size={11} /> : i + 1}
                            </div>
                            <span className={`text-[9.5px] uppercase tracking-wide font-semibold ${done ? "text-emerald-700" : "text-[#86868B]"}`}>{s}</span>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

function InvoiceDownloadBtn({ order }) {
    const [busy, setBusy] = useState(false);
    const download = async () => {
        setBusy(true);
        try {
            const res = await procApi.get(`/procurement/orders/${order.id}/invoice.pdf`, { responseType: "blob" });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${order.ref_number || order.id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(false); }
    };
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={download}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[12px]"
            data-testid={`proc-invoice-download-${order.ref_number}`}
        >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Tax invoice
        </Button>
    );
}

function PoBlock({ order, onUploaded }) {
    const fileRef = useRef(null);
    const [busy, setBusy] = useState(false);

    const upload = async (file) => {
        if (!file) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            await procApi.post(`/procurement/orders/${order.id}/po`, fd, { headers: { "Content-Type": "multipart/form-data" } });
            toast.success("PO document uploaded");
            onUploaded();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
    };

    const view = async () => {
        try {
            const { data } = await procApi.get(`/procurement/orders/${order.id}/po-url`);
            window.open(data.url, "_blank", "noopener");
        } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
                onChange={(e) => upload(e.target.files?.[0])} data-testid={`proc-po-input-${order.ref_number}`} />
            {order.po_document_url && (
                <Button variant="outline" size="sm" onClick={view} className="inline-flex items-center gap-1.5 text-[12px]" data-testid={`proc-po-view-${order.ref_number}`}>
                    <ExternalLink size={13} /> View PO
                </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}
                className="inline-flex items-center gap-1.5 text-[12px]" data-testid={`proc-po-upload-${order.ref_number}`}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {order.po_document_url ? "Replace PO" : "Upload PO document"}
            </Button>
        </div>
    );
}

export default function MyOrders({ active, isGovt }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await procApi.get("/procurement/orders");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (active) load(); }, [active]); // eslint-disable-line

    if (loading) {
        return <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading orders…</div>;
    }

    return (
        <div className="space-y-5" data-testid="proc-my-orders">
            <h2 className="text-[20px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>My Orders</h2>
            {rows.length === 0 ? (
                <div className="tc-card-flat p-10 text-center" data-testid="proc-orders-empty">
                    <Package className="mx-auto text-[#00B7C7] mb-3" size={28} />
                    <div className="text-[15px] font-semibold text-[#0A0A0B]">No orders yet</div>
                    <p className="text-[13px] text-[#6E6E73] mt-1.5">Place an order from any active quotation in My Quotations.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((o) => {
                        const item = (o.items || [])[0] || {};
                        return (
                            <div key={o.id} className="tc-card-flat p-4 sm:p-5" data-testid={`proc-order-${o.ref_number}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-[13.5px] font-semibold text-[#0A0A0B]">{o.ref_number}</span>
                                            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide bg-[#EAF6FF] text-[#0369A1] border-[#BFE3FB]">{o.rank || "L1"}</span>
                                            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${o.payment_status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`} data-testid={`proc-order-payment-${o.ref_number}`}>
                                                {o.payment_status === "paid" ? "Paid" : "Unpaid"}
                                            </span>
                                        </div>
                                        <div className="text-[13.5px] text-[#1D1D1F] mt-1 font-medium">
                                            {item.brand} {item.model_number} · qty {o.qty}
                                        </div>
                                        <div className="text-[11.5px] text-[#86868B] mt-0.5 flex items-center gap-3 flex-wrap">
                                            <span>{o.supplier_name}</span>
                                            <span>Ordered {fmtDate(o.created_at)}</span>
                                            <span>Payment due {fmtDate(o.payment_due_date)}</span>
                                        </div>
                                    </div>
                                    <div className="font-mono text-[17px] font-bold text-[#0A0A0B]" data-testid={`proc-order-total-${o.ref_number}`}>{fmtMoney(o.total_amount)}</div>
                                </div>
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <StatusTimeline order={o} />
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <InvoiceDownloadBtn order={o} />
                                        {isGovt ? (
                                            <PoBlock order={o} onUploaded={load} />
                                        ) : o.po_document_url ? (
                                            <span className="inline-flex items-center gap-1 text-[11.5px] text-[#6E6E73]"><FileText size={12} /> PO attached</span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
