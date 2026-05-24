import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon, Hourglass, CheckCircle2, XCircle, Camera, Loader2, Package, ShoppingCart, Clock, Printer, FileText } from "lucide-react";
import { supabase, PRODUCT_BUCKET } from "../lib/supabase";
import TonerCartridge from "../components/TonerCartridge";
import PrinterListings from "../components/PrinterListings";
import CommissionBanner from "../components/CommissionBanner";
import CommissionCalculator from "../components/CommissionCalculator";
import { commissionFor } from "../lib/commission";

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

function TrackingInput({ onSubmit, testIdSuffix }) {
    const [val, setVal] = React.useState("");
    const submit = () => {
        const v = val.trim();
        if (!v) return;
        onSubmit(v);
        setVal("");
    };
    return (
        <div className="flex items-center gap-1.5">
            <input
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                placeholder="Tracking number"
                className="h-7 px-2 text-[11.5px] rounded border border-[#D2D2D7] bg-white w-32"
                data-testid={`tracking-input-${testIdSuffix}`}
            />
            <button
                onClick={submit}
                disabled={!val.trim()}
                className="text-[11px] px-2 py-1 rounded bg-[#0A0A0B] text-white border border-[#0A0A0B] hover:bg-[#1D1D1F] disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid={`tracking-submit-${testIdSuffix}`}
            >
                Update Tracking
            </button>
        </div>
    );
}


export default function SupplierDashboard() {
    const { user, refresh } = useAuth();
    const isApproved = user?.supplier_status === "approved";
    const [catalog, setCatalog] = useState("toners"); // 'toners' | 'printers'

    const [listings, setListings] = useState([]);
    const [orders, setOrders] = useState([]);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // Brand dropdown + free-text model
    const [brands, setBrands] = useState([]);
    const [brand, setBrand] = useState("");
    const [modelNumber, setModelNumber] = useState("");
    const [color, setColor] = useState("Black");

    // Form
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [tonerType, setTonerType] = useState("Original");
    const [pageYield, setPageYield] = useState("");
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState("");
    const [brochureFile, setBrochureFile] = useState(null);

    // Business logo
    const [logoUrl, setLogoUrl] = useState("");
    const [logoUploading, setLogoUploading] = useState(false);

    const load = async () => {
        if (!isApproved) return;
        try {
            const [l, o, b] = await Promise.all([
                api.get("/supplier/listings"),
                api.get("/orders/mine"),
                api.get("/toner-master/brands"),
            ]);
            setListings(Array.isArray(l.data) ? l.data : []);
            setOrders(Array.isArray(o.data) ? o.data : []);
            setBrands(Array.isArray(b.data) ? b.data : []);
        } catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [isApproved]);

    // Initial logo URL (signed) is returned with /auth/me via user.supplier.business_logo_url
    useEffect(() => {
        if (isApproved && user?.supplier?.business_logo_url) {
            setLogoUrl(user.supplier.business_logo_url);
        }
    }, [isApproved, user?.supplier?.business_logo_url]);

    const onPickLogo = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) { toast.error("Logo must be an image"); return; }
        if (f.size > 3 * 1024 * 1024) { toast.error("Logo must be under 3 MB"); return; }
        setLogoUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", f);
            const { data } = await api.post("/supplier/business-logo", fd);
            setLogoUrl(data.url || URL.createObjectURL(f));
            toast.success("Logo updated");
            refresh();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setLogoUploading(false);
            e.target.value = "";
        }
    };

    const reset = () => {
        setBrand(""); setModelNumber(""); setColor("Black");
        setPrice(""); setStock(""); setTonerType("Original"); setPageYield("");
        setImageFile(null); setImagePreview("");
        setBrochureFile(null);
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
        if (!brand) { toast.error("Please select a brand"); return; }
        if (!modelNumber.trim()) { toast.error("Please enter a model number"); return; }
        if (!price || !stock) { toast.error("Price and stock are required"); return; }
        if (!imageFile) { toast.error("A product image is required"); return; }
        if (brochureFile && brochureFile.size > 10 * 1024 * 1024) {
            toast.error("Brochure must be under 10 MB"); return;
        }
        setSaving(true);
        try {
            // Upload image to Supabase Storage (mandatory)
            const ext = imageFile.name.split(".").pop() || "jpg";
            const path = `${user.id}/${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, imageFile, { upsert: false });
            if (error) throw new Error(error.message);
            const { data: pub } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
            const imageUrl = pub.publicUrl;

            // Optional brochure (PDF) via backend service role
            let brochurePath = null;
            if (brochureFile) {
                const fd = new FormData();
                fd.append("file", brochureFile);
                const { data: up } = await api.post("/supplier/spec-pdf", fd);
                brochurePath = up?.path || null;
            }

            const { data: created } = await api.post("/supplier/listings", {
                brand,
                model_number: modelNumber.trim(),
                color,
                price: parseFloat(price),
                stock: parseInt(stock, 10),
                toner_type: tonerType,
                page_yield: pageYield ? parseInt(pageYield, 10) : null,
                image_url: imageUrl,
                spec_pdf_url: brochurePath,
            });
            // Already attached at creation; nothing else to do.
            void created;
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
        <div data-testid="supplier-dashboard" style={{ fontFamily: "'Inter', sans-serif" }}>
            <div className="tc-hero relative pb-12">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-8 sm:pt-10">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div className="flex items-start gap-4 sm:gap-5">
                            {/* Business logo uploader */}
                            <label className="relative shrink-0 cursor-pointer group" data-testid="business-logo-uploader">
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={onPickLogo}
                                    data-testid="business-logo-input"
                                />
                                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-dashed border-white/25 bg-white/[0.06] backdrop-blur grid place-items-center group-hover:border-[#F5C400]/70 transition">
                                    {logoUploading ? (
                                        <Loader2 size={22} className="text-white/70 animate-spin" />
                                    ) : logoUrl ? (
                                        <img src={logoUrl} alt="Business logo" className="w-full h-full object-cover" data-testid="business-logo-img" />
                                    ) : (
                                        <Camera size={22} className="text-white/55" strokeWidth={1.6} />
                                    )}
                                </div>
                                <span className="block text-center mt-1.5 text-[9px] tracking-[0.18em] uppercase font-semibold text-white/45 group-hover:text-[#F5C400] transition">
                                    {logoUrl ? "Change logo" : "Upload logo"}
                                </span>
                            </label>

                            <div className="min-w-0">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="tc-strip" />
                                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-emerald-300/90 inline-flex items-center gap-1.5"><CheckCircle2 size={12} /> Approved supplier</span>
                                </div>
                                <h1 className="text-white truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 3.4vw, 44px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                                    {user?.supplier?.business_name || user?.company || "Supplier dashboard"}
                                </h1>
                                <p className="text-[14px] text-white/65 mt-2">{user?.supplier?.city || user?.city}</p>
                            </div>
                        </div>
                    </div>

                    {/* Stats inside hero — bordered, icon, 36px Montserrat */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
                        {[
                            { k: "Listings", v: stats.listings, Icon: Package },
                            { k: "Active",   v: stats.active,   Icon: CheckCircle2 },
                            { k: "Orders",   v: stats.orders,   Icon: ShoppingCart },
                            { k: "Pending",  v: stats.pending,  Icon: Clock },
                        ].map(({ k, v, Icon }) => (
                            <div key={k} className="tc-stat-card" data-testid={`supplier-stat-${k.toLowerCase()}`}>
                                <div className="tc-stat-icon"><Icon size={16} /></div>
                                <div className="tc-stat-value">{v}</div>
                                <div className="tc-stat-label">{k}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="tc-container py-8 sm:py-10">
                {/* Catalog tabs with contextual Add button on the right */}
                <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                    <div className="inline-flex items-center rounded-full bg-black/[0.05] p-1" data-testid="catalog-tabs" style={{ fontFamily: "'Inter', sans-serif" }}>
                        <button onClick={() => setCatalog("toners")} className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition ${catalog === "toners" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-[#6E6E73] hover:text-[#0A0A0B]"}`} data-testid="tab-toners">Toners</button>
                        <button onClick={() => setCatalog("printers")} className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition ${catalog === "printers" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-[#6E6E73] hover:text-[#0A0A0B]"}`} data-testid="tab-printers">Printers</button>
                    </div>
                    {catalog === "toners" ? (
                        <Button className="btn-cta inline-flex items-center gap-2" onClick={openDialog} data-testid="add-listing-btn">
                            <Plus size={16} /> Add toner
                        </Button>
                    ) : (
                        <Button className="btn-cta inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-add-printer"))} data-testid="add-printer-cta-btn">
                            <Plus size={16} /> Add printer
                        </Button>
                    )}
                </div>

                {catalog === "printers" ? (
                    <>
                        <h2 id="printers" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your printers</h2>
                        <PrinterListings />
                    </>
                ) : (
                <>
                {/* Listings */}
                <h2 id="listings" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your toners</h2>
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
                    <h2 id="orders" className="text-[#0A0A0B] mt-12 mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Recent orders</h2>
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
                                        <td className="p-3 font-mono">
                                            ₹{Number(o.total).toLocaleString("en-IN")}
                                            {(() => {
                                                const c = commissionFor(o.total);
                                                if (!c || c.commission === null) {
                                                    return <div className="text-[10.5px] text-[#86868B] mt-0.5">Deal basis · contact team</div>;
                                                }
                                                return (
                                                    <div className="mt-0.5 leading-tight" data-testid={`order-payout-${o.id}`}>
                                                        <div className="text-[10.5px] text-[#86868B]">Commission ({c.rateLabel}): −₹{c.commission.toLocaleString("en-IN")}</div>
                                                        <div className="text-[11px] text-emerald-700 font-semibold">Payout: ₹{c.payout.toLocaleString("en-IN")}</div>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="p-3 text-[11px] uppercase font-semibold tracking-[0.1em] text-[#0A0A0B]">{ORDER_STATUS[o.status]}</td>
                                        <td className="p-3">
                                            {o.status === "requested" && (
                                                <div className="flex gap-1">
                                                    <button onClick={() => updateOrder(o.id, "accepted")} className="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" data-testid={`accept-order-${o.id}`}>Accept</button>
                                                    <button onClick={() => updateOrder(o.id, "rejected")} className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200" data-testid={`reject-order-${o.id}`}>Reject</button>
                                                </div>
                                            )}
                                            {o.status === "accepted" && (
                                                <TrackingInput onSubmit={(t) => updateOrder(o.id, "shipped", t)} testIdSuffix={o.id} />
                                            )}
                                            {o.status === "shipped" && (
                                                <div className="text-[10.5px] text-[#6E6E73]">Awaiting buyer confirmation…<div className="font-mono text-[#0A0A0B]">Tracking: {o.tracking_number || "—"}</div></div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
                </>
                )}

            {/* Commission Calculator — placed AFTER stock & orders so dealers
                review their inventory first, then run payout estimates. */}
            <div className="mt-8" data-testid="commission-calculator-wrap">
                <CommissionCalculator />
            </div>

            {/* Add listing dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[680px] max-h-[92vh] overflow-y-auto p-8 rounded-[20px] tc-shadow-lg" data-testid="add-listing-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-[22px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.01em" }}>
                            Add a toner
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="mt-2">
                        <div className="tc-form-section">Basic info</div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <Label>Brand<span className="text-red-500"> *</span></Label>
                                <select value={brand} onChange={(e) => setBrand(e.target.value)} required
                                    className="tc-input-lg w-full"
                                    data-testid="listing-brand-select">
                                    <option value="">Select brand…</option>
                                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                                    <option value="HP">HP</option>
                                    <option value="Canon">Canon</option>
                                    <option value="Brother">Brother</option>
                                    <option value="Samsung">Samsung</option>
                                    <option value="Ricoh">Ricoh</option>
                                    <option value="Epson">Epson</option>
                                    <option value="Xerox">Xerox</option>
                                    <option value="Kyocera">Kyocera</option>
                                </select>
                            </div>
                            <div>
                                <Label>Model number<span className="text-red-500"> *</span></Label>
                                <Input
                                    value={modelNumber}
                                    onChange={(e) => setModelNumber(e.target.value)}
                                    placeholder="e.g. 88A, TN-2365, 925"
                                    required
                                    className="tc-input-lg"
                                    data-testid="listing-model-input"
                                />
                            </div>
                        </div>

                        {/* Circular color swatches */}
                        <div className="mt-4">
                            <Label>Color</Label>
                            <div className="flex items-center gap-3 mt-2" data-testid="listing-color-row">
                                {[
                                    { name: "Black",   hex: "#1A1A1A" },
                                    { name: "Cyan",    hex: "#00B7C7" },
                                    { name: "Magenta", hex: "#E6007E" },
                                    { name: "Yellow",  hex: "#F5C400" },
                                ].map((c) => (
                                    <button
                                        type="button"
                                        key={c.name}
                                        onClick={() => setColor(c.name)}
                                        aria-label={c.name}
                                        title={c.name}
                                        className={`tc-swatch ${color === c.name ? "is-selected" : ""}`}
                                        style={{ "--swatch": c.hex }}
                                        data-testid={`listing-color-${c.name}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Toner type — pill cards */}
                        <div className="mt-4">
                            <Label>Toner type<span className="text-red-500"> *</span></Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {["Original", "Compatible", "Refilled"].map((t) => (
                                    <button
                                        type="button"
                                        key={t}
                                        onClick={() => setTonerType(t)}
                                        className={`tc-pill ${tonerType === t ? "is-selected" : ""}`}
                                        data-testid={`listing-type-${t}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="tc-form-section">Pricing &amp; stock</div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Price (₹)<span className="text-red-500"> *</span></Label>
                                <Input
                                    type="number" min="0" step="1"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    required
                                    className="tc-input-lg"
                                    data-testid="listing-price-input"
                                />
                            </div>
                            <div>
                                <Label>Stock<span className="text-red-500"> *</span></Label>
                                <Input
                                    type="number" min="0" step="1"
                                    value={stock}
                                    onChange={(e) => setStock(e.target.value)}
                                    required
                                    className="tc-input-lg"
                                    data-testid="listing-stock-input"
                                />
                            </div>
                        </div>
                        <CommissionBanner />

                        <div className="mt-3">
                            <Label>Page yield (sheets)</Label>
                            <div className="tc-suffix-wrap">
                                <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={pageYield}
                                    onChange={(e) => setPageYield(e.target.value)}
                                    placeholder="e.g. 2000"
                                    className="tc-input-lg"
                                    data-testid="listing-page-yield"
                                />
                                <span className="tc-suffix">sheets</span>
                            </div>
                            <div className="text-[11.5px] text-[#86868B] mt-1">e.g. 2000 for HP 88A. Helps buyers compare cost per page.</div>
                        </div>

                        <div className="tc-form-section">Product image</div>
                        <label className="block cursor-pointer">
                            <input type="file" accept="image/*" onChange={onPickFile} className="hidden" data-testid="listing-image-input" />
                            <div className={`tc-image-drop ${imagePreview ? "has-image" : ""}`}>
                                {imagePreview ? (
                                    <img src={imagePreview} alt="preview" className="max-h-32 rounded-md" />
                                ) : (
                                    <>
                                        <Camera size={22} />
                                        <span>Click to upload toner image</span>
                                        <span className="text-[11px] text-[#86868B] font-normal">PNG / JPG, max 5 MB</span>
                                    </>
                                )}
                            </div>
                        </label>

                        <div className="tc-form-section">Product brochure (optional)</div>
                        <label className="block cursor-pointer">
                            <input
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    if (f.type !== "application/pdf") { toast.error("Brochure must be a PDF"); return; }
                                    if (f.size > 10 * 1024 * 1024) { toast.error("Brochure must be under 10 MB"); return; }
                                    setBrochureFile(f);
                                }}
                                className="hidden"
                                data-testid="listing-brochure-input"
                            />
                            <div className={`tc-image-drop ${brochureFile ? "has-image" : ""}`} style={{ borderStyle: "dashed" }}>
                                <FileText size={22} />
                                <span>{brochureFile ? brochureFile.name : "Upload product brochure (PDF, optional)"}</span>
                                <span className="text-[11px] text-[#86868B] font-normal">Technical specs / Product brochure · PDF · max 10 MB</span>
                            </div>
                        </label>

                        <DialogFooter className="mt-6">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                            <Button type="submit" className="btn-pill-cta" disabled={saving} data-testid="listing-save-btn">
                                {saving ? "Publishing…" : "Publish listing"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            </div>
        </div>
    );
}
