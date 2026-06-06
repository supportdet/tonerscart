import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Search, Loader2, Trash2, PauseCircle, PlayCircle, Pencil, Check, X, AlertTriangle, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export default function DealersTab() {
    const navigate = useNavigate();
    const [dealers, setDealers] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [activeId, setActiveId] = useState(null);
    const [confirming, setConfirming] = useState(null); // {dealer, action: 'suspend' | 'unsuspend'}
    const [busyConfirm, setBusyConfirm] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [a, o] = await Promise.all([
                api.get("/admin/suppliers"),
                api.get("/admin/orders", { params: { limit: 200, page: 1 } }),
            ]);
            setDealers(Array.isArray(a.data) ? a.data : []);
            setOrders((o.data?.rows) || []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    // Compute per-dealer aggregates from the orders feed
    const aggregates = useMemo(() => {
        const m = {};
        for (const o of orders) {
            const s = o.supplier_id;
            if (!s) continue;
            if (!m[s]) m[s] = { orderCount: 0, gmv: 0 };
            m[s].orderCount += 1;
            m[s].gmv += Number(o.total || 0);
        }
        return m;
    }, [orders]);

    const visible = useMemo(() => {
        const f = filter.trim().toLowerCase();
        if (!f) return dealers;
        return dealers.filter((d) =>
            (d.business_name || "").toLowerCase().includes(f)
            || (d.city || "").toLowerCase().includes(f)
        );
    }, [dealers, filter]);

    const toggleSuspend = (d) => {
        setConfirming({ dealer: d, action: d.is_suspended ? "unsuspend" : "suspend" });
    };

    const doConfirm = async () => {
        if (!confirming) return;
        const { dealer: d, action } = confirming;
        setBusyConfirm(true);
        try {
            await api.post(`/admin/suppliers/${d.id}/${action}`);
            toast.success(action === "suspend" ? "Dealer suspended — notification email sent" : "Dealer reinstated — notification email sent");
            setConfirming(null);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusyConfirm(false); }
    };

    return (
        <div className="space-y-4" data-testid="dealers-tab">
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                    <Input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Search dealers by name or city…"
                        className="pl-9"
                        data-testid="dealers-search-input"
                    />
                </div>
                <div className="text-[12px] text-[#6E6E73]" data-testid="dealers-count">
                    {visible.length} of {dealers.length}
                </div>
            </div>

            {loading ? (
                <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading dealers…</div>
            ) : visible.length === 0 ? (
                <div className="py-16 text-center text-[#6E6E73]">No dealers found.</div>
            ) : (
                <div className="bg-white border border-black/[0.06] rounded-2xl overflow-x-auto" data-testid="dealers-table">
                    <table className="w-full text-[13px]">
                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                            <tr>
                                <th className="text-left p-3">Business</th>
                                <th className="text-left p-3">Seller ID</th>
                                <th className="text-left p-3">City</th>
                                <th className="text-left p-3">GST</th>
                                <th className="text-left p-3">Approved</th>
                                <th className="text-right p-3">Orders</th>
                                <th className="text-right p-3">GMV</th>
                                <th className="text-left p-3">Status</th>
                                <th className="text-left p-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((d) => {
                                const agg = aggregates[d.id] || { orderCount: 0, gmv: 0 };
                                return (
                                    <tr key={d.id} className="border-t border-black/[0.05] hover:bg-black/[0.02] cursor-pointer" data-testid={`dealer-row-${d.id}`} onClick={() => setActiveId(d.id)}>
                                        <td className="p-3 font-semibold">{d.business_name}</td>
                                        <td className="p-3">
                                            {d.seller_id
                                                ? <span className="font-mono text-[12px] font-semibold text-[#00838f]" data-testid={`dealer-seller-id-${d.id}`}>{d.seller_id}</span>
                                                : <span className="text-[11.5px] text-[#86868B] italic">Pending</span>}
                                        </td>
                                        <td className="p-3">{d.city || "—"}</td>
                                        <td className="p-3 font-mono text-[12px]">{d.gst_number || "—"}</td>
                                        <td className="p-3 text-[11.5px] text-[#6E6E73]">{d.approved_at ? new Date(d.approved_at).toLocaleDateString() : "—"}</td>
                                        <td className="p-3 text-right">{agg.orderCount}</td>
                                        <td className="p-3 text-right font-mono">{fmtMoney(agg.gmv)}</td>
                                        <td className="p-3">
                                            {d.is_suspended ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[11px] font-semibold">Suspended</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">Active</span>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleSuspend(d); }}
                                                className="text-[11.5px] font-semibold inline-flex items-center gap-1 text-[#0A0A0B] hover:underline"
                                                data-testid={`dealer-suspend-${d.id}`}
                                            >
                                                {d.is_suspended ? <><PlayCircle size={12} /> Unsuspend</> : <><PauseCircle size={12} /> Suspend</>}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <DealerDetailDrawer
                supplierId={activeId}
                open={!!activeId}
                onClose={() => setActiveId(null)}
                onChanged={load}
            />

            <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
                <DialogContent className="max-w-md" data-testid="suspend-confirm-dialog">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle size={18} className={confirming?.action === "suspend" ? "text-red-600" : "text-emerald-600"} />
                            {confirming?.action === "suspend" ? "Suspend dealer?" : "Restore dealer?"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="text-[13.5px] text-[#3a3a40] leading-relaxed">
                        {confirming?.action === "suspend"
                            ? <>Are you sure you want to suspend <strong>{confirming?.dealer?.business_name}</strong>? Their listings will be hidden from buyers immediately and a notification email will be sent to the dealer.</>
                            : <>Restore <strong>{confirming?.dealer?.business_name}</strong>? Their listings will become visible again and a notification email will be sent.</>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirming(null)} disabled={busyConfirm} data-testid="suspend-cancel-btn">Cancel</Button>
                        <Button
                            onClick={doConfirm}
                            disabled={busyConfirm}
                            className={confirming?.action === "suspend" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                            data-testid="suspend-confirm-btn"
                        >
                            {busyConfirm ? <><Loader2 size={13} className="animate-spin mr-1.5" /> Working…</> : (confirming?.action === "suspend" ? "Confirm suspension" : "Reinstate dealer")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DealerDetailDrawer({ supplierId, open, onClose, onChanged }) {
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [bn, setBn] = useState("");
    const [city, setCity] = useState("");

    useEffect(() => {
        if (!supplierId) { setDetail(null); return; }
        setBusy(true);
        api.get(`/admin/suppliers/${supplierId}/detail`)
            .then(({ data }) => {
                setDetail(data);
                setBn(data.supplier?.business_name || "");
                setCity(data.supplier?.city || "");
            })
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setBusy(false));
    }, [supplierId]);

    const saveEdit = async () => {
        try {
            await api.put(`/admin/suppliers/${supplierId}`, { business_name: bn, city });
            toast.success("Dealer updated");
            setEditing(false);
            // Reload local
            const { data } = await api.get(`/admin/suppliers/${supplierId}/detail`);
            setDetail(data);
            onChanged?.();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const deleteListing = async (id, kind) => {
        if (!window.confirm(`Permanently delete this ${kind} listing?`)) return;
        try {
            await api.delete(kind === "printer" ? `/admin/printers/${id}` : `/admin/listings/${id}`);
            toast.success("Listing deleted");
            const { data } = await api.get(`/admin/suppliers/${supplierId}/detail`);
            setDetail(data);
            onChanged?.();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="dealer-detail-dialog">
                <DialogHeader><DialogTitle>Dealer detail</DialogTitle></DialogHeader>
                {busy || !detail ? (
                    <div className="py-12 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
                ) : (
                    <div className="space-y-5">
                        <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-2">
                            {editing ? (
                                <div className="flex gap-2 items-center">
                                    <Input value={bn} onChange={(e) => setBn(e.target.value)} placeholder="Business name" data-testid="edit-business-name" />
                                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="max-w-[180px]" data-testid="edit-city" />
                                    <Button size="sm" onClick={saveEdit} data-testid="edit-save"><Check size={13} /> Save</Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditing(false)} data-testid="edit-cancel"><X size={13} /></Button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[18px] font-bold text-[#0A0A0B] flex items-center gap-2">
                                            {detail.supplier.business_name}
                                            {detail.supplier.seller_id
                                                ? <span className="font-mono text-[12px] font-semibold text-[#00838f] bg-[#00838f]/10 border border-[#00838f]/20 rounded-md px-2 py-0.5" data-testid="drawer-seller-id">{detail.supplier.seller_id}</span>
                                                : <span className="text-[11px] text-[#86868B] italic">Seller ID pending</span>}
                                        </div>
                                        <div className="text-[12.5px] text-[#6E6E73]">{detail.supplier.city || "—"} · {detail.supplier.gst_number || "No GST"} · {detail.supplier.phone}</div>
                                    </div>
                                    <button onClick={() => setEditing(true)} className="text-[12px] font-semibold inline-flex items-center gap-1 text-[#0A0A0B] hover:underline" data-testid="dealer-edit-toggle">
                                        <Pencil size={12} /> Edit
                                    </button>
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-3 mt-2 text-center">
                                <Stat label="Listings" value={detail.stats.listing_count} />
                                <Stat label="Orders" value={detail.stats.order_count} />
                                <Stat label="GMV" value={fmtMoney(detail.stats.gmv)} />
                            </div>
                        </div>

                        <Section title={`Toner listings (${detail.toner_listings.length})`}>
                            {detail.toner_listings.length === 0 ? <Empty /> : detail.toner_listings.map((t) => (
                                <ListingRow
                                    key={t.id}
                                    title={`${t.brand} ${t.model_number}`}
                                    sub={`${t.toner_type} · ${t.color} · ₹${Number(t.price).toLocaleString("en-IN")} · stock ${t.stock}`}
                                    onDelete={() => deleteListing(t.id, "toner")}
                                    testId={`drawer-delete-toner-${t.id}`}
                                />
                            ))}
                        </Section>

                        <Section title={`Printer listings (${detail.printer_listings.length})`}>
                            {detail.printer_listings.length === 0 ? <Empty /> : detail.printer_listings.map((p) => (
                                <ListingRow
                                    key={p.id}
                                    title={`${p.brand} ${p.model_number}`}
                                    sub={`${p.condition} · ${p.category} · ₹${Number(p.price).toLocaleString("en-IN")} · stock ${p.stock}`}
                                    onDelete={() => deleteListing(p.id, "printer")}
                                    testId={`drawer-delete-printer-${p.id}`}
                                />
                            ))}
                        </Section>

                        <Section title={`Orders (${detail.orders.length})`}>
                            {detail.orders.length === 0 ? <Empty /> : (
                                <div className="space-y-1.5">
                                    {detail.orders.slice(0, 50).map((o) => (
                                        <div key={o.id} className="flex items-center justify-between text-[12.5px] py-1.5 border-b border-black/[0.04]">
                                            <span className="font-mono text-[11.5px] text-[#6E6E73]">{o.order_number || `#${(o.id || "").slice(0, 8).toUpperCase()}`}</span>
                                            <span>{o.brand} {o.model_number}</span>
                                            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6E6E73]">{o.status}</span>
                                            <span className="font-mono font-semibold">{fmtMoney(o.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

const Stat = ({ label, value }) => (
    <div className="bg-white rounded-lg p-3">
        <div className="text-[10.5px] tracking-[0.14em] uppercase text-[#86868B] font-semibold">{label}</div>
        <div className="text-[16px] font-bold text-[#0A0A0B] mt-0.5">{value}</div>
    </div>
);
const Section = ({ title, children }) => (
    <div>
        <div className="text-[12px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73] mb-2">{title}</div>
        <div className="space-y-1.5">{children}</div>
    </div>
);
const Empty = () => <div className="text-[12.5px] text-[#86868B]">Nothing here yet.</div>;
const ListingRow = ({ title, sub, onDelete, testId }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white border border-black/[0.05]">
        <div>
            <div className="font-semibold text-[13px]">{title}</div>
            <div className="text-[11.5px] text-[#6E6E73]">{sub}</div>
        </div>
        <button onClick={onDelete} className="text-[11.5px] font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded inline-flex items-center gap-1" data-testid={testId}>
            <Trash2 size={12} /> Delete
        </button>
    </div>
);
