import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Loader2, Activity, AlertTriangle } from "lucide-react";

const fmtTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const ACTION_LABELS = {
    supplier_approved: { label: "Dealer approved", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    supplier_rejected: { label: "Dealer rejected", color: "text-red-700 bg-red-50 border-red-200" },
    dealer_suspended: { label: "Dealer suspended", color: "text-red-700 bg-red-50 border-red-200" },
    dealer_unsuspended: { label: "Dealer reinstated", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    dealer_notes_updated: { label: "Dealer notes updated", color: "text-slate-600 bg-slate-50 border-slate-200" },
    listing_deleted: { label: "Listing deleted", color: "text-red-700 bg-red-50 border-red-200" },
    printer_deleted: { label: "Printer deleted", color: "text-red-700 bg-red-50 border-red-200" },
    order_status_changed: { label: "Order status changed", color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
    order_flagged: { label: "Order flagged", color: "text-amber-700 bg-amber-50 border-amber-200" },
    order_unflagged: { label: "Order unflagged", color: "text-slate-600 bg-slate-50 border-slate-200" },
    dispute_updated: { label: "Dispute updated", color: "text-amber-700 bg-amber-50 border-amber-200" },
    message_replied: { label: "Message replied", color: "text-cyan-700 bg-cyan-50 border-cyan-200" },
};

const meta = (a) => ACTION_LABELS[a] || { label: (a || "action").replace(/_/g, " "), color: "text-slate-600 bg-slate-50 border-slate-200" };

export default function ActivityLogTab() {
    const [rows, setRows] = useState([]);
    const [migrated, setMigrated] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get("/admin/activity-log", { params: { limit: 300 } })
            .then(({ data }) => { setRows(data?.rows || []); setMigrated(data?.migrated !== false); })
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div data-testid="activity-log-tab">
            <div className="mb-4">
                <h2 className="text-[20px] font-bold text-[#0A0A0B]">Admin activity log</h2>
                <p className="text-[12.5px] text-[#6E6E73]">Every admin action recorded with a timestamp. Most recent first.</p>
            </div>

            {!migrated && (
                <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12.5px] text-amber-800" data-testid="activity-migration-warning">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>Activity log is not migrated yet. Run <code className="font-mono">supabase_schema_admin_extras.sql</code> in Supabase. New actions will appear here once enabled.</span>
                </div>
            )}

            {loading ? (
                <div className="py-16 grid place-items-center text-[#86868B]"><Loader2 className="animate-spin" /></div>
            ) : rows.length === 0 ? (
                <div className="py-16 text-center text-[#86868B] text-[14px]" data-testid="activity-empty">
                    <Activity size={28} className="mx-auto mb-3 opacity-40" />
                    No activity recorded yet.
                </div>
            ) : (
                <div className="bg-white border border-black/[0.06] rounded-2xl divide-y divide-black/[0.05] max-h-[70vh] overflow-y-auto" data-testid="activity-list">
                    {rows.map((r) => {
                        const m = meta(r.action);
                        const det = r.details && typeof r.details === "object" ? r.details : {};
                        const detStr = Object.entries(det).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
                        return (
                            <div key={r.id} className="flex items-start gap-3 px-4 py-3" data-testid={`activity-row-${r.id}`}>
                                <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border whitespace-nowrap ${m.color}`}>{m.label}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[12.5px] text-[#3a3a40] truncate">
                                        <span className="font-semibold text-[#0A0A0B]">{r.admin_email || "admin"}</span>
                                        {r.entity_type ? <span className="text-[#86868B]"> · {r.entity_type}</span> : null}
                                        {detStr ? <span className="text-[#86868B]"> · {detStr}</span> : null}
                                    </div>
                                </div>
                                <div className="text-[11px] text-[#86868B] whitespace-nowrap">{fmtTime(r.created_at)}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
