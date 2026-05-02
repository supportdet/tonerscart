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
import { Plus, Pencil, Trash2, Search } from "lucide-react";

const STATUS_LABEL = {
    requested: { label: "Requested", cls: "tc-badge-yellow" },
    accepted: { label: "Accepted", cls: "tc-badge-cyan" },
    shipped: { label: "Shipped", cls: "tc-badge-magenta" },
    completed: { label: "Completed", cls: "tc-badge-green" },
    rejected: { label: "Rejected", cls: "tc-badge-red" },
};

const EMPTY = { master_id: "", model_number: "", brand: "", title: "", description: "", price: "", stock: "", city: "", color: "Black", toner_type: "Original", compatible_printers: "" };

export default function SupplierDashboard() {
    const { user } = useAuth();
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [trackingFor, setTrackingFor] = useState(null);
    const [tracking, setTracking] = useState("");

    // TonerMaster picker
    const [masterQ, setMasterQ] = useState("");
    const [masterResults, setMasterResults] = useState([]);
    const [masterPicked, setMasterPicked] = useState(null);

    const isApproved = user.supplier_status === "approved";

    const load = async () => {
        if (!isApproved) return;
        try {
            const [p, o] = await Promise.all([api.get("/supplier/products"), api.get("/orders/mine")]);
            setProducts(p.data); setOrders(o.data);
        } catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { load(); }, [isApproved]);

    useEffect(() => {
        const t = setTimeout(async () => {
            if (!masterQ || masterQ.length < 2) { setMasterResults([]); return; }
            const r = await api.get("/toner-master", { params: { q: masterQ, limit: 8 } });
            setMasterResults(r.data);
        }, 200);
        return () => clearTimeout(t);
    }, [masterQ]);

    const openNew = () => { setEditing("new"); setForm({ ...EMPTY, city: user.city || "" }); setMasterPicked(null); setMasterQ(""); setMasterResults([]); };
    const openEdit = (p) => {
        setEditing(p.id);
        setForm({ ...EMPTY, ...p, price: String(p.price), stock: String(p.stock) });
        setMasterPicked(p.master_id ? { id: p.master_id, brand: p.brand, model_number: p.model_number, color: p.color, toner_type: p.toner_type, printer_compatibility: p.compatible_printers } : null);
    };
    const closeForm = () => setEditing(null);

    const handle = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const pickMaster = (m) => {
        setMasterPicked(m);
        setMasterQ(""); setMasterResults([]);
        setForm((f) => ({
            ...f,
            master_id: m.id,
            brand: m.brand,
            model_number: m.model_number,
            title: `${m.brand} ${m.model_number} ${m.toner_type} ${m.color} Toner`,
            color: m.color,
            toner_type: m.toner_type,
            compatible_printers: m.printer_compatibility,
        }));
    };

    const save = async () => {
        if (!form.model_number || !form.brand || !form.price || !form.stock || !form.city) {
            toast.error("Model, brand, price, stock and city are required");
            return;
        }
        try {
            const payload = { ...form, price: Number(form.price), stock: Number(form.stock) };
            if (editing === "new") {
                await api.post("/supplier/products", payload);
                toast.success("Product listed — now searchable across the marketplace");
            } else {
                await api.put(`/supplier/products/${editing}`, payload);
                toast.success("Product updated");
            }
            closeForm(); load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const remove = async (id) => {
        if (!window.confirm("Delete this product listing?")) return;
        try { await api.delete(`/supplier/products/${id}`); toast.success("Deleted"); load(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    const updateStatus = async (orderId, status, trk) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status, tracking_number: trk });
            toast.success(`Order marked ${status}`);
            setTrackingFor(null); setTracking(""); load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    if (!isApproved) {
        return (
            <div className="tc-container py-16 max-w-2xl" data-testid="supplier-pending-banner">
                <div className="tc-card p-8 border-[#F7C600] bg-[#FFF8D6]">
                    <div className="tc-eyebrow text-amber-800"><span className="tc-strip mr-2 align-middle" />Supplier review</div>
                    <h1 className="text-2xl font-bold text-[#0E0F12] mt-2">Your account is awaiting approval</h1>
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
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Supplier dashboard</div>
                    <h1 className="text-3xl font-bold text-[#0E0F12] mt-1">{user.company || user.name}</h1>
                    <div className="text-slate-600 text-sm mt-1">{user.city} · supplier account · approved</div>
                </div>
                <Button className="btn-cta" onClick={openNew} data-testid="supplier-add-product-btn"><Plus size={16} className="mr-1" /> Add product</Button>
            </div>

            <div className="grid sm:grid-cols-4 gap-4 mt-8">
                {[
                    { k: "Listings", v: products.length, c: "#00B7C7" },
                    { k: "Total stock", v: products.reduce((a, p) => a + p.stock, 0), c: "#E6007E" },
                    { k: "Orders", v: orders.length, c: "#F7C600" },
                    { k: "Pending action", v: orders.filter(o => o.status === "requested").length, c: "#0E0F12" },
                ].map((s) => (
                    <div key={s.k} className="tc-card p-5">
                        <div className="flex items-center gap-2"><span className="w-1.5 h-4" style={{ background: s.c }} /><div className="tc-eyebrow">{s.k}</div></div>
                        <div className="font-mono text-3xl font-bold text-[#0E0F12] mt-1">{s.v}</div>
                    </div>
                ))}
            </div>

            <Tabs defaultValue="orders" className="mt-10">
                <TabsList data-testid="supplier-tabs">
                    <TabsTrigger value="orders" data-testid="supplier-tab-orders">Orders ({orders.length})</TabsTrigger>
                    <TabsTrigger value="products" data-testid="supplier-tab-products">Products ({products.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="orders">
                    <div className="tc-card-flat overflow-x-auto">
                        <table className="tc-table">
                            <thead><tr><th>Order</th><th>Customer</th><th>Toner</th><th>Qty</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr key={o.id} data-testid={`supplier-order-row-${o.id}`}>
                                        <td className="font-mono text-xs text-slate-500">{o.id.slice(0, 8)}</td>
                                        <td>
                                            <div className="font-semibold text-[#0E0F12]">{o.customer_name}</div>
                                            <div className="text-xs text-slate-500">{o.customer_email}</div>
                                            <div className="text-xs text-slate-500">{o.contact_phone}</div>
                                        </td>
                                        <td>
                                            <div className="font-semibold font-mono">{o.model_number}</div>
                                            <div className="text-xs text-slate-500">{o.brand}</div>
                                        </td>
                                        <td className="font-mono">{o.quantity}</td>
                                        <td className="font-mono font-semibold">₹{o.total.toLocaleString('en-IN')}</td>
                                        <td><span className={`tc-badge ${STATUS_LABEL[o.status].cls}`}>{STATUS_LABEL[o.status].label}</span></td>
                                        <td>
                                            <div className="flex gap-2 flex-wrap">
                                                {o.status === "requested" && (<>
                                                    <Button size="sm" className="btn-primary text-white" onClick={() => updateStatus(o.id, "accepted")} data-testid={`accept-${o.id}`}>Accept</Button>
                                                    <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "rejected")} data-testid={`reject-${o.id}`}>Reject</Button>
                                                </>)}
                                                {o.status === "accepted" && (
                                                    <Button size="sm" className="btn-cta" onClick={() => { setTrackingFor(o.id); setTracking(""); }} data-testid={`ship-${o.id}`}>Mark Shipped</Button>
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
                    <div className="tc-card-flat overflow-x-auto">
                        <table className="tc-table">
                            <thead><tr><th>Model</th><th>Brand</th><th>Type</th><th>Price</th><th>Stock</th><th>City</th><th></th></tr></thead>
                            <tbody>
                                {products.map((p) => (
                                    <tr key={p.id} data-testid={`supplier-product-row-${p.id}`}>
                                        <td><div className="font-semibold font-mono text-[#0E0F12]">{p.model_number}</div><div className="text-xs text-slate-500">{p.title}</div></td>
                                        <td>{p.brand}</td>
                                        <td><span className="tc-badge tc-badge-gray">{p.toner_type || "Original"}</span></td>
                                        <td className="font-mono font-semibold">₹{p.price.toLocaleString('en-IN')}</td>
                                        <td className="font-mono">{p.stock}</td>
                                        <td>{p.city}</td>
                                        <td>
                                            <div className="flex gap-1 justify-end">
                                                <Button size="icon" variant="ghost" onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`}><Pencil size={14} /></Button>
                                                <Button size="icon" variant="ghost" onClick={() => remove(p.id)} data-testid={`delete-product-${p.id}`}><Trash2 size={14} /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {products.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-slate-500">No products listed yet. Click &ldquo;Add product&rdquo; to begin.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Product form */}
            <Dialog open={!!editing} onOpenChange={(o) => !o && closeForm()}>
                <DialogContent className="max-w-2xl" data-testid="product-form-dialog">
                    <DialogHeader><DialogTitle className="text-[#0E0F12]">{editing === "new" ? "Add product to TonersCart catalog" : "Edit product"}</DialogTitle></DialogHeader>

                    {/* Step 1: Pick from TonerMaster */}
                    {editing === "new" && (
                        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                            <div className="tc-eyebrow mb-2">Step 1 — pick toner from master catalog</div>
                            {masterPicked ? (
                                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-md p-3">
                                    <div>
                                        <div className="text-sm font-semibold text-[#0E0F12]"><span className="font-mono">{masterPicked.brand} {masterPicked.model_number}</span> · {masterPicked.toner_type} · {masterPicked.color}</div>
                                        <div className="text-xs text-slate-500">{masterPicked.printer_compatibility}</div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setMasterPicked(null)} data-testid="master-clear-btn">Change</Button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="flex items-center gap-2 px-3 h-10 bg-white border border-slate-200 rounded-md">
                                        <Search size={14} className="text-slate-400" />
                                        <input
                                            value={masterQ}
                                            onChange={(e) => setMasterQ(e.target.value)}
                                            placeholder="Search 174 toner models — HP 88A, TN-2365, MLT-D101S, Canon 925…"
                                            className="flex-1 bg-transparent border-0 outline-none text-sm"
                                            data-testid="master-search-input"
                                        />
                                    </div>
                                    {masterResults.length > 0 && (
                                        <div className="tc-suggest" data-testid="master-suggest-dropdown">
                                            {masterResults.map((m) => (
                                                <div key={m.id} className="tc-suggest-item" onClick={() => pickMaster(m)} data-testid={`master-pick-${m.id}`}>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-[#0E0F12] truncate"><span className="font-mono">{m.brand} {m.model_number}</span> · {m.toner_type} · {m.color}</div>
                                                        <div className="text-xs text-slate-500 truncate">{m.printer_compatibility}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="text-[11px] text-slate-500 mt-2">Selecting from the master catalog ensures buyers find your listing across all model-number variants (HP88A, hp 88a, 88-A, etc.)</div>
                        </div>
                    )}

                    {/* Step 2: pricing & stock */}
                    <div className="grid grid-cols-2 gap-4">
                        {(editing !== "new" || !masterPicked) && (
                            <>
                                <div><Label>Model number</Label><Input value={form.model_number} onChange={handle("model_number")} placeholder="HP 88A" data-testid="product-model-input" disabled={!!masterPicked} /></div>
                                <div><Label>Brand</Label><Input value={form.brand} onChange={handle("brand")} placeholder="HP" data-testid="product-brand-input" disabled={!!masterPicked} /></div>
                            </>
                        )}
                        <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={handle("price")} data-testid="product-price-input" /></div>
                        <div><Label>Stock units</Label><Input type="number" value={form.stock} onChange={handle("stock")} data-testid="product-stock-input" /></div>
                        <div><Label>City</Label><Input value={form.city} onChange={handle("city")} data-testid="product-city-input" /></div>
                        <div><Label>Toner type</Label><Input value={form.toner_type} onChange={handle("toner_type")} disabled={!!masterPicked} data-testid="product-type-input" /></div>
                        <div className="col-span-2"><Label>Title (auto-generated, can edit)</Label><Input value={form.title} onChange={handle("title")} data-testid="product-title-input" /></div>
                        <div className="col-span-2"><Label>Notes / description</Label><Textarea rows={2} value={form.description} onChange={handle("description")} data-testid="product-description-input" /></div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeForm} data-testid="product-cancel-btn">Cancel</Button>
                        <Button className="btn-primary text-white" onClick={save} data-testid="product-save-btn">{editing === "new" ? "Publish listing" : "Save changes"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Tracking dialog */}
            <Dialog open={!!trackingFor} onOpenChange={(o) => !o && setTrackingFor(null)}>
                <DialogContent data-testid="tracking-dialog">
                    <DialogHeader><DialogTitle className="text-[#0E0F12]">Mark as Shipped</DialogTitle></DialogHeader>
                    <Label>Tracking / consignment number</Label>
                    <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. BLR123456789" data-testid="tracking-input" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTrackingFor(null)}>Cancel</Button>
                        <Button className="btn-cta" onClick={() => updateStatus(trackingFor, "shipped", tracking)} disabled={!tracking.trim()} data-testid="tracking-confirm-btn">Confirm shipped</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
