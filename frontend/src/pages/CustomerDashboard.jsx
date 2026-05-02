import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { PackageSearch } from "lucide-react";

const STATUS_LABEL = {
    requested: { label: "Requested", cls: "tc-badge-amber" },
    accepted: { label: "Accepted", cls: "tc-badge-blue" },
    shipped: { label: "Shipped", cls: "tc-badge-blue" },
    completed: { label: "Completed", cls: "tc-badge-green" },
    rejected: { label: "Rejected", cls: "tc-badge-red" },
};

export default function CustomerDashboard() {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const r = await api.get("/orders/mine");
            setOrders(r.data);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    return (
        <div className="tc-container py-10" data-testid="customer-dashboard">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Buyer Dashboard</div>
                    <h1 className="tc-display text-3xl font-bold text-[#0B1B3D] mt-1">Hello {user.name}</h1>
                    <div className="text-slate-600 text-sm mt-1">{user.company || "Buyer account"} · {user.city || "India"}</div>
                </div>
                <Button className="btn-accent text-white" onClick={() => window.location.href = "/search"} data-testid="customer-browse-btn">Browse toners</Button>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-8">
                {[
                    { k: "Total orders", v: orders.length },
                    { k: "In progress", v: orders.filter(o => ["requested", "accepted", "shipped"].includes(o.status)).length },
                    { k: "Completed", v: orders.filter(o => o.status === "completed").length },
                ].map((s) => (
                    <div key={s.k} className="tc-card p-5">
                        <div className="tc-eyebrow">{s.k}</div>
                        <div className="font-mono text-3xl font-bold text-[#0B1B3D] mt-1">{s.v}</div>
                    </div>
                ))}
            </div>

            <h2 className="tc-display text-xl font-semibold text-[#0B1B3D] mt-10 mb-3">My orders</h2>
            {loading ? (
                <div className="tc-card p-8 text-center text-slate-500">Loading…</div>
            ) : orders.length === 0 ? (
                <div className="tc-card p-12 text-center" data-testid="customer-empty-state">
                    <PackageSearch className="mx-auto text-slate-300" size={42} />
                    <div className="tc-display font-semibold text-[#0B1B3D] mt-3">No orders yet</div>
                    <div className="text-sm text-slate-500 mt-1">Search for a toner model and send your first order request.</div>
                </div>
            ) : (
                <div className="tc-card overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="p-3">Order</th>
                                <th className="p-3">Toner</th>
                                <th className="p-3">Supplier</th>
                                <th className="p-3">Qty</th>
                                <th className="p-3">Total</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Tracking</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {orders.map((o) => (
                                <tr key={o.id} data-testid={`customer-order-row-${o.id}`}>
                                    <td className="p-3 font-mono text-xs text-slate-500">{o.id.slice(0, 8)}</td>
                                    <td className="p-3">
                                        <div className="font-semibold text-[#0B1B3D]">{o.model_number}</div>
                                        <div className="text-xs text-slate-500">{o.brand} · {o.product_title}</div>
                                    </td>
                                    <td className="p-3">{o.supplier_company || o.supplier_name}</td>
                                    <td className="p-3 font-mono">{o.quantity}</td>
                                    <td className="p-3 font-mono font-semibold">₹{o.total.toLocaleString('en-IN')}</td>
                                    <td className="p-3"><span className={`tc-badge ${STATUS_LABEL[o.status].cls}`}>{STATUS_LABEL[o.status].label}</span></td>
                                    <td className="p-3 font-mono text-xs">{o.tracking_number || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
