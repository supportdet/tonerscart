import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon, Hourglass, CheckCircle2, XCircle, Camera, Loader2, Package, ShoppingCart, Clock, Printer, FileText, Pencil, X as XIcon } from "lucide-react";
import { GST_RATES, gstAmount, formatINR } from "../lib/listingConstants";
import { supabase, PRODUCT_BUCKET } from "../lib/supabase";
import RefilledWarningDialog from "../components/RefilledWarningDialog";
import TonerCartridge from "../components/TonerCartridge";
import PrinterListings from "../components/PrinterListings";
import PaperListings from "../components/PaperListings";
import ConsumableListings from "../components/ConsumableListings";
import SupplierEarnings from "../components/SupplierEarnings";
import SupplierInsights from "../components/SupplierInsights";
import CommissionBanner from "../components/CommissionBanner";
import CommissionCalculator from "../components/CommissionCalculator";
import { commissionFor } from "../lib/commission";
import { Copy, Check, ChevronLeft, Upload, ArrowRight, Store, Building2, Layers } from "lucide-react";
import { colorSwatch as _colorSwatch } from "../lib/colors";
import BulkUploadGeneric from "../components/BulkUploadGeneric";
import { tonerBulkConfig } from "../lib/bulkConfigs";
import D2DRow, { D2DExplainer } from "../components/D2DRow";
import SupplierAgreementDialog, { hasAcceptedSupplierAgreement } from "../components/SupplierAgreementDialog";

const colorSwatchHex = (name) => {
    const v = _colorSwatch(name);
    return v.startsWith("linear") ? "#C8C8CD" : v;
};

const DEALER_TABS = [
    { key: "toners", label: "Toners", bg: "#ECFBFD", bgHover: "#D6F5F9", bgActive: "#C2EFF5", accent: "#0891B2" },
    { key: "printers", label: "Printers", bg: "#FDEDF7", bgHover: "#FAD9EE", bgActive: "#F6C6E4", accent: "#DB2777" },
    { key: "papers", label: "Papers", bg: "#FEF6E7", bgHover: "#FCEBC6", bgActive: "#FAE0A6", accent: "#D97706" },
    { key: "consumables", label: "Consumables", bg: "#EDFBEF", bgHover: "#D7F5DC", bgActive: "#C2EFCA", accent: "#16A34A" },
    { key: "orders", label: "Orders", bg: "#EEF0FE", bgHover: "#DDE1FC", bgActive: "#CBD2FA", accent: "#4F46E5" },
    { key: "earnings", label: "My Earnings", bg: "#FEF1E8", bgHover: "#FCDFCB", bgActive: "#FACDAE", accent: "#EA580C" },
    { key: "insights", label: "Insights", bg: "#EEF1F5", bgHover: "#DDE3EC", bgActive: "#CBD5E1", accent: "#475569" },
    { key: "bulk", label: "Bulk Orders", bg: "#EAFAF6", bgHover: "#CFF3EB", bgActive: "#B4ECDF", accent: "#0D9488" },
    { key: "d2d", label: "Dealer to Dealer", bg: "#FDEEF0", bgHover: "#FBD9DE", bgActive: "#F8C3CB", accent: "#E11D48" },
    { key: "oem", label: "OEM Marketplace", bg: "#F4EEFD", bgHover: "#E7DBFB", bgActive: "#D9C7F8", accent: "#7C3AED" },
];

// Full-width dealer control bar that replaces the customer category pills.
function DealerTabBar({ active, onSelect }) {
    return (
        <div className="w-full bg-white border-b border-black/10" data-testid="catalog-tabs">
            <div className="flex w-full overflow-x-auto tc-cat-scroll">
                {DEALER_TABS.map((t) => {
                    const isActive = active === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => onSelect(t.key)}
                            data-testid={`tab-${t.key}`}
                            aria-current={isActive ? "page" : undefined}
                            className="flex-1 min-w-[118px] px-3 py-3.5 text-[12.5px] font-bold text-center whitespace-nowrap border-r border-black/[0.07] last:border-r-0 outline-none"
                            style={{
                                color: "#1F2937",
                                backgroundColor: isActive ? t.bgActive : t.bg,
                                boxShadow: isActive ? `inset 0 -3px 0 ${t.accent}` : "inset 0 -3px 0 transparent",
                                transition: "background-color 150ms ease, box-shadow 150ms ease",
                            }}
                            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = t.bgHover; }}
                            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = t.bg; }}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// Large center action panel shown at the top of each product tab.
function CenterAction({ title, subtitle, children }) {
    return (
        <div className="mb-6 rounded-2xl border border-dashed border-black/[0.14] bg-[#FAFAFB] px-5 py-6 flex flex-col items-center text-center gap-3" data-testid="tab-action-panel">
            <div>
                <div className="text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{title}</div>
                {subtitle && <div className="text-[12.5px] text-[#6E6E73] mt-1 max-w-md">{subtitle}</div>}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>
        </div>
    );
}

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
                        ? application?.rejection_reason || "Your supplier application was not approved this time. Please contact support@tonerscart.com if you'd like to discuss."
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

function InlineStock({ stock, onSave, testId }) {
    const [editing, setEditing] = React.useState(false);
    const [val, setVal] = React.useState(stock);
    React.useEffect(() => { setVal(stock); }, [stock]);
    const commit = () => {
        const n = Number(val);
        if (Number.isNaN(n) || n < 0) { setVal(stock); setEditing(false); return; }
        if (n !== Number(stock)) onSave(n);
        setEditing(false);
    };
    if (!editing) {
        return (
            <button onClick={() => setEditing(true)} className="text-[12px] text-[#6E6E73] hover:text-[#00B7C7] transition" data-testid={testId}>
                Stock: <span className="font-mono font-semibold text-[#0A0A0B]">{stock}</span> <span className="text-[#86868B] text-[10px]">· edit</span>
            </button>
        );
    }
    return (
        <div className="inline-flex items-center gap-1.5">
            <input
                type="number" min="0" value={val} autoFocus
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setVal(stock); setEditing(false); } }}
                className="h-7 w-16 px-2 text-[12px] rounded border border-[#00B7C7] bg-white font-mono"
                data-testid={`${testId}-input`}
            />
            <button onClick={commit} className="h-7 w-7 grid place-items-center rounded bg-emerald-600 text-white" data-testid={`${testId}-save`}>
                <Check size={12} />
            </button>
        </div>
    );
}

function _TrackingInputLegacy() { return null; }




export default function SupplierDashboard() {
    const { user, refresh } = useAuth();
    const navigate = useNavigate();
    const isApproved = user?.supplier_status === "approved";
    const [catalog, setCatalog] = useState("toners"); // 'toners' | 'printers' | 'papers' | 'consumables' | 'orders' | 'earnings' | 'insights' | 'bulk' | 'd2d' | 'oem'
    const [listingFilter, setListingFilter] = useState("all"); // 'all' | 'active' — toner listings
    const [orderFilter, setOrderFilter] = useState("all"); // 'all' | 'pending' — orders
    const [bulkOpen, setBulkOpen] = useState(false);
    const [editBulkOpen, setEditBulkOpen] = useState(false);
    // Edit business / company name
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [savingName, setSavingName] = useState(false);
    // Wave 14 — one-time supplier agreement gate
    const [agreementOpen, setAgreementOpen] = useState(false);
    const [pendingAddAction, setPendingAddAction] = useState(null); // 'single' | 'bulk' | null

    // Sync catalog tab from URL hash so the header "My stock" vs "Orders" pills route correctly.
    React.useEffect(() => {
        const sync = () => {
            const h = (window.location.hash || "").replace("#", "").toLowerCase();
            if (h === "orders") setCatalog("orders");
            else if (h === "listings" || h === "toners") setCatalog("toners");
            else if (h === "printers") setCatalog("printers");
            else if (h === "papers") setCatalog("papers");
            else if (h === "earnings") setCatalog("earnings");
        };
        sync();
        window.addEventListener("hashchange", sync);
        return () => window.removeEventListener("hashchange", sync);
    }, []);

    const [listings, setListings] = useState([]);
    const [orders, setOrders] = useState([]);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [existingImages, setExistingImages] = useState([]); // urls already saved on this listing

    // Brand dropdown
    const [brands, setBrands] = useState([]);
    const [brand, setBrand] = useState("");
    const [color, setColor] = useState("Black");

    // Form
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [tonerType, setTonerType] = useState("Original");
    const [pageYield, setPageYield] = useState("");
    const [imageFiles, setImageFiles] = useState([]); // Array<File>, 1..3
    const [imagePreviews, setImagePreviews] = useState([]);
    const [brochureFile, setBrochureFile] = useState(null); void brochureFile; void setBrochureFile;
    const [refilledWarning, setRefilledWarning] = useState(false);
    // Structured specs (Wave 4)
    const [compatibleModels, setCompatibleModels] = useState("");
    const [oemPartNumber, setOemPartNumber] = useState("");
    const [cartridgeWeight, setCartridgeWeight] = useState("");
    const [warranty, setWarranty] = useState("");
    const [warrantyOther, setWarrantyOther] = useState("");
    const [printTechnology, setPrintTechnology] = useState("Laser");
    const [intercityCharge, setIntercityCharge] = useState("0");
    const [gstRate, setGstRate] = useState(18);
    // Variants
    const [variants, setVariants] = useState([{ color: "Black", price: "", stock: "" }]);

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
        setBrand(""); setColor("Black");
        setPrice(""); setStock(""); setTonerType("Original"); setPageYield("");
        setImageFiles([]); setImagePreviews([]);
        setBrochureFile(null);
        setCompatibleModels(""); setOemPartNumber(""); setCartridgeWeight(""); setWarranty(""); setWarrantyOther(""); setPrintTechnology("Laser"); setIntercityCharge("0"); setGstRate(18);
        setVariants([{ color: "Black", price: "", stock: "" }]);
        setEditingId(null);
        setExistingImages([]);
    };
    const openDialog = () => { reset(); setOpen(true); };

    // Wave 14 — Gate the first listing attempt (single OR bulk) behind a
    // one-time supplier agreement modal. Stored in localStorage.
    const requestAddAction = (kind /* 'single' | 'bulk' */) => {
        if (hasAcceptedSupplierAgreement()) {
            if (kind === "bulk") setBulkOpen(true);
            else openDialog();
            return;
        }
        setPendingAddAction(kind);
        setAgreementOpen(true);
    };
    const onAgreementAccepted = () => {
        const kind = pendingAddAction;
        setAgreementOpen(false);
        setPendingAddAction(null);
        if (kind === "bulk") setBulkOpen(true);
        else if (kind === "single") openDialog();
    };

    const openEditBulk = () => setEditBulkOpen(true);

    // Manual tab click clears any stat-driven filter.
    const selectTab = (key) => { setCatalog(key); setListingFilter("all"); setOrderFilter("all"); };
    // Clickable stat cards → jump to the relevant section (optionally filtered).
    const goStat = (key) => {
        if (key === "listings") { setCatalog("toners"); setListingFilter("all"); }
        else if (key === "active") { setCatalog("toners"); setListingFilter("active"); }
        else if (key === "orders") { setCatalog("orders"); setOrderFilter("all"); }
        else if (key === "pending") { setCatalog("orders"); setOrderFilter("pending"); }
    };

    const saveName = async () => {
        const v = nameInput.trim();
        if (!v) { toast.error("Enter a business name"); return; }
        setSavingName(true);
        try {
            await api.put("/supplier/profile", { business_name: v });
            toast.success("Business name updated");
            setNameDialogOpen(false);
            refresh();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSavingName(false);
        }
    };

    const onPickFileAt = (idx, e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast.error(`"${f.name}" exceeds 5 MB`); e.target.value = ""; return; }
        if (!f.type.startsWith("image/")) { toast.error(`"${f.name}" is not an image`); e.target.value = ""; return; }
        const nextFiles = [...imageFiles];
        const nextPrev = [...imagePreviews];
        nextFiles[idx] = f;
        nextPrev[idx] = URL.createObjectURL(f);
        setImageFiles(nextFiles);
        setImagePreviews(nextPrev);
        e.target.value = "";
    };
    const removeImageAt = (idx) => {
        const nextFiles = imageFiles.slice();
        const nextPrev = imagePreviews.slice();
        nextFiles[idx] = undefined;
        nextPrev[idx] = undefined;
        setImageFiles(nextFiles);
        setImagePreviews(nextPrev);
    };
    const removeExistingImage = (idx) => {
        setExistingImages(existingImages.filter((_, i) => i !== idx));
    };

    const onPickFile = (e) => {
        const files = Array.from(e.target.files || []);
        const merged = imageFiles.filter(Boolean);
        for (const f of files) {
            if (merged.length >= 3) break;
            if (f.size > 5 * 1024 * 1024) { toast.error(`"${f.name}" exceeds 5 MB`); continue; }
            if (!f.type.startsWith("image/")) { toast.error(`"${f.name}" is not an image`); continue; }
            merged.push(f);
        }
        setImageFiles(merged);
        setImagePreviews(merged.map((f) => URL.createObjectURL(f)));
        e.target.value = "";
    };
    const removeImage = (idx) => {
        const next = imageFiles.filter((_, i) => i !== idx);
        setImageFiles(next);
        setImagePreviews(next.map((f) => URL.createObjectURL(f)));
    };
    void removeImage; void onPickFile;

    const addVariant = () => {
        if (variants.length >= 15) { toast.error("Up to 15 colour variants are allowed"); return; }
        setVariants([...variants, { color: "", price: "", stock: "" }]);
    };
    const updateVariant = (i, key, val) => {
        const next = variants.slice();
        next[i] = { ...next[i], [key]: val };
        setVariants(next);
    };
    const removeVariant = (i) => {
        if (variants.length <= 1) { toast.error("At least one colour variant is required"); return; }
        setVariants(variants.filter((_, x) => x !== i));
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!brand) { toast.error("Please select a brand"); return; }
        if (!compatibleModels.trim()) { toast.error("Please enter the compatible printer models"); return; }
        // Wave 10 — images are optional. Animated cartridge fallback is shown
        // automatically when no image is provided.
        const cleanedVariants = variants
            .map((v) => ({ color: (v.color || "").trim(), price: parseFloat(v.price), stock: parseInt(v.stock, 10) }))
            .filter((v) => v.color && v.price > 0 && v.stock >= 0);
        if (cleanedVariants.length === 0) {
            toast.error("Add at least one colour variant with a colour name, price and stock");
            return;
        }
        setSaving(true);
        try {
            // Wave 12 — image upload removed. Animated cartridge fallback renders
            // on every card. Existing image URLs (if editing an older listing)
            // are preserved.
            const finalImageUrls = existingImages || [];

            // Top-level price/stock derived from cheapest variant for backward compatibility
            const cheapest = cleanedVariants.reduce((a, b) => (a.price <= b.price ? a : b));
            const totalStock = cleanedVariants.reduce((s, v) => s + v.stock, 0);
            const warrantyValue = warranty === "Other" ? (warrantyOther.trim() ? `${warrantyOther.trim()} months` : null) : (warranty || null);

            // Model number is no longer collected — derive a stable identifier
            // from the first compatible printer model so search / orders work.
            const derivedModel = (compatibleModels.split(/[,;|]/)[0] || compatibleModels || brand).trim().slice(0, 50);

            const payload = {
                brand,
                model_number: derivedModel,
                color: cleanedVariants[0].color,
                price: cheapest.price,
                stock: totalStock,
                toner_type: tonerType,
                page_yield: pageYield ? parseInt(pageYield, 10) : null,
                image_url: finalImageUrls[0] || "",
                image_urls: finalImageUrls,
                compatible_models: compatibleModels || null,
                oem_part_number: oemPartNumber || null,
                cartridge_weight: cartridgeWeight ? parseInt(cartridgeWeight, 10) : null,
                warranty: warrantyValue,
                print_technology: printTechnology || null,
                intercity_delivery_charge: parseFloat(intercityCharge || 0) || 0,
                gst_rate: Number(gstRate) || 0,
            };

            if (editingId) {
                await api.put(`/supplier/listings/${editingId}`, payload);
                toast.success("Listing updated");
            } else {
                await api.post("/supplier/listings", { ...payload, variants: cleanedVariants });
                toast.success("Listing added");
            }
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

    const patchStock = async (id, newStock) => {
        try {
            await api.put(`/supplier/listings/${id}`, { stock: Number(newStock) });
            toast.success("Stock updated");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    // Wave 10 — D2D toggle is now handled inline by the shared D2DRow component.

    const duplicateListing = async (id) => {
        try {
            await api.post(`/supplier/listings/${id}/duplicate`);
            toast.success("Listing duplicated");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
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

    const visibleListings = useMemo(
        () => (listingFilter === "active" ? listings.filter((l) => l.stock > 0) : listings),
        [listings, listingFilter]
    );
    const visibleOrders = useMemo(
        () => (orderFilter === "pending" ? orders.filter((o) => o.status === "requested") : orders),
        [orders, orderFilter]
    );

    if (!isApproved) {
        return <PendingScreen application={user?.application} />;
    }

    return (
        <div data-testid="supplier-dashboard" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Full-width dealer control bar — sits directly below the top navbar */}
            <DealerTabBar active={catalog} onSelect={selectTab} />
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
                                <div className="flex items-center gap-2.5">
                                    <h1 className="text-white truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 3.4vw, 44px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.1 }} data-testid="supplier-business-name">
                                        {user?.supplier?.business_name || user?.company || "Supplier dashboard"}
                                    </h1>
                                    <button
                                        type="button"
                                        onClick={() => { setNameInput(user?.supplier?.business_name || user?.company || ""); setNameDialogOpen(true); }}
                                        className="shrink-0 w-8 h-8 grid place-items-center rounded-lg text-white/55 hover:text-white hover:bg-white/10 transition"
                                        data-testid="edit-business-name-btn"
                                        title="Edit business name"
                                    >
                                        <Pencil size={15} />
                                    </button>
                                </div>
                                <div className="mt-2 flex items-center gap-2" data-testid="supplier-seller-id">
                                    <span className="text-[10px] tracking-[0.18em] uppercase font-semibold text-white/45">Seller ID</span>
                                    {user?.supplier?.seller_id ? (
                                        <span className="font-mono text-[13px] font-semibold text-[#F5C400] bg-white/10 border border-white/15 rounded-md px-2 py-0.5">{user.supplier.seller_id}</span>
                                    ) : (
                                        <span className="text-[12px] text-white/50 italic">Pending</span>
                                    )}
                                </div>
                                <p className="text-[14px] text-white/65 mt-2">{user?.supplier?.city || user?.city}</p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 self-start shrink-0" data-testid="seller-dashboard-label">
                            <span className="w-2 h-2 rounded-full bg-[#F5C400]" />
                            <span className="text-[11px] tracking-[0.2em] uppercase font-semibold text-white/60">Seller Dashboard</span>
                        </div>
                    </div>

                    {/* Stats inside hero — clickable, jump to the relevant section */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
                        {[
                            { k: "Listings", key: "listings", v: stats.listings, Icon: Package },
                            { k: "Active",   key: "active",   v: stats.active,   Icon: CheckCircle2 },
                            { k: "Orders",   key: "orders",   v: stats.orders,   Icon: ShoppingCart },
                            { k: "Pending",  key: "pending",  v: stats.pending,  Icon: Clock },
                        ].map(({ k, key, v, Icon }) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => goStat(key)}
                                className="tc-stat-card text-left cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:border-[#F5C400]/60 focus:outline-none focus:ring-2 focus:ring-[#F5C400]/50"
                                data-testid={`supplier-stat-${k.toLowerCase()}`}
                                aria-label={`View ${k}`}
                            >
                                <div className="tc-stat-icon"><Icon size={16} /></div>
                                <div className="tc-stat-value">{v}</div>
                                <div className="tc-stat-label">{k}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="tc-container py-8 sm:py-10">
                {catalog === "printers" ? (
                    <>
                        <h2 id="printers" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your printers</h2>
                        <CenterAction title="Manage your printers" subtitle="Add a single printer with full specs, edit your catalogue inline, or upload many at once.">
                            <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-add-printer"))} data-testid="add-printer-cta-btn"><Plus size={16} /> Add Printer</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-bulk-printer"))} data-testid="bulk-upload-printer-btn"><Upload size={15} /> Bulk upload</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-edit-printer"))} data-testid="edit-printers-btn"><Layers size={15} /> Edit Printers</Button>
                        </CenterAction>
                        <D2DExplainer />
                        <PrinterListings />
                    </>
                ) : catalog === "papers" ? (
                    <>
                        <h2 id="papers" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your papers</h2>
                        <CenterAction title="Manage your papers" subtitle="Add a single paper SKU, edit your catalogue inline, or upload many at once.">
                            <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-add-paper"))} data-testid="add-paper-cta-btn"><Plus size={16} /> Add Paper</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-bulk-paper"))} data-testid="bulk-upload-paper-btn"><Upload size={15} /> Bulk upload</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-edit-paper"))} data-testid="edit-papers-btn"><Layers size={15} /> Edit Papers</Button>
                        </CenterAction>
                        <D2DExplainer />
                        <PaperListings />
                    </>
                ) : catalog === "consumables" ? (
                    <>
                        <h2 id="consumables" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your consumables</h2>
                        <CenterAction title="Manage your consumables" subtitle="Add a single consumable SKU, edit your catalogue inline, or upload many at once.">
                            <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-add-consumable"))} data-testid="add-consumable-cta-btn"><Plus size={16} /> Add Consumable</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-bulk-consumable"))} data-testid="bulk-upload-consumable-btn"><Upload size={15} /> Bulk upload</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => window.dispatchEvent(new CustomEvent("tc-open-edit-consumable"))} data-testid="edit-consumables-btn"><Layers size={15} /> Edit Consumables</Button>
                        </CenterAction>
                        <D2DExplainer />
                        <ConsumableListings />
                    </>
                ) : catalog === "earnings" ? (
                    <>
                        <h2 id="earnings" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>My earnings</h2>
                        <SupplierEarnings />
                    </>
                ) : catalog === "insights" ? (
                    <>
                        <h2 id="insights" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Listing insights</h2>
                        <SupplierInsights />
                    </>
                ) : catalog === "orders" ? (
                    <>
                        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                            <h2 id="orders" className="text-[#0A0A0B] scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Incoming orders</h2>
                            {orderFilter === "pending" && (
                                <button onClick={() => setOrderFilter("all")} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4F46E5] bg-[#EEF0FE] border border-[#CBD2FA] rounded-full px-3 py-1.5 hover:bg-[#DDE1FC]" data-testid="orders-filter-clear">
                                    Showing pending only · Clear
                                </button>
                            )}
                        </div>
                        {visibleOrders.length === 0 ? (
                            <div className="tc-card-flat p-10 text-center text-[#6E6E73]" data-testid="seller-orders-empty">
                                {orderFilter === "pending"
                                    ? "No pending orders right now. New order requests will appear here for you to accept or reject."
                                    : "No orders yet. Once buyers place orders against your listings, they will appear here for you to accept, reject, ship and track."}
                            </div>
                        ) : (
                            <div className="tc-card-flat p-0 overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                        <tr><th className="text-left p-3">Order #</th><th className="text-left p-3">Product</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Qty</th><th className="text-left p-3">Total</th><th className="text-left p-3">Status</th><th className="text-left p-3">Action</th></tr>
                                    </thead>
                                    <tbody>
                                        {visibleOrders.map((o) => (
                                            <tr key={o.id} className="border-t border-black/[0.05]">
                                                <td className="p-3 font-mono text-[11.5px] text-[#0A0A0B]">{o.order_number || `#${(o.id||"").slice(0,8).toUpperCase()}`}</td>
                                                <td className="p-3 font-mono">{o.listings?.brand} {o.listings?.model_number || "—"}</td>
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
                        )}
                    </>
                ) : catalog === "bulk" ? (
                    <>
                        <h2 className="text-[#0A0A0B] mb-1 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Bulk orders &amp; uploads</h2>
                        <p className="text-[13px] text-[#6E6E73] mb-5 max-w-xl">List large quantities fast. Download a spreadsheet template, fill in your catalogue, and upload many products at once — for any category.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="bulk-hub">
                            {[
                                { label: "Toners", evt: null, onClick: () => requestAddAction("bulk"), tid: "bulk-hub-toners" },
                                { label: "Printers", onClick: () => window.dispatchEvent(new CustomEvent("tc-open-bulk-printer")), tid: "bulk-hub-printers" },
                                { label: "Papers", onClick: () => window.dispatchEvent(new CustomEvent("tc-open-bulk-paper")), tid: "bulk-hub-papers" },
                                { label: "Consumables", onClick: () => window.dispatchEvent(new CustomEvent("tc-open-bulk-consumable")), tid: "bulk-hub-consumables" },
                            ].map((b) => (
                                <button key={b.label} onClick={b.onClick} className="tc-card-flat p-6 text-left hover:shadow-md hover:border-black/[0.12] transition group" data-testid={b.tid}>
                                    <div className="w-10 h-10 rounded-xl bg-[#0A0A0B]/[0.05] grid place-items-center mb-3 group-hover:bg-[#0A0A0B] group-hover:text-white transition"><Upload size={18} /></div>
                                    <div className="text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Bulk upload {b.label.toLowerCase()}</div>
                                    <div className="text-[12px] text-[#6E6E73] mt-1 inline-flex items-center gap-1">Open spreadsheet <ArrowRight size={12} /></div>
                                </button>
                            ))}
                        </div>
                    </>
                ) : catalog === "d2d" ? (
                    <>
                        <h2 className="text-[#0A0A0B] mb-1 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Dealer to Dealer</h2>
                        <p className="text-[13px] text-[#6E6E73] mb-5 max-w-xl">Sell surplus stock to other verified dealers at special D2D prices. Turn on the <strong>D2D</strong> toggle on any product card (Toners / Printers / Papers tabs) and set a dealer price.</p>
                        <div className="tc-card-flat p-8 text-center" data-testid="d2d-panel">
                            <div className="w-12 h-12 rounded-2xl bg-[#5E8CB5]/15 text-[#5E8CB5] grid place-items-center mx-auto mb-4"><Store size={22} /></div>
                            <div className="text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Browse the Dealer-to-Dealer marketplace</div>
                            <p className="text-[13px] text-[#6E6E73] mt-2 max-w-md mx-auto">See D2D listings from other verified dealers and source stock at better prices.</p>
                            <Button className="btn-cta h-11 px-6 mt-5 inline-flex items-center gap-2" onClick={() => navigate("/dealer")} data-testid="d2d-open-btn">Open D2D marketplace <ArrowRight size={15} /></Button>
                        </div>
                    </>
                ) : catalog === "oem" ? (
                    <>
                        <h2 className="text-[#0A0A0B] mb-1 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>OEM Marketplace</h2>
                        <p className="text-[13px] text-[#6E6E73] mb-5 max-w-xl">The OEM Marketplace showcases official manufacturer products. Explore brand-direct listings and partnership opportunities.</p>
                        <div className="tc-card-flat p-8 text-center" data-testid="oem-panel">
                            <div className="w-12 h-12 rounded-2xl bg-[#B58A75]/15 text-[#B58A75] grid place-items-center mx-auto mb-4"><Building2 size={22} /></div>
                            <div className="text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Explore the OEM Marketplace</div>
                            <p className="text-[13px] text-[#6E6E73] mt-2 max-w-md mx-auto">Discover official, brand-direct printer and supply products from verified manufacturers.</p>
                            <Button className="btn-cta h-11 px-6 mt-5 inline-flex items-center gap-2" onClick={() => navigate("/oem")} data-testid="oem-open-btn">View OEM marketplace <ArrowRight size={15} /></Button>
                        </div>
                    </>
                ) : (
                <>
                {/* Listings */}
                <h2 id="listings" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your toners</h2>
                <CenterAction title="Manage your toners" subtitle="Add a single toner, edit your whole catalogue inline, or upload many at once.">
                    <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => requestAddAction("single")} data-testid="add-listing-btn"><Plus size={16} /> Add Toner</Button>
                    <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={() => requestAddAction("bulk")} data-testid="bulk-upload-btn"><Upload size={15} /> Bulk upload</Button>
                    {listings.length > 0 && (
                        <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" onClick={openEditBulk} data-testid="edit-toners-btn"><Layers size={15} /> Edit toners</Button>
                    )}
                </CenterAction>
                <D2DExplainer />
                {listingFilter === "active" && (
                    <div className="mb-4">
                        <button onClick={() => setListingFilter("all")} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0891B2] bg-[#ECFBFD] border border-[#C2EFF5] rounded-full px-3 py-1.5 hover:bg-[#D6F5F9]" data-testid="listings-filter-clear">
                            Showing active (in-stock) only · Clear
                        </button>
                    </div>
                )}
            {visibleListings.length === 0 ? (
                <div className="tc-card-flat p-8 text-center text-[#6E6E73]">
                    {listingFilter === "active"
                        ? "No active listings — all your toners are out of stock. Update stock or add a new toner."
                        : <>No listings yet. Tap <span className="font-semibold text-[#0A0A0B]">Add Toner</span> to publish your first toner.</>}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleListings.map((l) => {
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
                                        <div className="text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{l.brand}</div>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border uppercase tracking-[0.08em] ${typeStyle}`}>{l.toner_type}</span>
                                    </div>
                                    {l.compatible_models ? (
                                        <div className="text-[12px] text-[#6E6E73]" data-testid={`listing-compat-${l.id}`}>Compatible: {l.compatible_models}</div>
                                    ) : (
                                        <div className="text-[12px] text-[#6E6E73]">{l.color}</div>
                                    )}
                                    <div className="mt-1 flex items-center justify-between">
                                        <div className="font-mono text-[18px] font-semibold text-[#0A0A0B]">₹{Number(l.price).toLocaleString("en-IN")}</div>
                                        <InlineStock stock={l.stock} onSave={(v) => patchStock(l.id, v)} testId={`stock-edit-${l.id}`} />
                                    </div>
                                    <div className="mt-2 flex items-center gap-3">
                                        <button onClick={openEditBulk} className="text-[12px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`edit-${l.id}`}>
                                            <Pencil size={12} /> Edit
                                        </button>
                                        <button onClick={() => duplicateListing(l.id)} className="text-[12px] text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`duplicate-${l.id}`}>
                                            <Copy size={12} /> Duplicate
                                        </button>
                                        <button onClick={() => removeListing(l.id)} className="text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`remove-${l.id}`}>
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    </div>
                                    <D2DRow listing={l} endpoint={`/supplier/listings/${l.id}`} onChanged={load} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Orders moved to dedicated 'Orders' tab in catalog tabs above */}
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
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3a3a40] hover:text-[#0A0A0B] -ml-1 mb-3 self-start"
                            data-testid="back-to-dashboard-from-toner"
                        >
                            <ChevronLeft size={14} /> Back to Dashboard
                        </button>
                        <DialogTitle className="text-[22px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.01em" }}>
                            {editingId ? "Edit toner listing" : "Add a toner"}
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
                                <Label>Compatible printer models<span className="text-red-500"> *</span></Label>
                                <Input
                                    value={compatibleModels}
                                    onChange={(e) => setCompatibleModels(e.target.value)}
                                    placeholder="e.g. HP LaserJet 1010, 1012, 1015"
                                    required
                                    className="tc-input-lg"
                                    data-testid="listing-compatible-models"
                                />
                                <div className="text-[11px] text-[#86868B] mt-1">This identifies your toner and is shown on the product card.</div>
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
                                        onClick={() => {
                                            if (t === "Refilled") {
                                                setRefilledWarning(true);
                                                return;
                                            }
                                            setTonerType(t);
                                        }}
                                        className={`tc-pill ${tonerType === t ? "is-selected" : ""}`}
                                        data-testid={`listing-type-${t}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="tc-form-section">Colours &amp; pricing</div>
                        <div className="text-[12px] text-[#86868B] mb-2">Add at least one colour variant. Up to 15 colours allowed. Buyers will pick a colour on the product page; stock deducts from that specific variant.</div>
                        <div className="space-y-2" data-testid="variant-list">
                            {variants.map((v, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-[#FAFAFB] border border-black/[0.06] rounded-lg p-2" data-testid={`variant-row-${i}`}>
                                    <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                                        <span className="inline-block w-5 h-5 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: colorSwatchHex(v.color) }} />
                                        <Input value={v.color} onChange={(e) => updateVariant(i, "color", e.target.value)} placeholder="Black / Cyan / Light Magenta…" className="tc-input-lg" data-testid={`variant-color-${i}`} />
                                    </div>
                                    <Input type="number" min="0" step="1" value={v.price} onChange={(e) => updateVariant(i, "price", e.target.value)} placeholder="Price ₹" className="tc-input-lg col-span-3 sm:col-span-3" data-testid={`variant-price-${i}`} />
                                    <Input type="number" min="0" step="1" value={v.stock} onChange={(e) => updateVariant(i, "stock", e.target.value)} placeholder="Stock" className="tc-input-lg col-span-3 sm:col-span-3" data-testid={`variant-stock-${i}`} />
                                    <button type="button" onClick={() => removeVariant(i)} className="col-span-1 sm:col-span-2 h-9 inline-flex items-center justify-center text-red-600 hover:bg-red-50 rounded-md" aria-label="Remove variant" data-testid={`variant-remove-${i}`}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={addVariant} className="inline-flex items-center gap-1.5 mt-1 text-[12.5px] text-[#00B7C7] hover:text-[#0096a3] font-semibold" data-testid="variant-add-btn">
                                <Plus size={13} /> Add colour
                            </button>
                        </div>
                        <CommissionBanner />

                        <div className="tc-form-section">Specifications (optional)</div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Page yield (sheets)</Label>
                                <Input type="number" min="0" step="1" value={pageYield} onChange={(e) => setPageYield(e.target.value)} placeholder="e.g. 2000" className="tc-input-lg" data-testid="listing-page-yield" />
                            </div>
                            <div>
                                <Label>OEM part number</Label>
                                <Input value={oemPartNumber} onChange={(e) => setOemPartNumber(e.target.value)} placeholder="e.g. Q2612A" className="tc-input-lg" data-testid="listing-oem" />
                            </div>
                            <div>
                                <Label>Cartridge weight (g)</Label>
                                <Input type="number" min="0" step="1" value={cartridgeWeight} onChange={(e) => setCartridgeWeight(e.target.value)} placeholder="e.g. 450" className="tc-input-lg" data-testid="listing-weight" />
                            </div>
                            <div>
                                <Label>Print technology</Label>
                                <select value={printTechnology} onChange={(e) => setPrintTechnology(e.target.value)} className="tc-input-lg w-full" data-testid="listing-print-technology">
                                    <option value="Laser">Laser</option>
                                    <option value="Inkjet">Inkjet</option>
                                    <option value="Thermal">Thermal</option>
                                    <option value="Dot Matrix">Dot Matrix</option>
                                </select>
                            </div>
                            <div className="col-span-2">
                                <Label>Warranty</Label>
                                <select value={warranty} onChange={(e) => { setWarranty(e.target.value); if (e.target.value !== "Other") setWarrantyOther(""); }} className="tc-input-lg w-full" data-testid="listing-warranty">
                                    <option value="">No warranty</option>
                                    <option value="3 months">3 months</option>
                                    <option value="6 months">6 months</option>
                                    <option value="1 year">1 year</option>
                                    <option value="Other">Other</option>
                                </select>
                                {warranty === "Other" && (
                                    <Input value={warrantyOther} onChange={(e) => setWarrantyOther(e.target.value)} placeholder="Enter months (e.g. 18)" className="tc-input-lg mt-2" data-testid="listing-warranty-other" />
                                )}
                            </div>
                            <div className="col-span-2">
                                <Label>GST rate (%)</Label>
                                <select
                                    value={gstRate}
                                    onChange={(e) => setGstRate(Number(e.target.value))}
                                    className="tc-input-lg w-full"
                                    data-testid="listing-gst-rate"
                                >
                                    {GST_RATES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                                </select>
                                {(() => {
                                    const cheapest = variants.reduce((a, b) => {
                                        const pa = parseFloat(a.price || 0); const pb = parseFloat(b.price || 0);
                                        if (!pa) return b; if (!pb) return a; return pa <= pb ? a : b;
                                    }, variants[0]);
                                    const base = parseFloat(cheapest?.price || 0);
                                    if (!base) return null;
                                    const gst = gstAmount(base, gstRate);
                                    return (
                                        <div className="text-[12px] text-[#0A0A0B] bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mt-2" data-testid="listing-gst-preview">
                                            Base price: <strong>{formatINR(base)}</strong> + GST ({gstRate}%): <strong>{formatINR(gst)}</strong> = Total: <strong>{formatINR(base + gst)}</strong>
                                        </div>
                                    );
                                })()}
                                <div className="text-[11px] text-[#86868B] mt-1">Buyer sees only the base price on listing cards. GST is added on the checkout summary.</div>
                            </div>
                            <div className="col-span-2">
                                <Label>Intercity delivery charge (₹)</Label>
                                <Input type="number" min="0" step="1" value={intercityCharge} onChange={(e) => setIntercityCharge(e.target.value)} placeholder="0" className="tc-input-lg" data-testid="listing-intercity-charge" />
                                <div className="text-[11px] text-[#86868B] mt-1">Delivery within your city is free and included in your listed price. Enter a charge only if you deliver to other cities. Leave 0 if intercity not available.</div>
                            </div>
                        </div>

                        {/* Wave 12 — image upload removed for toners. Animated cartridge
                            graphic is shown automatically on every listing card. */}

                        <DialogFooter className="mt-6">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                            <Button type="submit" className="btn-pill-cta" disabled={saving} data-testid="listing-save-btn">
                                {saving ? (editingId ? "Updating…" : "Publishing…") : (editingId ? "Save changes" : "Publish listing")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <RefilledWarningDialog open={refilledWarning} onClose={() => setRefilledWarning(false)} />
            {bulkOpen && (
                <BulkUploadGeneric
                    config={tonerBulkConfig}
                    onClose={() => setBulkOpen(false)}
                    onSuccess={() => { load(); }}
                />
            )}
            {editBulkOpen && (
                <BulkUploadGeneric
                    config={tonerBulkConfig}
                    editMode
                    initialRows={listings.map(tonerBulkConfig.fromListing)}
                    onClose={() => setEditBulkOpen(false)}
                    onSuccess={() => { load(); }}
                />
            )}
            {/* Edit business / company name */}
            <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
                <DialogContent className="sm:max-w-md" data-testid="edit-name-dialog">
                    <DialogHeader>
                        <DialogTitle>Edit business name</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-1">
                        <Label>Business / company name</Label>
                        <Input
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="e.g. Sharma Printer Solutions"
                            className="tc-input-lg"
                            data-testid="business-name-input"
                            onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
                        />
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setNameDialogOpen(false)} data-testid="cancel-name-btn">Cancel</Button>
                            <Button className="btn-cta" onClick={saveName} disabled={savingName} data-testid="save-name-btn">{savingName ? "Saving…" : "Save"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <SupplierAgreementDialog
                open={agreementOpen}
                onAccept={onAgreementAccepted}
                onClose={() => { setAgreementOpen(false); setPendingAddAction(null); }}
            />
            </div>
        </div>
    );
}
