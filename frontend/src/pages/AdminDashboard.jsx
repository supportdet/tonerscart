import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Check, X } from "lucide-react";

const STATUS_LABEL = {
    requested: "tc-badge-amber",
    accepted: "tc-badge-blue",
    shipped: "tc-badge-blue",
    completed: "tc-badge-green",
    rejected: "tc-badge-red",
};

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [pending, setPending] = useState([]);
    const [users, setUsers] = useState([]);
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);

    const load = async () => {
        try {
            const [s, p, u, pr, o] = await Promise.all([
                api.get("/admin/stats"),
                api.get("/admin/suppliers/pending"),
                api.get("/admin/users"),
                api.get("/admin/products"),
                api.get("/admin/orders"),
            ]);
            setStats(s.data); setPending(p.data); setUsers(u.data); setProducts(pr.data); setOrders(o.data);
        } catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { load(); }, []);

    const approve = async (id) => { try { await api.post(`/admin/suppliers/${id}/approve`); toast.success("Approved"); load(); } catch (e) { toast.error(formatApiError(e)); } };
    const reject = async (id) => { try { await api.post(`/admin/suppliers/${id}/reject`); toast.success("Rejected"); load(); } catch (e) { toast.error(formatApiError(e)); } };
    const removeUser = async (id) => {
        if (!window.confirm("Delete this user?")) return;
        try { await api.delete(`/admin/users/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div className="tc-container py-10" data-testid="admin-dashboard">
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Admin Console</div>
            <h1 className="tc-display text-3xl font-bold text-[#0B1B3D] mt-1">Platform overview</h1>

            {stats && (
                <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-8">
                    {[
                        { k: "Users", v: stats.users },
                        { k: "Customers", v: stats.customers },
                        { k: "Suppliers", v: stats.suppliers_total },
                        { k: "Pending suppliers", v: stats.suppliers_pending, hl: stats.suppliers_pending > 0 },
                        { k: "Products", v: stats.products },
                        { k: "Orders", v: stats.orders },
                    ].map((s) => (
                        <div key={s.k} className={`tc-card p-4 ${s.hl ? "border-amber-300 bg-amber-50" : ""}`}>
                            <div className="tc-eyebrow">{s.k}</div>
                            <div className="font-mono text-2xl font-bold text-[#0B1B3D] mt-1">{s.v}</div>
                        </div>
                    ))}
                </div>
            )}

            <Tabs defaultValue="suppliers" className="mt-10">
                <TabsList data-testid="admin-tabs">
                    <TabsTrigger value="suppliers" data-testid="admin-tab-suppliers">Supplier Approvals ({pending.length})</TabsTrigger>
                    <TabsTrigger value="users" data-testid="admin-tab-users">Users</TabsTrigger>
                    <TabsTrigger value="products" data-testid="admin-tab-products">Products</TabsTrigger>
                    <TabsTrigger value="orders" data-testid="admin-tab-orders">Orders</TabsTrigger>
                </TabsList>

                <TabsContent value="suppliers">
                    <div className="tc-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <tr><th className="p-3">Company</th><th className="p-3">Contact</th><th className="p-3">City</th><th className="p-3">Joined</th><th className="p-3"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pending.map((s) => (
                                    <tr key={s.id} data-testid={`pending-supplier-${s.id}`}>
                                        <td className="p-3"><div className="font-semibold text-[#0B1B3D]">{s.company || s.name}</div><div className="text-xs text-slate-500">{s.name}</div></td>
                                        <td className="p-3"><div>{s.email}</div><div className="text-xs text-slate-500">{s.phone}</div></td>
                                        <td className="p-3">{s.city}</td>
                                        <td className="p-3 font-mono text-xs">{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                                        <td className="p-3">
                                            <div className="flex gap-2 justify-end">
                                                <Button size="sm" className="btn-accent text-white" onClick={() => approve(s.id)} data-testid={`approve-${s.id}`}><Check size={14} className="mr-1" /> Approve</Button>
                                                <Button size="sm" variant="outline" onClick={() => reject(s.id)} data-testid={`reject-${s.id}`}><X size={14} className="mr-1" /> Reject</Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {pending.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-slate-500">No suppliers awaiting approval.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="users">
                    <div className="tc-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">City</th><th className="p-3"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map((u) => (
                                    <tr key={u.id} data-testid={`user-row-${u.id}`}>
                                        <td className="p-3"><div className="font-semibold">{u.name}</div><div className="text-xs text-slate-500">{u.company}</div></td>
                                        <td className="p-3">{u.email}</td>
                                        <td className="p-3"><span className="tc-badge tc-badge-gray">{u.role}</span></td>
                                        <td className="p-3">{u.supplier_status ? <span className={`tc-badge ${u.supplier_status === "approved" ? "tc-badge-green" : u.supplier_status === "pending" ? "tc-badge-amber" : "tc-badge-red"}`}>{u.supplier_status}</span> : "—"}</td>
                                        <td className="p-3">{u.city}</td>
                                        <td className="p-3 text-right">
                                            {u.role !== "admin" && (
                                                <Button size="icon" variant="ghost" onClick={() => removeUser(u.id)} data-testid={`delete-user-${u.id}`}><Trash2 size={14} /></Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="products">
                    <div className="tc-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <tr><th className="p-3">Model</th><th className="p-3">Brand</th><th className="p-3">Supplier</th><th className="p-3">City</th><th className="p-3">Price</th><th className="p-3">Stock</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {products.map((p) => (
                                    <tr key={p.id} data-testid={`admin-product-${p.id}`}>
                                        <td className="p-3"><div className="font-semibold text-[#0B1B3D]">{p.model_number}</div><div className="text-xs text-slate-500">{p.title}</div></td>
                                        <td className="p-3">{p.brand}</td>
                                        <td className="p-3">{p.supplier_company || p.supplier_name}</td>
                                        <td className="p-3">{p.city}</td>
                                        <td className="p-3 font-mono">₹{p.price.toLocaleString('en-IN')}</td>
                                        <td className="p-3 font-mono">{p.stock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="orders">
                    <div className="tc-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Supplier</th><th className="p-3">Toner</th><th className="p-3">Total</th><th className="p-3">Status</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orders.map((o) => (
                                    <tr key={o.id} data-testid={`admin-order-${o.id}`}>
                                        <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}</td>
                                        <td className="p-3">{o.customer_name}<div className="text-xs text-slate-500">{o.customer_email}</div></td>
                                        <td className="p-3">{o.supplier_company || o.supplier_name}</td>
                                        <td className="p-3">{o.model_number} · {o.brand} <span className="text-xs text-slate-500">×{o.quantity}</span></td>
                                        <td className="p-3 font-mono">₹{o.total.toLocaleString('en-IN')}</td>
                                        <td className="p-3"><span className={`tc-badge ${STATUS_LABEL[o.status]}`}>{o.status}</span></td>
                                    </tr>
                                ))}
                                {orders.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-500">No orders on platform yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
