import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon, Search, Hourglass, CheckCircle2, XCircle } from "lucide-react";
import { supabase, PRODUCT_BUCKET } from "../lib/supabase";
import TonerCartridge from "../components/TonerCartridge";

const ORDER_STATUS = {
    requested: "Requested",
    accepted: "Accepted",
    shipped: "Shipped",
    delivered: "Delivered",
    rejected: "Rejected",
    cancelled: "Cancelled",
};

function PendingScreen({ application }) {
    const status = application?.status || "pending";
    const isRejected = status === "rejected";
    return (
        <div className="tc-container py-12 max-w-2xl" data-testid="supplier-pending">
            <div className="tc-card-flat p-8 sm:p-10 text-center">
                <div className={`mx-auto w-14 h-14 rounded-full grid place-items-center ${isRejected ? "bg-red-50" : "bg-amber-50"}`}>
                    {isRejected ? <XCircle className="text-red-600" size={28} /> : <Hourglass className="text-amber-600" size={26} />}
                </div>
                <h1 className="mt-5 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(22px, 2.6vw, 32px)", fontWeight: 300, letterSpacing: "-0.015em" }}>
                    {isRejected ? "Application not approved" : "Application under review"}
                </h1>
                <p className="text-[14px] text-[#6E6E73] mt-3 max-w-md mx-auto">
                    {isRejected
                        ? application?.rejection_reason || "Your supplier application was not approved this time. Please contact support@digitaledgeinida.com if you'd like to discuss."
                        : "Thanks for applying! Our admin team is reviewing your business details. You'll be able to add product listings as soon as you're approved."}
                </p>
                {application?.business_name && (
                    <div className="mt-6 inline-flex items-center gap-2 text-[12px] text-[#6E6E73] border border-black/[0.08] rounded-full px-3 py-1.5">
                        Application: <span className="font-mono font-semibold text-[#0A0A0B]">{application.business_name}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SupplierDashboard() {
    const { user, refresh } = useAuth();
    const isApproved = user?.supplier_status === "approved";

    const [listings, setListings] = useState([]);
    const [orders, setOrders] = useState([]);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // Toner picker
    const [masterQ, setMasterQ] = useState("");
    const [masterResults, setMasterResults] = useState([]);
    const [tonerPicked, setTonerPicked] = useState(null);

    // Form
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [tonerType, setTonerType] = useState("Original");
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState("");

    const load = async () => {
        if (!isApproved) return;
        try {
            const [l, o] = await Promise.all([
                api.get("/supplier/listings"),
                api.get("/orders/mine"),
            ]);
            setListings(l.data); setOrders(o.data);
        } catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [isApproved]);

    useEffect(() => {
        const t = setTimeout(async () => {
            if (!masterQ || masterQ.length < 2) { setMasterResults([]); return; }
            const r = await api.get("/toner-master", { params: { q: masterQ, limit: 8 } });
            setMasterResults(r.data);
        }, 200);
        return () => clearTimeout(t);
    }, [masterQ]);

    const reset = () => {
        setMasterQ(""); setMasterResults([]); setTonerPicked(null);
        setPrice(""); setStock(""); setTonerType("Original");
        setImageFile(null); setImagePreview("");
    };
    const openDialog = () => { reset(); setOpen(true); };

    const onPickFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
        setImageFile(f);
        setImagePreview(URL.createObjectURL(f));
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!tonerPicked) { toast.error("Please select a toner from the catalog"); return; }
        if (!price || !stock) { toast.error("Price and stock are required"); return; }
        setSaving(true);
        try {
            // Upload image to Supabase Storage if provided
            let imageUrl = "";
            if (imageFile) {
                const ext = imageFile.name.split(".").pop() || "jpg";
                const path = `${user.id}/${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, imageFile, { upsert: false });
                if (error) throw new Error(error.message);
                const { data: pub } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
                imageUrl = pub.publicUrl;
            }
            await api.post("/supplier/listings", {
                toner_id: tonerPicked.id,
                price: parseFloat(price),
                stock: parseInt(stock, 10),
                toner_type: tonerType,
                image_url: imageUrl,
            });
            toast.success("Listing added");
            setOpen(false);
            reset();
            load();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSaving(false);
        }
    };

    const removeListing = async (id) => {
        if (!window.confirm("Remove this listing?")) return;
        try { await api.delete(`/supplier/listings/${id}`); toast.success("Removed"); load(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    const updateOrder = async (id, status, tracking_number) => {
        try {
            await api.put(`/orders/${id}/status`, { status, tracking_number });
            toast.success(`Order ${status}`);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const stats = useMemo(() => ({
        listings: listings.length,
        active: listings.filter((l) => l.stock > 0).length,
        orders: orders.length,
        pending: orders.filter((o) => o.status === "requested").length,
    }), [listings, orders]);

    if (!isApproved) {
        return <PendingScreen application={user?.application} />;
    }

    return (
        <div className="tc-container py-8 sm:py-10" data-testid="supplier-dashboard">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
                <div>
                    <div className="tc-eyebrow inline-flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-600" /> Approved supplier</div>
                    <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                        {user?.supplier?.business_name || user?.company || "Supplier dashboard"}
                    </h1>
                    <p className="text-[14px] text-[#6E6E73] mt-1">{user?.supplier?.city || user?.city}</p>
                </div>
                <Button className="btn-cta inline-flex items-center gap-2" onClick={openDialog} data-testid="add-listing-btn">
                    <Plus size={16} /> Add product
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                {[
                    { k: "Listings", v: stats.listings },
                    { k: "Active", v: stats.active },
                    { k: "Orders", v: stats.orders },
                    { k: "Pending", v: stats.pending },
                ].map((s) => (
                    <div key={s.k} className="tc-card-flat p-4">
                        <div className="font-mono text-2xl font-semibold text-[#0A0A0B]">{s.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            {/* Listings */}
            <h2 className="text-[#0A0A0B] mb-4" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your products</h2>
            {listings.length === 0 ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">
                    No listings yet. Tap <span className="font-semibold text-[#0A0A0B]">Add product</span> to publish your first toner.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {listings.map((l) => {
                        const typeStyle = l.toner_type === "Original"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : l.toner_type === "Compatible"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-amber-50 text-amber-700 border-amber-200";
                        return (
                            <div key={l.id} className="tc-product-card" data-testid={`supplier-listing-${l.id}`}>
                                <div className="tc-product-img">
                                    <span className="tc-product-img-label">{l.brand}</span>
                                    {l.image_url ? (
                                        <img src={l.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <TonerCartridge color={l.color || "Black"} brand={l.brand} model={l.model_number} type={l.toner_type} />
                                    )}
                                </div>
                                <div className="p-4 flex flex-col gap-2 flex-1">
                                    <div className="flex items-center justify-between">
                                        <div className="font-mono text-[16px] font-semibold text-[#0A0A0B]">{l.model_number}</div>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border uppercase tracking-[0.08em] ${typeStyle}`}>{l.toner_type}</span>
                                    </div>
                                    <div className="text-[12px] text-[#6E6E73]">{l.brand} · {l.color}</div>
                                    <div className="mt-1 flex items-center justify-between">
                                        <div className="font-mono text-[18px] font-semibold text-[#0A0A0B]">₹{Number(l.price).toLocaleString("en-IN")}</div>
                                        <div className="text-[12px] text-[#6E6E73]">Stock: <span className="font-mono font-semibold text-[#0A0A0B]">{l.stock}</span></div>
                                    </div>
                                    <button onClick={() => removeListing(l.id)} className="mt-2 text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1 self-start" data-testid={`remove-${l.id}`}>
                                        <Trash2 size={12} /> Remove
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Orders */}
            {orders.length > 0 && (
                <>
                    <h2 className="text-[#0A0A0B] mt-12 mb-4" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Recent orders</h2>
                    <div className="tc-card-flat p-0 overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                <tr><th className="text-left p-3">Toner</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Qty</th><th className="text-left p-3">Total</th><th className="text-left p-3">Status</th><th className="text-left p-3">Action</th></tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr key={o.id} className="border-t border-black/[0.05]">
                                        <td className="p-3 font-mono">{o.listings?.model_number || "—"}</td>
                                        <td className="p-3">{o.customer_name}<div className="text-[11px] text-[#86868B]">{o.customer_phone}</div></td>
                                        <td className="p-3 font-mono">{o.qty}</td>
                                        <td className="p-3 font-mono">₹{Number(o.total).toLocaleString("en-IN")}</td>
                                        <td className="p-3 text-[11px] uppercase font-semibold tracking-[0.1em] text-[#0A0A0B]">{ORDER_STATUS[o.status]}</td>
                                        <td className="p-3">
                                            {o.status === "requested" && (
                                                <div className="flex gap-1">
                                                    <button onClick={() => updateOrder(o.id, "accepted")} className="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Accept</button>
                                                    <button onClick={() => updateOrder(o.id, "rejected")} className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">Reject</button>
                                                </div>
                                            )}
                                            {o.status === "accepted" && (
                                                <button onClick={() => {
                                                    const t = window.prompt("Tracking number:");
                                                    if (t) updateOrder(o.id, "shipped", t);
                                                }} className="text-[11px] px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">Mark shipped</button>
                                            )}
                                            {o.status === "shipped" && (
                                                <button onClick={() => updateOrder(o.id, "delivered")} className="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Mark delivered</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Add listing dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg" data-testid="add-listing-dialog">
                    <DialogHeader>
                        <DialogTitle>Add product</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        {/* Toner picker */}
                        <div>
                            <Label>Toner model<span className="text-red-500"> *</span></Label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                                <Input
                                    value={tonerPicked ? `${tonerPicked.brand} ${tonerPicked.model_number}` : masterQ}
                                    onChange={(e) => { setTonerPicked(null); setMasterQ(e.target.value); }}
                                    placeholder="Search HP 88A, Canon 925…"
                                    className="pl-8"
                                    data-testid="listing-toner-search"
                                />
                                {!tonerPicked && masterResults.length > 0 && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border border-black/[0.08] rounded-lg shadow-xl max-h-56 overflow-auto">
                                        {masterResults.map((m) => (
                                            <button type="button" key={m.id}
                                                onClick={() => { setTonerPicked(m); setMasterResults([]); }}
                                                className="block w-full text-left px-3 py-2 hover:bg-black/[0.04] text-[13px]"
                                                data-testid={`toner-option-${m.brand}-${m.model_number}`}>
                                                <span className="font-mono font-semibold">{m.brand} {m.model_number}</span>
                                                <span className="text-[11px] text-[#6E6E73] ml-2">{m.color}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {tonerPicked && (
                                <div className="text-[11px] text-[#6E6E73] mt-1">
                                    {tonerPicked.printer_compatibility || "—"}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Price (₹)<span className="text-red-500"> *</span></Label>
                                <Input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} required data-testid="listing-price-input" />
                            </div>
                            <div>
                                <Label>Stock<span className="text-red-500"> *</span></Label>
                                <Input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} required data-testid="listing-stock-input" />
                            </div>
                        </div>

                        <div>
                            <Label>Toner type<span className="text-red-500"> *</span></Label>
                            <div className="grid grid-cols-3 gap-2 mt-1">
                                {["Original", "Compatible", "Refilled"].map((t) => (
                                    <button type="button" key={t} onClick={() => setTonerType(t)}
                                        className={`px-3 py-2.5 rounded-lg border text-[13px] font-semibold transition ${tonerType === t ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#86868B]"}`}
                                        data-testid={`listing-type-${t}`}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label>Product image (optional)</Label>
                            <label className="block mt-1 cursor-pointer">
                                <input type="file" accept="image/*" onChange={onPickFile} className="hidden" data-testid="listing-image-input" />
                                <div className="border-2 border-dashed border-[#D2D2D7] rounded-lg px-4 py-6 text-center hover:border-[#86868B] transition">
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="preview" className="max-h-32 mx-auto rounded" />
                                    ) : (
                                        <div className="text-[#6E6E73] text-[13px] flex items-center justify-center gap-2">
                                            <ImageIcon size={16} /> Click to upload (max 5 MB)
                                        </div>
                                    )}
                                </div>
                            </label>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                            <Button type="submit" className="btn-cta" disabled={saving} data-testid="listing-save-btn">
                                {saving ? "Publishing…" : "Publish listing"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
