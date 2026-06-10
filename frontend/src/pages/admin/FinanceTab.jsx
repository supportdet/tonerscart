import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Loader2, Download, TrendingUp, IndianRupee, Wallet, Users } from "lucide-react";
import { Button } from "../../components/ui/button";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export default function FinanceTab() {
    const [summary, setSummary] = useState([]);
    const [dealers, setDealers] = useState([]);
    const [dues, setDues] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const [s, d, p] = await Promise.all([
                api.get("/admin/finance/summary"),
                api.get("/admin/finance/dealers"),
                api.get("/admin/finance/procurement-dues"),
            ]);
            setSummary(Array.isArray(s.data) ? s.data : []);
            setDealers(Array.isArray(d.data) ? d.data : []);
            setDues(p.data?.rows || []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const totals = summary.reduce((acc, r) => ({
        orders: acc.orders + (r.orders || 0),
        gmv: acc.gmv + (r.gmv || 0),
        commission: acc.commission + (r.commission || 0),
        payout: acc.payout + (r.payout || 0),
    }), { orders: 0, gmv: 0, commission: 0, payout: 0 });

    const downloadCsv = async (path, filename) => {
        try {
            const r = await api.get(path, { responseType: "blob" });
            const url = URL.createObjectURL(new Blob([r.data], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url; a.download = filename; document.body.appendChild(a); a.click();
            a.remove(); URL.revokeObjectURL(url);
        } catch (e) { toast.error(formatApiError(e)); }
    };

    if (loading) return (
        <div className="py-20 text-center text-[#6E6E73] flex items-center justify-center gap-2" data-testid="finance-loading">
            <Loader2 size={16} className="animate-spin" /> Loading finance data…
        </div>
    );

    return (
        <div data-testid="admin-finance-tab" className="space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { k: "Total GMV", v: fmtMoney(totals.gmv), Icon: TrendingUp, color: "text-[#0A0A0B]" },
                    { k: "Commission earned", v: fmtMoney(totals.commission), Icon: IndianRupee, color: "text-emerald-600" },
                    { k: "Dealer payouts", v: fmtMoney(totals.payout), Icon: Wallet, color: "text-blue-600" },
                    { k: "Active dealers", v: dealers.length, Icon: Users, color: "text-[#0A0A0B]" },
                ].map((s) => (
                    <div key={s.k} className="tc-card-flat p-4" data-testid={`finance-card-${s.k.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="flex items-center justify-between">
                            <s.Icon size={16} className="text-[#86868B]" />
                        </div>
                        <div className={`font-mono text-[20px] font-semibold mt-1.5 ${s.color}`}>{s.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            <section>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Monthly summary</h2>
                    <Button variant="outline" onClick={() => downloadCsv("/admin/finance/export", "tonerscart_monthly_report.csv")} className="text-[12.5px]" data-testid="finance-export-summary">
                        <Download size={13} className="mr-1.5" /> Export CSV
                    </Button>
                </div>
                {summary.length === 0 ? (
                    <div className="tc-card-flat p-10 text-center text-[#6E6E73]">No order data yet.</div>
                ) : (
                    <div className="tc-card-flat p-0 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-[13px]" data-testid="finance-summary-table">
                            <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                <tr>
                                    <th className="text-left p-3">Month</th>
                                    <th className="text-right p-3">Orders</th>
                                    <th className="text-right p-3">GMV</th>
                                    <th className="text-right p-3">Commission</th>
                                    <th className="text-right p-3">Dealer payouts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.map((r) => (
                                    <tr key={r.month} className="border-t border-black/[0.05]">
                                        <td className="p-3 font-mono font-semibold">{r.month}</td>
                                        <td className="p-3 text-right font-mono">{r.orders}</td>
                                        <td className="p-3 text-right font-mono">{fmtMoney(r.gmv)}</td>
                                        <td className="p-3 text-right font-mono text-emerald-700">{fmtMoney(r.commission)}</td>
                                        <td className="p-3 text-right font-mono text-blue-700">{fmtMoney(r.payout)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Dealer payouts</h2>
                    <Button variant="outline" onClick={() => downloadCsv("/admin/finance/dealer-payouts/export", "tonerscart_dealer_payouts.csv")} className="text-[12.5px]" data-testid="finance-export-dealers">
                        <Download size={13} className="mr-1.5" /> Export CSV
                    </Button>
                </div>
                {dealers.length === 0 ? (
                    <div className="tc-card-flat p-10 text-center text-[#6E6E73]">No dealer transactions yet.</div>
                ) : (
                    <div className="tc-card-flat p-0 overflow-x-auto">
                        <table className="w-full min-w-[680px] text-[13px]" data-testid="finance-dealers-table">
                            <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                <tr>
                                    <th className="text-left p-3">Dealer</th>
                                    <th className="text-left p-3">City</th>
                                    <th className="text-right p-3">Orders</th>
                                    <th className="text-right p-3">GMV</th>
                                    <th className="text-right p-3">Commission</th>
                                    <th className="text-right p-3">Net payout</th>
                                    <th className="text-right p-3">Pending payout</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dealers.map((r) => (
                                    <tr key={r.id} className="border-t border-black/[0.05]" data-testid={`dealer-payout-${r.id}`}>
                                        <td className="p-3 font-semibold">{r.name}</td>
                                        <td className="p-3 text-[#6E6E73]">{r.city}</td>
                                        <td className="p-3 text-right font-mono">{r.orders}</td>
                                        <td className="p-3 text-right font-mono">{fmtMoney(r.gmv)}</td>
                                        <td className="p-3 text-right font-mono text-emerald-700">{fmtMoney(r.commission)}</td>
                                        <td className="p-3 text-right font-mono text-blue-700 font-semibold">{fmtMoney(r.payout)}</td>
                                        <td className="p-3 text-right font-mono text-amber-700 font-semibold">{fmtMoney(r.pending_payout)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-[16px] font-semibold text-[#0A0A0B] mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>Procurement overdue payments</h2>
                {dues.length === 0 ? (
                    <div className="tc-card-flat p-10 text-center text-[#6E6E73]" data-testid="finance-dues-empty">No procurement accounts owe money right now.</div>
                ) : (
                    <div className="tc-card-flat p-0 overflow-x-auto">
                        <table className="w-full min-w-[680px] text-[13px]" data-testid="finance-dues-table">
                            <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                <tr>
                                    <th className="text-left p-3">Account</th>
                                    <th className="text-left p-3">Type</th>
                                    <th className="text-right p-3">Credit limit</th>
                                    <th className="text-right p-3">Available</th>
                                    <th className="text-right p-3">Amount owed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dues.map((r) => (
                                    <tr key={r.id} className="border-t border-black/[0.05]" data-testid={`finance-due-${r.id}`}>
                                        <td className="p-3">
                                            <div className="font-semibold">{r.org_name || r.name || "—"}</div>
                                            <div className="text-[11px] text-[#86868B]">{r.email}</div>
                                        </td>
                                        <td className="p-3 text-[#6E6E73] capitalize">{r.type || "—"}</td>
                                        <td className="p-3 text-right font-mono">{fmtMoney(r.credit_limit)}</td>
                                        <td className="p-3 text-right font-mono">{fmtMoney(r.available)}</td>
                                        <td className="p-3 text-right font-mono text-red-700 font-semibold">{fmtMoney(r.owed)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
