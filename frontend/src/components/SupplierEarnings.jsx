import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Loader2, TrendingUp, IndianRupee, Wallet, Package } from "lucide-react";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export default function SupplierEarnings() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/supplier/earnings");
                setData(data);
            } catch (e) { toast.error(formatApiError(e)); }
            finally { setLoading(false); }
        })();
    }, []);

    if (loading) {
        return (
            <div className="py-14 text-center text-[#6E6E73] flex items-center justify-center gap-2" data-testid="earnings-loading">
                <Loader2 size={16} className="animate-spin" /> Loading earnings…
            </div>
        );
    }
    if (!data) return null;

    const { stats, orders } = data;

    return (
        <div data-testid="supplier-earnings-section" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { k: "Total GMV", v: fmtMoney(stats.total_gmv), Icon: TrendingUp },
                    { k: "Referral fee deducted", v: fmtMoney(stats.total_commission), Icon: IndianRupee },
                    { k: "Net payout", v: fmtMoney(stats.total_net), Icon: Wallet, hi: true },
                    { k: "Orders", v: stats.orders, Icon: Package },
                ].map((s) => (
                    <div key={s.k} className="tc-card-flat p-4" data-testid={`earnings-card-${s.k.replace(/\s+/g, "-").toLowerCase()}`}>
                        <s.Icon size={16} className="text-[#86868B]" />
                        <div className={`font-mono text-[22px] font-semibold mt-1 ${s.hi ? "text-emerald-700" : "text-[#0A0A0B]"}`}>{s.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            {orders.length === 0 ? (
                <div className="tc-card-flat p-10 text-center text-[#6E6E73]">No earnings yet — your first order will appear here.</div>
            ) : (
                <div className="tc-card-flat p-0 overflow-x-auto">
                    <table className="w-full text-[13px]" data-testid="earnings-table">
                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                            <tr>
                                <th className="text-left p-3">Date</th>
                                <th className="text-left p-3">Product</th>
                                <th className="text-right p-3">Qty</th>
                                <th className="text-right p-3">Order value</th>
                                <th className="text-right p-3">Referral fee</th>
                                <th className="text-right p-3">Net payout</th>
                                <th className="text-left p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((o) => (
                                <tr key={o.id} className="border-t border-black/[0.05]" data-testid={`earnings-row-${o.id}`}>
                                    <td className="p-3 text-[12px] text-[#6E6E73]">{new Date(o.created_at).toLocaleDateString()}</td>
                                    <td className="p-3"><span className="font-mono font-semibold">{o.brand} · {o.model_number}</span></td>
                                    <td className="p-3 text-right font-mono">{o.qty}</td>
                                    <td className="p-3 text-right font-mono">{fmtMoney(o.total)}</td>
                                    <td className="p-3 text-right">
                                        {o.commission == null ? (
                                            <span className="text-[11px] text-[#86868B] italic">Deal basis</span>
                                        ) : (
                                            <div className="font-mono text-[#0A0A0B]">−{fmtMoney(o.commission)}</div>
                                        )}
                                    </td>
                                    <td className="p-3 text-right font-mono font-semibold text-emerald-700">{fmtMoney(o.payout)}</td>
                                    <td className="p-3 text-[11px] uppercase font-semibold tracking-[0.1em] text-[#0A0A0B]">{o.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
