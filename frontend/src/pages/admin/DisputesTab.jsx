import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Loader2, Flag, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

const statusChip = (s) => {
    const map = {
        open: "bg-red-50 text-red-700 border-red-200",
        investigating: "bg-amber-50 text-amber-700 border-amber-200",
        resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${map[s] || "bg-slate-50 text-slate-600 border-slate-200"}`}>{s || "open"}</span>;
};

export default function DisputesTab() {
    const [rows, setRows] = useState([]);
    const [migrated, setMigrated] = useState(true);
    const [loading, setLoading] = useState(true);
    const [drafts, setDrafts] = useState({}); // orderId -> notes
    const [busy, setBusy] = useState(null);

    const load = () => {
        setLoading(true);
        api.get("/admin/disputes")
            .then(({ data }) => {
                setRows(data?.rows || []);
                setMigrated(data?.migrated !== false);
                const d = {};
                (data?.rows || []).forEach((r) => { d[r.id] = r.dispute_notes || ""; });
                setDrafts(d);
            })
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); }, []);

    const updateDispute = async (orderId, payload) => {
        setBusy(orderId);
        try {
            await api.put(`/admin/orders/${orderId}/dispute`, payload);
            toast.success("Dispute updated");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(null); }
    };

    const unflag = async (orderId) => {
        setBusy(orderId);
        try {
            await api.post(`/admin/orders/${orderId}/flag`, { flag: false });
            toast.success("Order unflagged");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(null); }
    };

    return (
        <div data-testid="disputes-tab">
            <div className="mb-4">
                <h2 className="text-[20px] font-bold text-[#0A0A0B]">Order disputes</h2>
                <p className="text-[12.5px] text-[#6E6E73]">Flagged orders awaiting resolution. Flag an order from the Orders tab.</p>
            </div>

            {!migrated && (
                <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12.5px] text-amber-800" data-testid="disputes-migration-warning">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>Dispute columns are not migrated yet. Run <code className="font-mono">supabase_schema_admin_extras.sql</code> in Supabase to enable flagging.</span>
                </div>
            )}

            {loading ? (
                <div className="py-16 grid place-items-center text-[#86868B]"><Loader2 className="animate-spin" /></div>
            ) : rows.length === 0 ? (
                <div className="py-16 text-center text-[#86868B] text-[14px]" data-testid="disputes-empty">
                    <Flag size={28} className="mx-auto mb-3 opacity-40" />
                    No flagged orders. All clear.
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((o) => (
                        <div key={o.id} className="bg-white border border-black/[0.06] rounded-2xl p-4" data-testid={`dispute-card-${o.id}`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <div className="font-bold text-[#0A0A0B] flex items-center gap-2">
                                        {[o.brand, o.model_number].filter(Boolean).join(" ") || "Order"} {statusChip(o.dispute_status)}
                                    </div>
                                    <div className="text-[12px] text-[#6E6E73] mt-0.5">
                                        Order #{(o.order_number || o.id || "").toString().slice(0, 10)} · {o.customer_name || "—"} · Dealer: {o.supplier_name} · {fmtMoney(o.total)} · flagged {fmtDate(o.flagged_at)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={o.dispute_status || "open"}
                                        onChange={(e) => updateDispute(o.id, { dispute_status: e.target.value })}
                                        disabled={busy === o.id}
                                        className="h-9 px-2.5 rounded-lg border border-[#D2D2D7] text-[13px] font-medium bg-white"
                                        data-testid={`dispute-status-select-${o.id}`}
                                    >
                                        <option value="open">Open</option>
                                        <option value="investigating">Investigating</option>
                                        <option value="resolved">Resolved</option>
                                    </select>
                                    <button onClick={() => unflag(o.id)} disabled={busy === o.id} className="text-[12px] font-semibold text-[#86868B] hover:text-[#0A0A0B]" data-testid={`dispute-unflag-${o.id}`}>Unflag</button>
                                </div>
                            </div>
                            <div className="mt-3">
                                <Textarea
                                    rows={2}
                                    placeholder="Resolution notes…"
                                    value={drafts[o.id] ?? ""}
                                    onChange={(e) => setDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                                    data-testid={`dispute-notes-${o.id}`}
                                />
                                <div className="flex items-center justify-end gap-2 mt-2">
                                    <Button variant="outline" size="sm" disabled={busy === o.id} onClick={() => updateDispute(o.id, { dispute_notes: drafts[o.id] || "" })} data-testid={`dispute-save-notes-${o.id}`}>
                                        Save notes
                                    </Button>
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy === o.id || o.dispute_status === "resolved"} onClick={() => updateDispute(o.id, { dispute_status: "resolved", dispute_notes: drafts[o.id] || "" })} data-testid={`dispute-resolve-${o.id}`}>
                                        {busy === o.id ? <Loader2 size={13} className="animate-spin" /> : <><CheckCircle2 size={13} className="mr-1" /> Mark resolved</>}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
