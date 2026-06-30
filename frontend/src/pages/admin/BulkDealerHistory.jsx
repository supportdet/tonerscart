import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Loader2, Mail, Check, X as XIcon, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import api, { formatApiError } from "../../lib/api";

function fmtDate(s) {
    if (!s) return "—";
    try {
        return new Date(s).toLocaleString("en-IN", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
    } catch { return s; }
}

/**
 * Wave 101 hotfix-5 — full history of bulk-dealer upload batches.
 *
 * Reads /admin/dealers/bulk-history (backed by audit_log rows with
 * action='bulk_dealer_create'). Each batch is rendered as a collapsible
 * row showing date, admin, counts, then on expand: the full email list
 * + per-email delivery status (sent / not sent).
 */
export default function BulkDealerHistory({ open, onClose }) {
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(new Set());

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        api.get("/admin/dealers/bulk-history")
            .then(({ data }) => setBatches(data.batches || []))
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    }, [open]);

    const toggle = (id) => {
        const next = new Set(expanded);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpanded(next);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[860px] max-h-[88vh] overflow-y-auto p-6 rounded-[18px]" data-testid="bulk-history-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[20px] flex items-center gap-2" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        <History size={18} /> Bulk dealer upload history
                    </DialogTitle>
                </DialogHeader>
                {loading ? (
                    <div className="py-10 text-center text-[#6E6E73] flex items-center justify-center gap-2" data-testid="bulk-history-loading">
                        <Loader2 size={16} className="animate-spin" /> Loading…
                    </div>
                ) : batches.length === 0 ? (
                    <div className="py-10 text-center text-[#6E6E73] text-[13px]" data-testid="bulk-history-empty">
                        No bulk-dealer upload batches yet. Upload your first CSV from the Bulk Add Dealers button.
                    </div>
                ) : (
                    <div className="space-y-2 mt-2">
                        {batches.map((b) => {
                            const isOpen = expanded.has(b.id);
                            return (
                                <div key={b.id} className="rounded-lg border border-black/[0.06] bg-white" data-testid={`bulk-history-row-${b.id}`}>
                                    <button
                                        type="button"
                                        onClick={() => toggle(b.id)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F8F9FB] rounded-lg"
                                    >
                                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13.5px] font-semibold text-[#0A0A0B]">{fmtDate(b.created_at)}</div>
                                            <div className="text-[11.5px] text-[#6E6E73] mt-0.5">
                                                {b.actor_email || b.actor_name || "admin"}
                                                {" · "}
                                                <span className="text-emerald-700">{b.created} created</span>
                                                {b.emails_sent !== b.created && <> · <span className="text-[#0A6E78]">{b.emails_sent} emails sent</span></>}
                                                {b.skipped_existing > 0 && <> · <span className="text-amber-700">{b.skipped_existing} skipped</span></>}
                                                {b.failed > 0 && <> · <span className="text-red-600">{b.failed} failed</span></>}
                                            </div>
                                        </div>
                                    </button>
                                    {isOpen && (
                                        <div className="px-4 pb-4 pt-1 space-y-3">
                                            {b.created_rows.length > 0 && (
                                                <div data-testid={`bulk-history-created-${b.id}`}>
                                                    <div className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-emerald-700 mb-1.5">Created ({b.created_rows.length})</div>
                                                    <ul className="space-y-1">
                                                        {b.created_rows.map((r, i) => (
                                                            <li key={i} className="flex items-center gap-2 text-[12px]">
                                                                <Mail size={11} className="text-[#86868B] shrink-0" />
                                                                <span className="font-mono text-[11.5px] truncate">{r.email}</span>
                                                                <span className="text-[#6E6E73]">— {r.business_name}</span>
                                                                <span className="ml-auto inline-flex items-center gap-1">
                                                                    {r.sent
                                                                        ? <span className="text-emerald-700 inline-flex items-center gap-1"><Check size={11} /> sent</span>
                                                                        : <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={11} /> not sent</span>}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {b.skipped_rows.length > 0 && (
                                                <div data-testid={`bulk-history-skipped-${b.id}`}>
                                                    <div className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-amber-700 mb-1.5">Skipped ({b.skipped_rows.length})</div>
                                                    <ul className="space-y-1">
                                                        {b.skipped_rows.map((r, i) => (
                                                            <li key={i} className="flex items-center gap-2 text-[12px]">
                                                                <Mail size={11} className="text-[#86868B] shrink-0" />
                                                                <span className="font-mono text-[11.5px] truncate">{r.email}</span>
                                                                <span className="text-[#6E6E73] truncate">— {r.reason || "already exists"}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {b.failed_rows.length > 0 && (
                                                <div data-testid={`bulk-history-failed-${b.id}`}>
                                                    <div className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-red-700 mb-1.5">Failed ({b.failed_rows.length})</div>
                                                    <ul className="space-y-1">
                                                        {b.failed_rows.map((r, i) => (
                                                            <li key={i} className="flex items-center gap-2 text-[12px]">
                                                                <XIcon size={11} className="text-red-600 shrink-0" />
                                                                <span className="font-mono text-[11.5px] truncate">{r.email}</span>
                                                                <span className="text-red-700 truncate">— {r.reason}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
