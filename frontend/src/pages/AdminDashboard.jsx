import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Check, X } from "lucide-react";

const STATUS_CLS = {
    requested: "tc-badge-yellow", accepted: "tc-badge-cyan",
    shipped: "tc-badge-magenta", completed: "tc-badge-green", rejected: "tc-badge-red",
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
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Admin console</div>
            <h1 className="text-3xl font-bold text-[#0E0F12] mt-1">Platform overview</h1>

            {stats && (
                <div className="grid sm:grid-cols-3 lg:grid-cols-7 gap-4 mt-8">
                    {[
                        { k: "Users", v: stats.users, c: "#0E0F12" },
                        { k: "Customers", v: stats.customers, c: "#00B7C7" },
                        { k: "Suppliers", v: stats.suppliers_total, c: "#E6007E" },
                        { k: "Pending", v: stats.suppliers_pending, c: "#F7C600", hl: stats.suppliers_pending > 0 },
                        { k: "Catalog", v: stats.toner_master, c: "#0E0F12" },
                        { k: "Listings", v: stats.products, c: "#00B7C7" },
                        { k: "Orders", v: stats.orders, c: "#E6007E" },
                    ].map((s) => (
                        <div key={s.k} className={`tc-card p-4 ${s.hl ? "ring-2 ring-[#F7C600]" : ""}`}>
                            <div className="flex items-center gap-2"><span className="w-1.5 h-4" style={{ background: s.c }} /><div className="tc-eyebrow">{s.k}</div></div>
                            <div className="font-mono text-2xl font-bold text-[#0E0F12] mt-1">{s.v}</div>
                        </div>
                    ))}
                </div>
            )}

            <Tabs defaultValue="suppliers" className="mt-10">
                <TabsList data-testid="admin-tabs">
                    <TabsTrigger value="suppliers" data-testid="admin-tab-suppliers">Approvals ({pending.length})</TabsTrigger>
                    <TabsTrigger value="users" data-testid="admin-tab-users">Users ({users.length})</TabsTrigger>
                    <TabsTrigger value="products" data-testid="admin-tab-products">Products ({products.length})</TabsTrigger>
                    <TabsTrigger value="orders" data-testid="admin-tab-orders">Orders ({orders.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="suppliers">
                    <div className="tc-card-flat overflow-x-auto">
                        <table className="tc-table">
                            <thead><tr><th>Company</th><th>Contact</th><th>City</th><th>Joined</th><th></th></tr></thead>
                            <tbody>
                                {pending.map((s) => (
                                    <tr key={s.id} data-testid={`pending-supplier-${s.id}`}>
                                        <td><div className="font-semibold text-[#0E0F12]">{s.company || s.name}</div><div className="text-xs text-slate-500">{s.name}</div></td>
                                        <td><div>{s.email}</div><div className="text-xs text-slate-500">{s.phone}</div></td>
                                        <td>{s.city}</td>
                                        <td className="font-mono text-xs">{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                                        <td>
                                            <div className="flex gap-2 justify-end">
                                                <Button size="sm" className="btn-cta" onClick={() => approve(s.id)} data-testid={`approve-${s.id}`}><Check size={14} className="mr-1" /> Approve</Button>
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
                    <div className="tc-card-flat overflow-x-auto">
                        <table className="tc-table">
                            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>City</th><th></th></tr></thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} data-testid={`user-row-${u.id}`}>
                                        <td><div className="font-semibold">{u.name}</div><div className="text-xs text-slate-500">{u.company}</div></td>
                                        <td>{u.email}</td>
                                        <td><span className="tc-badge tc-badge-gray">{u.role}</span></td>
                                        <td>{u.supplier_status ? <span className={`tc-badge ${u.supplier_status === "approved" ? "tc-badge-green" : u.supplier_status === "pending" ? "tc-badge-yellow" : "tc-badge-red"}`}>{u.supplier_status}</span> : "—"}</td>
                                        <td>{u.city}</td>
                                        <td className="text-right">
                                            {u.role !== "admin" && (<Button size="icon" variant="ghost" onClick={() => removeUser(u.id)} data-testid={`delete-user-${u.id}`}><Trash2 size={14} /></Button>)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="products">
                    <div className="tc-card-flat overflow-x-auto">
                        <table className="tc-table">
                            <thead><tr><th>Model</th><th>Brand</th><th>Type</th><th>Supplier</th><th>City</th><th>Price</th><th>Stock</th></tr></thead>
                            <tbody>
                                {products.slice(0, 200).map((p) => (
                                    <tr key={p.id} data-testid={`admin-product-${p.id}`}>
                                        <td><div className="font-semibold font-mono text-[#0E0F12]">{p.model_number}</div><div className="text-xs text-slate-500">{p.title}</div></td>
                                        <td>{p.brand}</td>
                                        <td><span className="tc-badge tc-badge-gray">{p.toner_type || "Original"}</span></td>
                                        <td>{p.supplier_company || p.supplier_name}</td>
                                        <td>{p.city}</td>
                                        <td className="font-mono">₹{p.price.toLocaleString('en-IN')}</td>
                                        <td className="font-mono">{p.stock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {products.length > 200 && <div className="p-3 text-xs text-slate-500 text-center">Showing first 200 of {products.length} listings</div>}
                    </div>
                </TabsContent>

                <TabsContent value="orders">
                    <div className="tc-card-flat overflow-x-auto">
                        <table className="tc-table">
                            <thead><tr><th>Order</th><th>Customer</th><th>Supplier</th><th>Toner</th><th>Total</th><th>Status</th></tr></thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr key={o.id} data-testid={`admin-order-${o.id}`}>
                                        <td className="font-mono text-xs">{o.id.slice(0, 8)}</td>
                                        <td>{o.customer_name}<div className="text-xs text-slate-500">{o.customer_email}</div></td>
                                        <td>{o.supplier_company || o.supplier_name}</td>
                                        <td><span className="font-mono">{o.model_number}</span> · {o.brand} <span className="text-xs text-slate-500">×{o.quantity}</span></td>
                                        <td className="font-mono">₹{o.total.toLocaleString('en-IN')}</td>
                                        <td><span className={`tc-badge ${STATUS_CLS[o.status]}`}>{o.status}</span></td>
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
