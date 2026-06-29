import React, { useEffect, useState } from "react";
import { Wallet, AlertCircle, Calendar, ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import procApi, { formatApiError } from "../../lib/procApi";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso.slice(0, 10); }
};

/**
 * Wave 101 Phase 3 — Credit summary widget for procurement buyers.
 *
 * Renders below the existing limit/used/available KPIs:
 *   - Outstanding balance (sum unpaid debits − sum credits)
 *   - Next due date + overdue indicator
 *   - Recent ledger entries (last 20)
 *
 * Self-fetches /api/procurement/credit/summary on mount + on `refreshKey` change.
 */
export default function CreditSummaryWidget({ refreshKey = 0 }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        procApi.get("/procurement/credit/summary")
            .then(({ data }) => { if (alive) { setData(data); setError(""); } })
            .catch((e) => { if (alive) setError(formatApiError(e)); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [refreshKey]);

    if (loading) {
        return (
            <div className="tc-card-flat p-6 flex items-center gap-3 text-[#6E6E73]" data-testid="proc-credit-widget-loading">
                <Loader2 size={16} className="animate-spin" /> Loading credit details…
            </div>
        );
    }
    if (error) {
        return (
            <div className="tc-card-flat p-6 text-[13px] text-red-600" data-testid="proc-credit-widget-error">
                {error}
            </div>
        );
    }
    if (!data) return null;

    const outstanding = Number(data.outstanding || 0);
    const overdueCount = Number(data.overdue_count || 0);
    const ledger = Array.isArray(data.ledger) ? data.ledger : [];

    return (
        <div className="space-y-5" data-testid="proc-credit-widget">
            {/* Outstanding + Next-due row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                    className={`tc-card-flat p-5 ${outstanding > 0 ? "border-l-4 border-l-amber-500" : ""}`}
                    data-testid="proc-credit-outstanding"
                >
                    <div className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">
                        <Wallet size={12} /> Outstanding balance
                    </div>
                    <div
                        className={`mt-1.5 text-[24px] font-semibold ${outstanding > 0 ? "text-amber-600" : "text-emerald-600"}`}
                        style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}
                    >
                        {inr(outstanding)}
                    </div>
                    <div className="text-[12px] text-[#6E6E73] mt-1">
                        {outstanding > 0 ? "Sum of unpaid invoices after credits applied." : "All invoices settled."}
                    </div>
                </div>

                <div
                    className={`tc-card-flat p-5 ${overdueCount > 0 ? "border-l-4 border-l-red-500" : ""}`}
                    data-testid="proc-credit-next-due"
                >
                    <div className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">
                        <Calendar size={12} /> Next due
                    </div>
                    <div
                        className="mt-1.5 text-[24px] font-semibold text-[#0A0A0B]"
                        style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}
                    >
                        {fmtDate(data.next_due_date)}
                    </div>
                    <div className={`text-[12px] mt-1 flex items-center gap-1.5 ${overdueCount > 0 ? "text-red-600" : "text-[#6E6E73]"}`}>
                        {overdueCount > 0 && <AlertCircle size={12} />}
                        {overdueCount > 0
                            ? `${overdueCount} invoice${overdueCount > 1 ? "s" : ""} overdue`
                            : "No overdue invoices"}
                    </div>
                </div>
            </div>

            {/* Ledger */}
            <div className="tc-card-flat p-5" data-testid="proc-credit-ledger">
                <div className="flex items-center justify-between mb-3">
                    <h3
                        className="text-[15px] font-semibold text-[#0A0A0B]"
                        style={{ fontFamily: "'Montserrat', sans-serif" }}
                    >
                        Recent activity
                    </h3>
                    <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[#86868B]">Last {ledger.length}</span>
                </div>
                {ledger.length === 0 ? (
                    <div className="text-[13px] text-[#6E6E73] py-6 text-center" data-testid="proc-credit-ledger-empty">
                        No ledger entries yet. Your invoices and payments will appear here.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="text-[10.5px] tracking-[0.14em] uppercase text-[#86868B]">
                                    <th className="text-left py-2 font-semibold">Date</th>
                                    <th className="text-left py-2 font-semibold">Description</th>
                                    <th className="text-right py-2 font-semibold">Amount</th>
                                    <th className="text-right py-2 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledger.map((row) => {
                                    const isCredit = row.type === "credit";
                                    return (
                                        <tr
                                            key={row.id}
                                            className="border-t border-black/[0.05]"
                                            data-testid={`proc-credit-ledger-row-${row.id}`}
                                        >
                                            <td className="py-2.5 text-[#0A0A0B] whitespace-nowrap">{fmtDate(row.created_at)}</td>
                                            <td className="py-2.5 text-[#3a3a40] pr-3">
                                                <div className="flex items-center gap-1.5">
                                                    {isCredit
                                                        ? <ArrowUpRight size={12} className="text-emerald-600 shrink-0" />
                                                        : <ArrowDownRight size={12} className="text-amber-600 shrink-0" />}
                                                    <span>{row.note || (isCredit ? "Credit" : "Invoice debit")}</span>
                                                </div>
                                            </td>
                                            <td
                                                className={`py-2.5 text-right font-semibold whitespace-nowrap ${isCredit ? "text-emerald-600" : "text-amber-700"}`}
                                            >
                                                {isCredit ? "−" : "+"}{inr(row.amount)}
                                            </td>
                                            <td className="py-2.5 text-right text-[11.5px]">
                                                {row.paid_at
                                                    ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Settled</span>
                                                    : row.due_date && row.due_date < new Date().toISOString()
                                                        ? <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">Overdue</span>
                                                        : <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Due {fmtDate(row.due_date)}</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
