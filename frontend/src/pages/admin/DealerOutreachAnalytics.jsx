import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    BarChart3, Loader2, Mail, Check, X as XIcon, AlertTriangle, ChevronDown,
    ChevronRight, TrendingDown, UserCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import api, { formatApiError } from "../../lib/api";

const STAGE_KEYS = ["invited", "signed_in", "business_details", "docs_uploaded", "submitted_for_review", "approved"];
const STAGE_LABELS = {
    invited: "Invited",
    signed_in: "Signed in",
    business_details: "Business details",
    docs_uploaded: "Docs uploaded",
    submitted_for_review: "Submitted for review",
    approved: "Approved",
};

function fmtDate(s) {
    if (!s) return "—";
    try {
        return new Date(s).toLocaleString("en-IN", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
    } catch { return s; }
}

/**
 * Wave 102 — Dealer Outreach Analytics funnel.
 *
 * Replaces the old "Bulk History" dialog. Shows where bulk-invited dealers
 * drop off (funnel chart) and a per-dealer drill-down with their last
 * reached stage.
 */
export default function DealerOutreachAnalytics({ open, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [stageFilter, setStageFilter] = useState("");
    const [expanded, setExpanded] = useState(new Set());

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        api.get("/admin/dealers/outreach-funnel")
            .then(({ data }) => setData(data))
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    }, [open]);

    const stages = data?.stages || [];
    const dealers = data?.dealers || [];
    const invitedCount = stages.find((s) => s.key === "invited")?.count || 0;

    const filteredDealers = useMemo(() => {
        if (!stageFilter) return dealers;
        return dealers.filter((d) => d.furthest_stage === stageFilter);
    }, [dealers, stageFilter]);

    const toggle = (em) => {
        const next = new Set(expanded);
        if (next.has(em)) next.delete(em); else next.add(em);
        setExpanded(next);
    };

    // Per-stage drop-off (compared to previous stage).
    const stageDropoffs = useMemo(() => {
        const m = {};
        for (let i = 0; i < stages.length; i++) {
            const cur = stages[i];
            const prev = stages[i - 1];
            if (!prev || prev.count === 0) {
                m[cur.key] = null;
                continue;
            }
            m[cur.key] = prev.count - cur.count;
        }
        return m;
    }, [stages]);

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[920px] max-h-[88vh] overflow-y-auto p-6 rounded-[18px]" data-testid="outreach-analytics-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[20px] flex items-center gap-2" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        <BarChart3 size={18} /> Dealer Outreach Analytics
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="py-10 text-center text-[#6E6E73] flex items-center justify-center gap-2" data-testid="outreach-loading">
                        <Loader2 size={16} className="animate-spin" /> Loading funnel…
                    </div>
                ) : !data || invitedCount === 0 ? (
                    <div className="py-10 text-center text-[#6E6E73] text-[13px]" data-testid="outreach-empty">
                        No bulk-dealer outreach batches yet. Upload your first CSV via &quot;Bulk add dealers&quot;.
                    </div>
                ) : (
                    <div className="space-y-5 mt-2">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3" data-testid="outreach-summary">
                            <SummaryCard label="Total invited" value={invitedCount} />
                            <SummaryCard label="Approved" value={stages.find((s) => s.key === "approved")?.count || 0} accent="emerald" />
                            <SummaryCard
                                label="Conversion rate"
                                value={`${invitedCount ? Math.round(((stages.find((s) => s.key === "approved")?.count || 0) / invitedCount) * 100) : 0}%`}
                                accent="cyan"
                            />
                        </div>

                        {/* Funnel bars */}
                        <div className="bg-white border border-black/[0.06] rounded-xl p-4" data-testid="outreach-funnel">
                            <div className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-[#6E6E73] mb-3">Funnel — last reached stage</div>
                            <div className="space-y-2">
                                {stages.map((s) => {
                                    const pct = invitedCount > 0 ? Math.round((s.count / invitedCount) * 100) : 0;
                                    const drop = stageDropoffs[s.key];
                                    const active = stageFilter === s.key;
                                    return (
                                        <button
                                            key={s.key}
                                            type="button"
                                            onClick={() => setStageFilter(active ? "" : s.key)}
                                            className={`w-full text-left rounded-lg border ${active ? "border-[#00838f] bg-[#ECFBFD]" : "border-black/[0.06] bg-[#FBFBFC] hover:bg-[#F4F4F6]"} px-3 py-2 transition`}
                                            data-testid={`funnel-bar-${s.key}`}
                                        >
                                            <div className="flex items-center justify-between gap-3 mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12.5px] font-semibold text-[#0A0A0B]">{s.label}</span>
                                                    {drop !== null && drop !== undefined && drop > 0 && (
                                                        <span className="inline-flex items-center gap-1 text-[10.5px] text-red-600">
                                                            <TrendingDown size={10} /> -{drop} drop-off
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[12.5px] font-mono">
                                                    <strong>{s.count}</strong> <span className="text-[#86868B]">/ {invitedCount}</span>
                                                    <span className="ml-2 text-[11.5px] text-[#6E6E73]">{pct}%</span>
                                                </div>
                                            </div>
                                            <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-[#00B7C7] to-[#00838f]"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {stageFilter && (
                                <div className="mt-3 text-[12px] flex items-center justify-between">
                                    <span className="text-[#0A4A50]">
                                        Showing dealers stuck at <strong>{STAGE_LABELS[stageFilter]}</strong>
                                    </span>
                                    <button onClick={() => setStageFilter("")} className="text-[#00838f] hover:underline" data-testid="funnel-clear-filter">Clear</button>
                                </div>
                            )}
                        </div>

                        {/* Drill-down table */}
                        <div className="bg-white border border-black/[0.06] rounded-xl overflow-hidden" data-testid="outreach-dealers-table">
                            <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between">
                                <div className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-[#6E6E73]">
                                    Dealer drill-down ({filteredDealers.length})
                                </div>
                                <span className="text-[11px] text-[#86868B]">Sorted by stage</span>
                            </div>
                            {filteredDealers.length === 0 ? (
                                <div className="py-8 text-center text-[#86868B] text-[12.5px]">No dealers at this stage.</div>
                            ) : (
                                <ul className="divide-y divide-black/[0.04]">
                                    {filteredDealers.map((d) => {
                                        const isOpen = expanded.has(d.email);
                                        return (
                                            <li key={d.email} data-testid={`outreach-dealer-${d.email}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggle(d.email)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F8F9FB]"
                                                >
                                                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-semibold text-[#0A0A0B] truncate">{d.business_name}</div>
                                                        <div className="text-[11.5px] text-[#6E6E73] truncate flex items-center gap-2">
                                                            <Mail size={11} /> {d.email}
                                                            {d.seller_id && (
                                                                <span className="font-mono text-[10.5px] bg-[#00838f]/10 border border-[#00838f]/20 text-[#00838f] rounded px-1.5">{d.seller_id}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <StageBadge stage={d.furthest_stage} />
                                                </button>
                                                {isOpen && (
                                                    <div className="px-4 pb-3 pt-1 ml-7 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
                                                        {STAGE_KEYS.map((k) => {
                                                            const passed = !!d.stages?.[k];
                                                            return (
                                                                <div key={k} className="flex items-center gap-1.5">
                                                                    {passed
                                                                        ? <Check size={11} className="text-emerald-600" />
                                                                        : <XIcon size={11} className="text-[#86868B]" />}
                                                                    <span className={passed ? "text-[#0A0A0B]" : "text-[#86868B]"}>{STAGE_LABELS[k]}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        <div className="col-span-2 mt-2 text-[11px] text-[#86868B]">
                                                            Invited {fmtDate(d.invited_at)}
                                                            {d.signed_in_at && <> · Last sign-in {fmtDate(d.signed_in_at)}</>}
                                                            {d.approved_at && <> · Approved {fmtDate(d.approved_at)}</>}
                                                            {!d.email_delivered && (
                                                                <> · <span className="text-amber-700 inline-flex items-center gap-0.5"><AlertTriangle size={10} /> magic link not sent</span></>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function SummaryCard({ label, value, accent }) {
    const cls = accent === "emerald"
        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
        : accent === "cyan"
            ? "bg-[#ECFBFD] border-[#C2EFF5] text-[#0A6E78]"
            : "bg-[#F4F4F6] border-black/[0.06] text-[#0A0A0B]";
    return (
        <div className={`rounded-xl border ${cls} px-3 py-2.5`} data-testid={`outreach-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="text-[9.5px] uppercase tracking-[0.16em] font-semibold opacity-70">{label}</div>
            <div className="text-[20px] font-bold mt-0.5">{value}</div>
        </div>
    );
}

function StageBadge({ stage }) {
    const label = STAGE_LABELS[stage] || stage;
    const cls = stage === "approved"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : stage === "submitted_for_review"
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : stage === "invited"
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-[#F4F4F6] text-[#0A0A0B] border-black/[0.08]";
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`} data-testid={`stage-badge-${stage}`}>
            {stage === "approved" && <UserCheck size={10} />}
            {label}
        </span>
    );
}
