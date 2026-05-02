import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const STATUS_LABEL = {
    requested: { label: "Requested", cls: "tc-badge-amber" },
    accepted: { label: "Accepted", cls: "tc-badge-blue" },
    shipped: { label: "Shipped", cls: "tc-badge-blue" },
    completed: { label: "Completed", cls: "tc-badge-green" },
    rejected: { label: "Rejected", cls: "tc-badge-red" },
};

const EMPTY = { model_number: "", brand: "", title: "", description: "", price: "", stock: "", city: "", color: "Black", compatible_printers: "" };

export default function SupplierDashboard() {
    const { user } = useAuth();
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [trackingFor, setTrackingFor] = useState(null);
    const [tracking, setTracking] = useState("");

    const isApproved = user.supplier_status === "approved";

    const load = async () => {
        if (!isApproved) return;
        try {
            const [p, o] = await Promise.all([api.get("/supplier/products"), api.get("/orders/mine")]);
            setProducts(p.data);
            setOrders(o.data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => { load(); }, [isApproved]);

    const openNew = () => { setEditing("new"); setForm({ ...EMPTY, city: user.city || "" }); };
    const openEdit = (p) => { setEditing(p.id); setForm({ ...p, price: String(p.price), stock: String(p.stock) }); };
    const closeForm = () => setEditing(null);

    const handle = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const save = async () => {
        try {
            const payload = { ...form, price: Number(form.price), stock: Number(form.stock) };
            if (editing === "new") {
                await api.post("/supplier/products", payload);
                toast.success("Product added");
            } else {
                await api.put(`/supplier/products/${editing}`, payload);
                toast.success("Product updated");
            }
            closeForm();
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const remove = async (id) => {
        if (!window.confirm("Delete this product?")) return;
        try { await api.delete(`/supplier/products/${id}`); toast.success("Deleted"); load(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    const updateStatus = async (orderId, status, trk) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status, tracking_number: trk });
            toast.success(`Order marked ${status}`);
            setTrackingFor(null); setTracking("");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    if (!isApproved) {
        return (
            <div className="tc-container py-16 max-w-2xl" data-testid="supplier-pending-banner">
                <div className="tc-card p-8 border-amber-300 bg-amber-50">
                    <div className="tc-eyebrow text-amber-800"><span className="tc-strip mr-2 align-middle" />Supplier review</div>
                    <h1 className="tc-display text-2xl font-bold text-[#0B1B3D] mt-2">Your account is awaiting approval</h1>
                    <p className="text-amber-900/80 mt-2 text-sm">
                        Our admin team is reviewing your business details. Once approved, you&apos;ll be able to list toner products and start receiving order requests from buyers across India.
                    </p>
                    <div className="mt-4 text-xs font-mono text-amber-900/70">Status: {user.supplier_status || "pending"}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="tc-container py-10" data-testid="supplier-dashboard">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Supplier Dashboard</div>
                    <h1 className="tc-display text-3xl font-bold text-[#0B1B3D] mt-1">{user.company || user.name}</h1>
                    <div className="text-slate-600 text-sm mt-1">{user.city} · supplier account</div>
                </div>
                <Button className="btn-accent text-white" onClick={openNew} data-testid="supplier-add-product-btn"><Plus size={16} className="mr-1" /> Add product</Button>
            </div>

            <div className="grid sm:grid-cols-4 gap-4 mt-8">
                {[
                    { k: "Listings", v: products.length },
                    { k: "Total stock", v: products.reduce((a, p) => a + p.stock, 0) },
                    { k: "Orders", v: orders.length },
                    { k: "Pending", v: orders.filter(o => o.status === "requested").length },
                ].map((s) => (
                    <div key={s.k} className="tc-card p-5">
                        <div className="tc-eyebrow">{s.k}</div>
                        <div className="font-mono text-3xl font-bold text-[#0B1B3D] mt-1">{s.v}</div>
                    </div>
                ))}
            </div>

            <Tabs defaultValue="orders" className="mt-10">
                <TabsList data-testid="supplier-tabs">
                    <TabsTrigger value="orders" data-testid="supplier-tab-orders">Orders</TabsTrigger>
                    <TabsTrigger value="products" data-testid="supplier-tab-products">Products ({products.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="orders">
                    <div className="tc-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="p-3">Order</th>
                                    <th className="p-3">Customer</th>
                                    <th className="p-3">Toner</th>
                                    <th className="p-3">Qty</th>
                                    <th className="p-3">Total</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orders.map((o) => (
                                    <tr key={o.id} data-testid={`supplier-order-row-${o.id}`}>
                                        <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}</td>
                                        <td className="p-3">
                                            <div className="font-semibold text-[#0B1B3D]">{o.customer_name}</div>
                                            <div className="text-xs text-slate-500">{o.customer_email}</div>
                                            <div className="text-xs text-slate-500">{o.contact_phone}</div>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-semibold">{o.model_number}</div>
                                            <div className="text-xs text-slate-500">{o.brand}</div>
                                        </td>
                                        <td className="p-3 font-mono">{o.quantity}</td>
                                        <td className="p-3 font-mono font-semibold">₹{o.total.toLocaleString('en-IN')}</td>
                                        <td className="p-3"><span className={`tc-badge ${STATUS_LABEL[o.status].cls}`}>{STATUS_LABEL[o.status].label}</span></td>
                                        <td className="p-3">
                                            <div className="flex gap-2 flex-wrap">
                                                {o.status === "requested" && (
                                                    <>
                                                        <Button size="sm" className="btn-primary text-white" onClick={() => updateStatus(o.id, "accepted")} data-testid={`accept-${o.id}`}>Accept</Button>
                                                        <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "rejected")} data-testid={`reject-${o.id}`}>Reject</Button>
                                                    </>
                                                )}
                                                {o.status === "accepted" && (
                                                    <Button size="sm" className="btn-accent text-white" onClick={() => { setTrackingFor(o.id); setTracking(""); }} data-testid={`ship-${o.id}`}>Mark Shipped</Button>
                                                )}
                                                {o.status === "shipped" && (
                                                    <Button size="sm" className="btn-primary text-white" onClick={() => updateStatus(o.id, "completed")} data-testid={`complete-${o.id}`}>Mark Completed</Button>
                                                )}
                                                {o.tracking_number && <span className="text-xs font-mono text-slate-500 self-center">#{o.tracking_number}</span>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {orders.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-slate-500">No orders yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="products">
                    <div className="tc-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="p-3">Model</th>
                                    <th className="p-3">Brand</th>
                                    <th className="p-3">Price</th>
                                    <th className="p-3">Stock</th>
                                    <th className="p-3">City</th>
                                    <th className="p-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {products.map((p) => (
                                    <tr key={p.id} data-testid={`supplier-product-row-${p.id}`}>
                                        <td className="p-3"><div className="font-semibold text-[#0B1B3D]">{p.model_number}</div><div className="text-xs text-slate-500">{p.title}</div></td>
                                        <td className="p-3">{p.brand}</td>
                                        <td className="p-3 font-mono font-semibold">₹{p.price.toLocaleString('en-IN')}</td>
                                        <td className="p-3 font-mono">{p.stock}</td>
                                        <td className="p-3">{p.city}</td>
                                        <td className="p-3">
                                            <div className="flex gap-1 justify-end">
                                                <Button size="icon" variant="ghost" onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`}><Pencil size={14} /></Button>
                                                <Button size="icon" variant="ghost" onClick={() => remove(p.id)} data-testid={`delete-product-${p.id}`}><Trash2 size={14} /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {products.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-500">No products listed yet. Click &ldquo;Add product&rdquo; to begin.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Product form */}
            <Dialog open={!!editing} onOpenChange={(o) => !o && closeForm()}>
                <DialogContent className="max-w-2xl" data-testid="product-form-dialog">
                    <DialogHeader>
                        <DialogTitle className="tc-display text-[#0B1B3D]">{editing === "new" ? "Add Product" : "Edit Product"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                        <div><Label>Model number</Label><Input value={form.model_number} onChange={handle("model_number")} placeholder="HP 88A" data-testid="product-model-input" /></div>
                        <div><Label>Brand</Label><Input value={form.brand} onChange={handle("brand")} placeholder="HP" data-testid="product-brand-input" /></div>
                        <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={handle("title")} placeholder="HP 88A Black LaserJet Toner" data-testid="product-title-input" /></div>
                        <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={handle("price")} data-testid="product-price-input" /></div>
                        <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={handle("stock")} data-testid="product-stock-input" /></div>
                        <div><Label>City</Label><Input value={form.city} onChange={handle("city")} data-testid="product-city-input" /></div>
                        <div><Label>Color</Label><Input value={form.color} onChange={handle("color")} data-testid="product-color-input" /></div>
                        <div className="col-span-2"><Label>Compatible printers</Label><Input value={form.compatible_printers} onChange={handle("compatible_printers")} data-testid="product-printers-input" /></div>
                        <div className="col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={handle("description")} data-testid="product-description-input" /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeForm} data-testid="product-cancel-btn">Cancel</Button>
                        <Button className="btn-primary text-white" onClick={save} data-testid="product-save-btn">{editing === "new" ? "Add Product" : "Save Changes"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Tracking dialog */}
            <Dialog open={!!trackingFor} onOpenChange={(o) => !o && setTrackingFor(null)}>
                <DialogContent data-testid="tracking-dialog">
                    <DialogHeader><DialogTitle className="tc-display text-[#0B1B3D]">Mark as Shipped</DialogTitle></DialogHeader>
                    <Label>Tracking / consignment number</Label>
                    <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. BLR123456789" data-testid="tracking-input" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTrackingFor(null)}>Cancel</Button>
                        <Button className="btn-accent text-white" onClick={() => updateStatus(trackingFor, "shipped", tracking)} disabled={!tracking.trim()} data-testid="tracking-confirm-btn">Confirm Shipped</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
