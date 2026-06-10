import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Search, Loader2, Download, FileText, Flag } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const STATUSES = ["all", "requested", "accepted", "shipped", "delivered", "cancelled", "rejected"];

export default function OrdersTab() {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("all");
    const [search, setSearch] = useState("");
    const [activeOrder, setActiveOrder] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/orders", {
                params: { status, search, page, limit: 50 },
            });
            setRows(data.rows || []);
            setTotal(data.total || 0);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, page]);

    const onSearchSubmit = (e) => {
        e.preventDefault();
        setPage(1);
        load();
    };

    const exportCsv = async () => {
        try {
            const res = await api.get("/admin/orders/export", { responseType: "blob" });
            const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url; a.download = "tonerscart_orders.csv";
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            toast.success("CSV exported");
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const updateStatus = async (orderId, newStatus) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: newStatus });
            toast.success("Order status updated");
            setActiveOrder((o) => (o && o.id === orderId ? { ...o, status: newStatus } : o));
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const flagOrder = async (orderId, flag) => {
        try {
            await api.post(`/admin/orders/${orderId}/flag`, { flag });
            toast.success(flag ? "Order flagged — see Disputes tab" : "Order unflagged");
            setRows((rs) => rs.map((r) => (r.id === orderId ? { ...r, is_flagged: flag } : r)));
            setActiveOrder((o) => (o && o.id === orderId ? { ...o, is_flagged: flag } : o));
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 50)), [total]);

    return (
        <div className="space-y-4" data-testid="orders-tab">
            <div className="flex flex-wrap items-center gap-3">
                <form onSubmit={onSearchSubmit} className="relative flex-1 max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search buyer name, dealer or model…"
                        className="pl-9"
                        data-testid="orders-search-input"
                    />
                </form>
                <select
                    value={status}
                    onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                    className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px] font-semibold"
                    data-testid="orders-status-filter"
                >
                    {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All status" : s}</option>)}
                </select>
                <div className="text-[12px] text-[#6E6E73]">{total} orders</div>
                <Button size="sm" variant="outline" onClick={exportCsv} className="inline-flex items-center gap-1.5" data-testid="orders-export-csv">
                    <Download size={13} /> Export CSV
                </Button>
            </div>

            {loading ? (
                <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
            ) : rows.length === 0 ? (
                <div className="py-16 text-center text-[#6E6E73]">No orders match these filters.</div>
            ) : (
                <div className="bg-white border border-black/[0.06] rounded-2xl overflow-x-auto" data-testid="orders-table">
                    <table className="w-full min-w-[760px] text-[12.5px]">
                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                            <tr>
                                <th className="text-left p-3">Order</th>
                                <th className="text-left p-3">Buyer</th>
                                <th className="text-left p-3">Product</th>
                                <th className="text-left p-3">Dealer</th>
                                <th className="text-right p-3">Qty</th>
                                <th className="text-right p-3">Total</th>
                                <th className="text-right p-3">Commission</th>
                                <th className="text-right p-3">Payout</th>
                                <th className="text-left p-3">Status</th>
                                <th className="text-left p-3">Date</th>
                                <th className="text-center p-3">Flag</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((o) => (
                                <tr key={o.id} className="border-t border-black/[0.05] hover:bg-black/[0.02] cursor-pointer" onClick={() => setActiveOrder(o)} data-testid={`order-row-${o.id}`}>
                                    <td className="p-3 font-mono text-[11.5px]">#{o.id.slice(0, 8).toUpperCase()}</td>
                                    <td className="p-3">
                                        <div className="font-semibold">{o.customer_name || "—"}</div>
                                        <div className="text-[11px] text-[#86868B] font-mono">{o.customer_phone || ""}</div>
                                    </td>
                                    <td className="p-3">{o.brand} {o.model_number}</td>
                                    <td className="p-3 text-[12px]">{o.supplier_name || "—"}</td>
                                    <td className="p-3 text-right">{o.qty}</td>
                                    <td className="p-3 text-right font-mono font-semibold">{fmtMoney(o.total)}</td>
                                    <td className="p-3 text-right font-mono">{fmtMoney(o.commission)}</td>
                                    <td className="p-3 text-right font-mono">{fmtMoney(o.payout)}</td>
                                    <td className="p-3"><StatusPill status={o.status} /></td>
                                    <td className="p-3 text-[11px] text-[#6E6E73]">{o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"}</td>
                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => flagOrder(o.id, !o.is_flagged)}
                                            className={`inline-grid place-items-center w-8 h-8 rounded-lg transition-colors ${o.is_flagged ? "bg-red-50 text-red-600" : "text-[#C0C0C5] hover:text-red-500 hover:bg-red-50"}`}
                                            title={o.is_flagged ? "Flagged — click to unflag" : "Flag this order for dispute"}
                                            data-testid={`order-flag-${o.id}`}
                                        >
                                            <Flag size={15} fill={o.is_flagged ? "currentColor" : "none"} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="orders-prev">Prev</Button>
                    <div className="text-[12px] text-[#6E6E73]">Page {page} / {totalPages}</div>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="orders-next">Next</Button>
                </div>
            )}

            <OrderDetailDialog order={activeOrder} onClose={() => setActiveOrder(null)} onChange={updateStatus} onFlag={flagOrder} />
        </div>
    );
}

function StatusPill({ status }) {
    const map = {
        requested: "bg-amber-50 text-amber-700 border-amber-200",
        accepted:  "bg-cyan-50 text-cyan-700 border-cyan-200",
        shipped:   "bg-indigo-50 text-indigo-700 border-indigo-200",
        delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
        cancelled: "bg-red-50 text-red-700 border-red-200",
        rejected:  "bg-red-50 text-red-700 border-red-200",
    };
    return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10.5px] font-semibold uppercase tracking-[0.06em] ${map[status] || "bg-slate-50 text-slate-700 border-slate-200"}`}>{status}</span>;
}

function OrderDetailDialog({ order, onClose, onChange, onFlag }) {
    if (!order) return null;
    return (
        <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto" data-testid="admin-order-dialog">
                <DialogHeader><DialogTitle>Order #{order.id.slice(0, 8).toUpperCase()}</DialogTitle></DialogHeader>
                <div className="space-y-3 text-[13px]">
                    <KV k="Buyer"     v={`${order.customer_name || "—"} · ${order.customer_phone || ""}`} />
                    <KV k="Delivery"  v={order.delivery_address || "—"} />
                    <KV k="Product"   v={`${order.brand} ${order.model_number} (${order.toner_type || "—"})`} />
                    <KV k="Dealer"    v={order.supplier_name || "—"} />
                    <KV k="Tracking"  v={order.tracking_number || "—"} />
                    <KV k="Qty / Unit"v={`${order.qty} × ${fmtMoney(order.unit_price)}`} />
                    <KV k="Total"     v={fmtMoney(order.total)} />
                    <KV k="Commission" v={`${fmtMoney(order.commission)} (${order.commission_rate})`} />
                    <KV k="Dealer payout" v={fmtMoney(order.payout)} />
                    {order.notes && <KV k="Notes" v={order.notes} />}
                    <div className="pt-2">
                        <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#6E6E73] mb-1">Change status</div>
                        <div className="flex flex-wrap gap-2">
                            {["accepted", "shipped", "delivered", "cancelled", "rejected"].map((s) => (
                                <button
                                    key={s}
                                    onClick={() => onChange(order.id, s)}
                                    disabled={s === order.status}
                                    className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full border ${s === order.status ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]"}`}
                                    data-testid={`admin-set-status-${s}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="pt-1">
                        <button
                            onClick={() => onFlag(order.id, !order.is_flagged)}
                            className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border ${order.is_flagged ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-[#6E6E73] border-[#D2D2D7] hover:border-red-300 hover:text-red-600"}`}
                            data-testid="admin-order-flag-btn"
                        >
                            <Flag size={13} fill={order.is_flagged ? "currentColor" : "none"} />
                            {order.is_flagged ? "Flagged for dispute — unflag" : "Flag for dispute"}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
const KV = ({ k, v }) => (
    <div className="flex items-start gap-3">
        <div className="w-28 shrink-0 text-[11px] tracking-[0.12em] uppercase font-semibold text-[#86868B]">{k}</div>
        <div className="flex-1">{v}</div>
    </div>
);

void FileText; // keep import for future use without lint warning
