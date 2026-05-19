import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { PackageSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STATUS_STYLE = {
    requested: "bg-amber-50 text-amber-700 border-amber-200",
    accepted: "bg-blue-50 text-blue-700 border-blue-200",
    shipped: "bg-violet-50 text-violet-700 border-violet-200",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function CustomerDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try { const r = await api.get("/orders/mine"); setOrders(Array.isArray(r.data) ? r.data : []); }
        catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    return (
        <div className="tc-container py-8 sm:py-10" data-testid="customer-dashboard">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Buyer dashboard</div>
                    <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                        Hello {user?.name}
                    </h1>
                    <div className="text-[14px] text-[#6E6E73] mt-1">{user?.city || "India"}</div>
                </div>
                <Button className="btn-cta" onClick={() => navigate("/search")} data-testid="customer-browse-btn">Browse toners</Button>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6 sm:mt-8">
                {[
                    { k: "Total", v: orders.length },
                    { k: "In progress", v: orders.filter(o => ["requested", "accepted", "shipped"].includes(o.status)).length },
                    { k: "Delivered", v: orders.filter(o => o.status === "delivered").length },
                ].map((s) => (
                    <div key={s.k} className="tc-card-flat p-4">
                        <div className="font-mono text-2xl font-semibold text-[#0A0A0B]">{s.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            <h2 className="text-[#0A0A0B] mt-10 mb-3" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>My orders</h2>
            {loading ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">Loading…</div>
            ) : orders.length === 0 ? (
                <div className="tc-card-flat p-12 text-center" data-testid="customer-empty-state">
                    <PackageSearch className="mx-auto text-[#D2D2D7]" size={42} />
                    <div className="font-semibold text-[#0A0A0B] mt-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>No orders yet</div>
                    <div className="text-[13px] text-[#6E6E73] mt-1">Search for a toner model and send your first order request.</div>
                </div>
            ) : (
                <div className="tc-card-flat p-0 overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                            <tr><th className="text-left p-3">Toner</th><th className="text-left p-3">Supplier</th><th className="text-left p-3">Qty</th><th className="text-left p-3">Total</th><th className="text-left p-3">Status</th><th className="text-left p-3">Tracking</th></tr>
                        </thead>
                        <tbody>
                            {orders.map((o) => (
                                <tr key={o.id} className="border-t border-black/[0.05]" data-testid={`customer-order-row-${o.id}`}>
                                    <td className="p-3">
                                        <div className="font-mono font-semibold text-[#0A0A0B]">{o.listings?.model_number || "—"}</div>
                                        <div className="text-[11px] text-[#86868B]">{o.listings?.brand} · {o.listings?.toner_type}</div>
                                    </td>
                                    <td className="p-3">{o.suppliers?.business_name || "—"}<div className="text-[11px] text-[#86868B]">{o.suppliers?.city}</div></td>
                                    <td className="p-3 font-mono">{o.qty}</td>
                                    <td className="p-3 font-mono font-semibold">₹{Number(o.total).toLocaleString('en-IN')}</td>
                                    <td className="p-3"><span className={`text-[11px] font-bold px-2 py-1 rounded-md border uppercase tracking-[0.08em] ${STATUS_STYLE[o.status] || STATUS_STYLE.cancelled}`}>{o.status}</span></td>
                                    <td className="p-3 font-mono text-[12px]">{o.tracking_number || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
