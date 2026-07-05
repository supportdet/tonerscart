import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon, Hourglass, CheckCircle2, XCircle, Camera, Loader2, Package, ShoppingCart, Clock, Printer, FileText, Pencil, X as XIcon, Eye } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { GST_RATES, formatINR, withGst, priceFromInclusive, inclGstPrice } from "../lib/listingConstants";
import { TONER_BRANDS } from "../lib/brands";
import { supabase, PRODUCT_BUCKET } from "../lib/supabase";
import RefilledWarningDialog from "../components/RefilledWarningDialog";
import TonerCartridge from "../components/TonerCartridge";
import PrinterListings from "../components/PrinterListings";
import PaperListings from "../components/PaperListings";
import ConsumableListings from "../components/ConsumableListings";
import ScannerListings from "../components/ScannerListings";
import DeliveryPolicyNote from "../components/DeliveryPolicyNote";
import SupplierEarnings from "../components/SupplierEarnings";
import SupplierInsights from "../components/SupplierInsights";
import CompetitivePricingNote from "../components/CompetitivePricingNote";
import TonerModelSearchSelect from "../components/TonerModelSearchSelect";
import CommissionCalculator from "../components/CommissionCalculator";
import { commissionFor, payoutBreakdown } from "../lib/commission";
import { Copy, Check, ChevronLeft, Upload, ArrowRight, Store, Building2, Layers } from "lucide-react";
import { colorSwatch as _colorSwatch } from "../lib/colors";
import BulkUploadGeneric from "../components/BulkUploadGeneric";
import { tonerBulkConfig } from "../lib/bulkConfigs";
import D2DRow, { D2DExplainer } from "../components/D2DRow";
import CompatibleModelsSelect from "../components/CompatibleModelsSelect";
import MissingModelLink from "../components/MissingModelLink";
import InlineEditCell from "../components/InlineEditCell";
import Phase2Banner from "../components/Phase2Banner";
import DealerOnboarding from "../components/DealerOnboarding";
import DealerProfileMenu from "../components/DealerProfileMenu";

const colorSwatchHex = (name) => {
    const v = _colorSwatch(name);
    return v.startsWith("linear") ? "#C8C8CD" : v;
};

const DEALER_TABS = [
    { key: "toners", label: "Toners" },
    { key: "printers", label: "Printers" },
    { key: "consumables", label: "Inks & Consumables" },
    { key: "scanners", label: "Scanners" },
    { key: "papers", label: "Papers" },
    { key: "orders", label: "Orders" },
    { key: "earnings", label: "My Earnings" },
    { key: "insights", label: "Insights" },
    { key: "bulk", label: "Bulk Orders" },
    { key: "d2d", label: "Dealer to Dealer" },
    { key: "oem", label: "OEM Marketplace" },
];

// Category badge colours kept neutral for the seller dashboard (Wave 58 visual
// cleanup) — colourful brand pills now live only on the public navbar.
const CAT_BADGE = {
    Toner: "bg-black/[0.04] text-[#0A0A0B] border-black/[0.08]",
    Printer: "bg-black/[0.04] text-[#0A0A0B] border-black/[0.08]",
    Paper: "bg-black/[0.04] text-[#0A0A0B] border-black/[0.08]",
    Consumable: "bg-black/[0.04] text-[#0A0A0B] border-black/[0.08]",
};

// Wave 58 — neutral tab bar. Active tab = black text + 2px black underline,
// inactive tabs = black at 50% opacity (no bg fills, no colored pills). Mobile
// horizontally scrollable.
function DealerTabBar({ active, onSelect }) {
    return (
        <div
            className="w-full bg-white/95 backdrop-blur border-b border-black/[0.07] sticky top-[64px] z-[90]"
            style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.03), 0 2px 6px -2px rgba(0,0,0,0.04)" }}
            data-testid="catalog-tabs"
        >
            <div className="tc-container px-0 sm:px-2">
                <div
                    className="flex items-center gap-6 sm:gap-7 overflow-x-auto tc-cat-scroll px-4 sm:px-2"
                    role="tablist"
                    aria-label="Dealer dashboard sections"
                >
                    {DEALER_TABS.map((t) => {
                        const isActive = active === t.key;
                        return (
                            <button
                                key={t.key}
                                onClick={() => onSelect(t.key)}
                                data-testid={`tab-${t.key}`}
                                aria-current={isActive ? "page" : undefined}
                                role="tab"
                                aria-selected={isActive}
                                className={`relative inline-flex items-center py-4 text-[13.5px] whitespace-nowrap outline-none transition-colors ${
                                    isActive ? "text-[#0A0A0B]" : "text-[#0A0A0B]/50 hover:text-[#0A0A0B]/80"
                                }`}
                                style={{
                                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                                    fontWeight: isActive ? 600 : 500,
                                    letterSpacing: "-0.005em",
                                }}
                            >
                                {t.label}
                                {isActive && (
                                    <span
                                        className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#0A0A0B]"
                                        aria-hidden
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
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
    accepted: "Confirmed",
    shipped: "Dispatched",
    delivered: "Delivered",
    completed: "Completed",
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

function CourierDispatchInput({ onSubmit, testIdSuffix }) {
    const [courier, setCourier] = React.useState("");
    const [tracking, setTracking] = React.useState("");
    const submit = () => {
        const c = courier.trim(); const t = tracking.trim();
        if (!c || !t) return;
        onSubmit({ courier_name: c, tracking_number: t });
        setCourier(""); setTracking("");
    };
    return (
        <div className="flex flex-col gap-1.5 min-w-[180px]">
            <input
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                placeholder="Courier name (e.g. Delhivery)"
                className="h-7 px-2 text-[11.5px] rounded border border-[#D2D2D7] bg-white w-full"
                data-testid={`courier-input-${testIdSuffix}`}
            />
            <div className="flex items-center gap-1.5">
                <input
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                    placeholder="Tracking number"
                    className="h-7 px-2 text-[11.5px] rounded border border-[#D2D2D7] bg-white w-32"
                    data-testid={`tracking-input-${testIdSuffix}`}
                />
                <button
                    onClick={submit}
                    disabled={!courier.trim() || !tracking.trim()}
                    className="text-[11px] px-2 py-1 rounded bg-[#0A0A0B] text-white border border-[#0A0A0B] hover:bg-[#1D1D1F] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    data-testid={`dispatch-submit-${testIdSuffix}`}
                >
                    Mark Dispatched
                </button>
            </div>
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
    const applicationStatus = user?.application_status; // 'pending' | 'rejected' | null
    // Wave 65 — pending dealers see the dashboard layout with a yellow banner
    // and all add/bulk/edit CTAs disabled (selling features locked) until an
    // admin approves them. Rejected applicants still see the hard-block
    // PendingScreen (final state, not "under review").
    const isPending = !isApproved && applicationStatus === "pending";
    const lockReason = "Available after admin approval — usually within 1–2 business days.";
    const guardedClick = (fn) => () => {
        if (!isApproved) {
            toast.info(lockReason);
            return;
        }
        fn();
    };
    const [catalog, setCatalog] = useState("toners"); // 'toners' | 'printers' | 'papers' | 'consumables' | 'orders' | 'earnings' | 'insights' | 'bulk' | 'd2d' | 'oem'
    const [listingFilter, setListingFilter] = useState("all"); // 'all' | 'active' — toner listings
    const [orderFilter, setOrderFilter] = useState("all"); // 'all' | 'pending' — orders
    const [bulkOpen, setBulkOpen] = useState(false);
    const [editBulkOpen, setEditBulkOpen] = useState(false);
    // Wave 100 — controls the Phase 2 dialog opened from the DealerOnboarding
    // step-3 CTA (banner UI itself is hidden in onboarding mode).
    const [onboardingPhase2Open, setOnboardingPhase2Open] = useState(false);
    // Edit business / company name
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [savingName, setSavingName] = useState(false);
    // Wave 61 — the SupplierAgreementDialog second-popup was removed. The
    // platform-wide <AgreementGate> in App.js handles the one-time seller
    // agreement at first login (DB-tracked, versioned via user_agreements).

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

    // Brand dropdown — fixed canonical list (no DB-driven junk entries)
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
    // Toner cartridge model number — picked from compatibility_db.py via
    // the searchable dropdown. When dealer selects a known model we auto-
    // populate `compatibleModels` with that toner's known printers.
    const [tonerModel, setTonerModel] = useState("");
    const [oemPartNumber, setOemPartNumber] = useState("");
    const [cartridgeWeight, setCartridgeWeight] = useState("");
    const [warranty, setWarranty] = useState("1 Year");
    const [warrantyOther, setWarrantyOther] = useState("");
    const [printTechnology, setPrintTechnology] = useState("Laser");
    const [intercityCharge, setIntercityCharge] = useState("100");
    const [intracityCharge, setIntracityCharge] = useState("0");
    const [gstRate, setGstRate] = useState(18);
    // Whether the per-variant prices below were entered as GST-inclusive or
    // GST-exclusive. Starts UNSELECTED — dealer must pick one before
    // publishing. Applies to ALL variants in this listing.
    const [priceType, setPriceType] = useState(null);
    const [priceTypeError, setPriceTypeError] = useState(false);
    // Variants
    const [variants, setVariants] = useState([{ color: "Black", price: "", stock: "" }]);

    // Business logo
    const [logoUrl, setLogoUrl] = useState("");
    const [logoUploading, setLogoUploading] = useState(false);
    const [allProducts, setAllProducts] = useState([]);

    const load = async () => {
        if (!isApproved) return;
        try {
            const [l, o] = await Promise.all([
                api.get("/supplier/listings"),
                api.get("/orders/mine"),
            ]);
            setListings(Array.isArray(l.data) ? l.data : []);
            setOrders(Array.isArray(o.data) ? o.data : []);
        } catch (e) { toast.error(formatApiError(e)); }
    };

    // Combined "All Listings" feed — every product across all 4 categories.
    const loadAllProducts = async () => {
        if (!isApproved) return;
        const reqs = await Promise.allSettled([
            api.get("/supplier/listings"),
            api.get("/supplier/printers/mine"),
            api.get("/supplier/papers/mine"),
            api.get("/supplier/consumables/mine"),
            api.get("/supplier/scanners/mine"),
        ]);
        const arr = (r) => (r.status === "fulfilled" && Array.isArray(r.value.data) ? r.value.data : []);
        const j = (...parts) => parts.filter(Boolean).join(" ").trim();
        const toners = arr(reqs[0]).map((l) => ({ id: l.id, kind: "toner", cat: "Toner", name: j(l.brand, l.compatible_models || l.model_number), price: l.price, gst_rate: l.gst_rate, stock: l.stock }));
        const printers = arr(reqs[1]).map((l) => ({ id: l.id, kind: "printer", cat: "Printer", name: j(l.brand, l.model_number), price: l.price, gst_rate: l.gst_rate, stock: l.stock }));
        const papers = arr(reqs[2]).map((l) => ({ id: l.id, kind: "paper", cat: "Paper", name: j(l.brand, l.size, l.gsm ? `${l.gsm}GSM` : ""), price: l.price_per_ream, gst_rate: l.gst_rate, stock: l.stock }));
        const cons = arr(reqs[3]).map((l) => ({ id: l.id, kind: "consumable", cat: "Consumable", name: j(l.brand, l.model_number), price: l.price, gst_rate: l.gst_rate, stock: l.stock }));
        const scanners = arr(reqs[4]).map((l) => ({ id: l.id, kind: "scanner", cat: "Scanner", name: j(l.brand, l.model_number), price: l.price, gst_rate: l.gst_rate, stock: l.stock }));
        setAllProducts([...toners, ...printers, ...papers, ...cons, ...scanners]);
    };

    useEffect(() => { load(); loadAllProducts(); /* eslint-disable-next-line */ }, [isApproved]);

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
        setCompatibleModels(""); setTonerModel(""); setOemPartNumber(""); setCartridgeWeight(""); setWarranty(""); setWarrantyOther(""); setPrintTechnology("Laser"); setIntercityCharge("100"); setIntracityCharge("0"); setGstRate(18); setPriceType(null); setPriceTypeError(false);
        setVariants([{ color: "Black", price: "", stock: "" }]);
        setEditingId(null);
        setExistingImages([]);
    };
    const openDialog = () => { reset(); setOpen(true); };

    // Wave 61 — direct open. AgreementGate (app-level) ensures the seller
    // agreement is already accepted before the dealer ever reaches this UI.
    const requestAddAction = (kind /* 'single' | 'bulk' */) => {
        if (kind === "bulk") setBulkOpen(true);
        else openDialog();
    };

    const openEditBulk = () => setEditBulkOpen(true);

    // Wave 105.2 — Individual edit for an already-saved toner listing.
    // Populates the single-toner dialog with the listing's current values so
    // the dealer can add photos, tweak specs, adjust price etc. — everything
    // the bulk grid can't do inline. Called from the "Edit individually"
    // option on both the Toners grid card and the combined All-Listings row.
    const openEditToner = (l) => {
        reset();  // clear any prior form state
        setEditingId(l.id);
        setBrand(l.brand || "");
        setColor(l.color || "Black");
        setPrice(l.price != null ? String(l.price) : "");
        setStock(l.stock != null ? String(l.stock) : "");
        setTonerType(l.toner_type || "Original");
        setPageYield(l.page_yield != null ? String(l.page_yield) : "");
        setCompatibleModels(l.compatible_models || "");
        setTonerModel(l.model_number || "");
        setOemPartNumber(l.oem_part_number || "");
        setCartridgeWeight(l.cartridge_weight != null ? String(l.cartridge_weight) : "");
        // Warranty may be one of the presets or a custom "Other" value
        const warrantyPresets = ["6 Months", "1 Year", "2 Years", "3 Years"];
        if (l.warranty && !warrantyPresets.includes(l.warranty)) {
            setWarranty("Other"); setWarrantyOther(l.warranty);
        } else {
            setWarranty(l.warranty || "1 Year"); setWarrantyOther("");
        }
        setPrintTechnology(l.print_technology || "Laser");
        setIntercityCharge(l.intercity_delivery_charge != null ? String(l.intercity_delivery_charge) : "100");
        setIntracityCharge(l.intracity_delivery_charge != null ? String(l.intracity_delivery_charge) : "0");
        setGstRate(l.gst_rate ?? 18);
        // Wave 105.3 — bulk upload stores prices as GST-exclusive (base) with
        // no toggle asked. When editing an already-saved listing, default to
        // "excl" so the dealer isn't nagged to re-answer a question they never
        // saw during bulk upload. They can still switch to "incl" if desired.
        setPriceType("excl");
        setPriceTypeError(false);
        // Variants: rehydrate from stored JSON or fall back to a single row.
        const vs = Array.isArray(l.variants) && l.variants.length
            ? l.variants.map((v) => ({ color: v.color || "Black", price: v.price != null ? String(v.price) : "", stock: v.stock != null ? String(v.stock) : "" }))
            : [{ color: l.color || "Black", price: l.price != null ? String(l.price) : "", stock: l.stock != null ? String(l.stock) : "" }];
        setVariants(vs);
        // Existing image URLs — the form's ImageUploader will display them
        // as removable thumbs alongside any newly-added files.
        setExistingImages(Array.isArray(l.image_urls) ? l.image_urls : (l.image_url ? [l.image_url] : []));
        setOpen(true);
    };

    // Open the bulk-upload dialog for any category from the central Bulk hub.
    // Printer/Paper/Consumable bulk dialogs live INSIDE their tab components, so
    // we switch to that tab first (mounting the component + its event listener),
    // then dispatch the open event — same pattern as editProduct below. Toner's
    // bulk dialog is owned by this dashboard and is gated by the agreement modal.
    const openBulkFor = (kind) => {
        if (kind === "toner") { requestAddAction("bulk"); return; }
        const tabKey = { printer: "printers", paper: "papers", consumable: "consumables", scanner: "scanners" }[kind];
        const evt = { printer: "tc-open-bulk-printer", paper: "tc-open-bulk-paper", consumable: "tc-open-bulk-consumable", scanner: "tc-open-bulk-scanner" }[kind];
        setCatalog(tabKey);
        setTimeout(() => window.dispatchEvent(new CustomEvent(evt)), 320);
    };

    // Manual tab click clears any stat-driven filter.
    const selectTab = (key) => { setCatalog(key); setListingFilter("all"); setOrderFilter("all"); };
    // Clickable stat cards → smooth-scroll to the relevant on-page section.
    const goStat = (key) => {
        if (key === "listings" || key === "active") {
            setListingFilter(key === "active" ? "active" : "all");
            loadAllProducts();
            setTimeout(() => document.getElementById("all-listings")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
        } else {
            setCatalog("orders");
            setOrderFilter(key === "pending" ? "pending" : "all");
            setTimeout(() => document.getElementById("orders")?.scrollIntoView({ behavior: "smooth", block: "start" }), 140);
        }
    };

    // Combined "All Listings" — edit jumps to the right tab+grid, delete hits the API.
    // For toners specifically we route to the individual editor by default so
    // dealers can add photos etc. (the bulk grid can't do inline image upload).
    // The Toners grid also exposes a "Edit in bulk" affordance for the bulk grid path.
    const editProduct = (p) => {
        if (p.kind === "toner") {
            setCatalog("toners");
            // Prefer the already-fetched full listing from `listings` (has all
            // fields incl. variants + image_urls). Only if not found (rare —
            // e.g. right after add) do we fall back to the trimmed row.
            const full = listings.find((x) => x.id === p.id);
            openEditToner(full || p);
            return;
        }
        const tabKey = { printer: "printers", paper: "papers", consumable: "consumables", scanner: "scanners" }[p.kind];
        const evt = { printer: "tc-open-edit-printer", paper: "tc-open-edit-paper", consumable: "tc-open-edit-consumable", scanner: "tc-open-edit-scanner" }[p.kind];
        setCatalog(tabKey);
        setTimeout(() => window.dispatchEvent(new CustomEvent(evt)), 280);
    };
    const deleteProduct = async (p) => {
        if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
        const base = { toner: "/supplier/listings", printer: "/supplier/printers", paper: "/supplier/papers", consumable: "/supplier/consumables", scanner: "/supplier/scanners" }[p.kind];
        try {
            await api.delete(`${base}/${p.id}`);
            toast.success("Product deleted");
            loadAllProducts();
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    // Wave 96 — inline edit for price + stock on the All Listings table.
    // Updates the listing immediately via the per-category PUT endpoint and
    // re-loads only the combined feed so the rest of the dashboard state
    // stays untouched. Paper uses `price_per_ream`; all others use `price`.
    const KIND_ENDPOINT = {
        toner: "/supplier/listings",
        printer: "/supplier/printers",
        paper: "/supplier/papers",
        consumable: "/supplier/consumables",
        scanner: "/supplier/scanners",
    };
    const inlineUpdate = async (p, field, value) => {
        const base = KIND_ENDPOINT[p.kind];
        if (!base) throw new Error("Unknown product kind");
        let payload;
        if (field === "price") {
            payload = p.kind === "paper" ? { price_per_ream: Number(value) } : { price: Number(value) };
        } else if (field === "stock") {
            payload = { stock: Number(value) };
        } else {
            throw new Error("Unsupported field");
        }
        try {
            await api.put(`${base}/${p.id}`, payload);
            toast.success(field === "price" ? "Price updated" : "Stock updated");
            // Optimistically update local row + reload feed in background
            setAllProducts((prev) => prev.map((x) => (x.id === p.id && x.kind === p.kind ? { ...x, [field]: Number(value) } : x)));
            loadAllProducts();
        } catch (e) {
            toast.error(formatApiError(e));
            throw e;
        }
    };

    // Wave 77 — "No Stock" toggle. Setting stock=0 marks the listing as
    // unavailable to buyers without deleting it. Re-enable defaults back to
    // stock=1; dealer can edit to the real number via the edit dialog.
    const toggleStock = async (p) => {
        const base = { toner: "/supplier/listings", printer: "/supplier/printers", paper: "/supplier/papers", consumable: "/supplier/consumables", scanner: "/supplier/scanners" }[p.kind];
        const newStock = Number(p.stock) > 0 ? 0 : 1;
        try {
            await api.put(`${base}/${p.id}`, { stock: newStock });
            toast.success(newStock === 0 ? "Marked as out of stock" : "Marked back in stock — update the count in Edit if needed");
            loadAllProducts();
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    // Wave 77 — "View as buyer" opens the same product detail page a
    // shopper sees. The detail page itself shows the inline Edit button
    // when the viewer is the owning dealer.
    const viewAsBuyer = (p) => {
        const path = {
            toner: `/toner/${p.id}`,
            printer: `/printer/${p.id}`,
            paper: `/paper/${p.id}`,
            consumable: `/consumable/${p.id}`,
            scanner: `/scanner/${p.id}`,
        }[p.kind];
        if (path) window.open(path, "_blank", "noopener,noreferrer");
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
        if (!compatibleModels.trim()) { toast.error("Please enter the suitable printer models"); return; }
        if (!pageYield || parseInt(pageYield, 10) <= 0) { toast.error("Page yield (sheets) is required"); return; }
        // Wave 73 — warranty + cartridge_weight no longer block submission.
        // Defaults are filled in below if the dealer left them blank.
        if (warranty === "Other" && !warrantyOther.trim()) { toast.error("Enter the custom warranty period"); return; }
        if (!priceType) { setPriceTypeError(true); toast.error("Pick whether variant prices are Incl. or Excl. GST"); return; }
        setPriceTypeError(false);
        // Convert variant prices to base (GST-exclusive) before saving — the
        // global priceType toggle applies to every row in this listing.
        const cleanedVariants = variants
            .map((v) => {
                const typed = parseFloat(v.price);
                const base = priceType === "incl" ? priceFromInclusive(typed, gstRate) : typed;
                return { color: (v.color || "").trim(), price: base, stock: parseInt(v.stock, 10) };
            })
            .filter((v) => v.color && v.price > 0 && v.stock >= 0);
        if (cleanedVariants.length === 0) {
            toast.error("Add at least one colour variant with a colour name, price and stock");
            return;
        }
        setSaving(true);
        try {
            // Wave 79 — toner image upload restored. Each File in imageFiles is
            // POSTed to /supplier/listing-image (which compresses + watermarks
            // via Pillow) and the returned URLs are merged with any
            // already-stored URLs for edit mode. Previously the toner submit
            // path silently dropped imageFiles, which is why uploaded images
            // never showed on the listing cards or detail pages.
            const uploadedUrls = [];
            for (const f of imageFiles.filter(Boolean)) {
                try {
                    const fd = new FormData();
                    fd.append("file", f);
                    const { data } = await api.post("/supplier/listing-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
                    if (data?.url) uploadedUrls.push(data.url);
                } catch (e) {
                    toast.error(`Image upload failed: ${formatApiError(e)}`);
                }
            }
            // Wave 105.3 — newly-uploaded images go FIRST so the freshly-added
            // photo becomes the card's primary display image (image_url = [0]).
            // Otherwise a bulk-uploaded listing with a placeholder image_url
            // would keep showing the placeholder even after the dealer adds
            // a real product photo.
            const finalImageUrls = [...uploadedUrls, ...(existingImages || [])];

            // Top-level price/stock derived from cheapest variant for backward compatibility
            const cheapest = cleanedVariants.reduce((a, b) => (a.price <= b.price ? a : b));
            const totalStock = cleanedVariants.reduce((s, v) => s + v.stock, 0);
            const warrantyValue = warranty === "Other" ? (warrantyOther.trim() ? `${warrantyOther.trim()} months` : "1 Year") : (warranty || "1 Year");

            // Model number — prefer the dealer-selected cartridge model from the
            // compatibility-DB dropdown; otherwise fall back to the first
            // compatible printer model so search/orders still work.
            const fallbackModel = (compatibleModels.split(/[,;|]/)[0] || compatibleModels || brand).trim().slice(0, 50);
            const derivedModel = (tonerModel || "").trim() || fallbackModel;

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
                intracity_delivery_charge: parseFloat(intracityCharge || 0) || 0,
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

    const updateOrder = async (id, status, extra = {}) => {
        try {
            await api.put(`/orders/${id}/status`, { status, ...extra });
            const label = { accepted: "confirmed", shipped: "marked dispatched", delivered: "marked delivered", rejected: "rejected" }[status] || status;
            toast.success(`Order ${label}`);
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
    const visibleAllProducts = useMemo(
        () => (listingFilter === "active" ? allProducts.filter((p) => Number(p.stock) > 0) : allProducts),
        [allProducts, listingFilter]
    );

    if (!isApproved && !isPending) {
        // Rejected (or otherwise non-pending) — keep the hard-block screen
        // ONLY when an application exists with status='rejected'. Brand-new
        // dealers who signed up via /register but haven't filled the seller
        // form yet (no application row, no role yet) should see the Wave 100
        // onboarding flow instead.
        if (user?.application?.status === "rejected") {
            return <PendingScreen application={user.application} />;
        }
    }

    // Wave 101 hotfix — Dealer onboarding gateway. Show the locked 4-step
    // checklist (NOT the product dashboard) ONLY for non-approved dealers.
    // APPROVED dealers (row in suppliers) ALWAYS see their normal dashboard,
    // even if some optional/secondary KYC docs are still missing — the
    // Phase2Banner (mounted inside the normal dashboard below) handles those
    // gentle nudges. No exception.
    //   stage = "no_app"           — no application yet, fill business details
    //          "draft"             — business details saved, Step 3 active
    //          "pending"           — Step 3 submitted, under admin review
    //          null                — approved OR fully onboarded → normal dashboard
    let stage = null;
    if (!isApproved) {
        if (applicationStatus === "pending") stage = "pending";
        else if (applicationStatus === "draft") stage = "draft";
        else stage = "no_app";
    }
    if (stage) {
        return (
            <>
                <DealerOnboarding
                    stage={stage}
                    user={user}
                    onStartStep2={() => navigate("/sell")}
                    onOpenPhase2={() => setOnboardingPhase2Open(true)}
                />
                {/* Mounting Phase2Banner with banner hidden — only its dialogs
                    are used here. The dealer triggers them from the
                    onboarding step card; the banner UI never renders. */}
                {stage === "draft" && (
                    <Phase2Banner
                        supplier={user?.application || {}}
                        onUpdated={refresh}
                        externalOpen={onboardingPhase2Open}
                        onExternalClose={() => setOnboardingPhase2Open(false)}
                        hideBanner
                        showSubmitForReview
                    />
                )}
            </>
        );
    }

    return (
        <div data-testid="supplier-dashboard" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Compact black hero strip — identity + clickable stats on one slim band */}
            <div className="tc-hero relative">
                <div className="tc-hero-grid" />
                <div className="tc-container relative py-4 sm:py-[18px]">
                    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                        {/* Identity — logo + name + seller ID, one compact row */}
                        <div className="flex items-center gap-3 min-w-0">
                            <label className="relative shrink-0 cursor-pointer group" data-testid="business-logo-uploader">
                                <input type="file" accept="image/*" className="hidden" onChange={onPickLogo} data-testid="business-logo-input" />
                                <div className="w-11 h-11 rounded-full overflow-hidden border border-dashed border-white/25 bg-white/[0.06] grid place-items-center group-hover:border-[#F5C400]/70 transition">
                                    {logoUploading ? (
                                        <Loader2 size={16} className="text-white/70 animate-spin" />
                                    ) : logoUrl ? (
                                        <img src={logoUrl} alt="Business logo" className="w-full h-full object-cover" data-testid="business-logo-img" />
                                    ) : (
                                        <Camera size={16} className="text-white/55" strokeWidth={1.6} />
                                    )}
                                </div>
                            </label>

                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-white truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(18px, 2.2vw, 26px)", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.1 }} data-testid="supplier-business-name">
                                        {user?.supplier?.business_name || user?.company || "Supplier dashboard"}
                                    </h1>
                                    <button
                                        type="button"
                                        onClick={() => { setNameInput(user?.supplier?.business_name || user?.company || ""); setNameDialogOpen(true); }}
                                        className="shrink-0 w-7 h-7 grid place-items-center rounded-lg text-white/55 hover:text-white hover:bg-white/10 transition"
                                        data-testid="edit-business-name-btn"
                                        title="Edit business name"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] tracking-[0.14em] uppercase font-semibold text-emerald-300/90"><CheckCircle2 size={11} /> Approved</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-[11.5px] text-white/55 flex-wrap" data-testid="supplier-seller-id">
                                    <span className="tracking-[0.1em] uppercase text-white/40">Seller ID</span>
                                    {user?.supplier?.seller_id ? (
                                        <span className="font-mono text-[12px] font-semibold text-[#F5C400] bg-white/10 border border-white/15 rounded px-1.5 py-0.5">{user.supplier.seller_id}</span>
                                    ) : (
                                        <span className="italic text-white/45">Pending</span>
                                    )}
                                    {(user?.supplier?.city || user?.city) && <span className="text-white/30">·</span>}
                                    <span>{user?.supplier?.city || user?.city}</span>
                                </div>
                            </div>
                        </div>

                        {/* Compact clickable stats — slim pills */}
                        <div className="flex items-center gap-2 flex-wrap" data-testid="seller-dashboard-label">
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
                                    className="group flex items-center gap-2 rounded-xl bg-[#F5F5F7] hover:bg-[#EBEBEF] border border-black/[0.06] px-3 py-1.5 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-black/20"
                                    data-testid={`supplier-stat-${k.toLowerCase()}`}
                                    aria-label={`Go to ${k}`}
                                >
                                    <Icon size={14} className="text-[#0A0A0B]/55" />
                                    <span className="text-left leading-none">
                                        <span className="block text-[15px] font-semibold text-[#0A0A0B]">{v}</span>
                                        <span className="block text-[9px] tracking-[0.12em] uppercase text-[#0A0A0B]/55 mt-0.5">{k}</span>
                                    </span>
                                </button>
                            ))}
                            {/* Wave 102 — approved-dealer profile dropdown (top-right) */}
                            {isApproved && user?.supplier && (
                                <DealerProfileMenu supplier={user.supplier} onRefresh={refresh} />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Wave 65 — Pending approval banner. Shown while role is still
                customer + suppliers_pending.status==='pending'. Listings and
                selling features are locked (CTAs disabled) until approval. */}
            {isPending && (
                <div className="bg-[#FFFBEB] border-b border-[#F5C400]/40" data-testid="supplier-pending-banner">
                    <div className="tc-container py-3 flex items-start gap-3">
                        <Hourglass size={18} className="text-amber-600 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-semibold text-[#5C4A00]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                Your account is under review.
                            </div>
                            <div className="text-[12.5px] text-[#5C4A00]/85 mt-0.5">
                                We&rsquo;ll notify you by email once approved — usually within 1&ndash;2 business days. You can browse your dashboard now; listings and selling tools will unlock automatically after approval.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Wave 98 — Phase 2 "Complete your profile" banner.
                Shown to APPROVED dealers whose bank details or KYC docs are
                still missing. Auto-dismisses when complete. Does NOT block
                listing/selling — payouts are gated by it. */}
            {isApproved && user?.supplier && (
                <Phase2Banner supplier={user.supplier} onUpdated={refresh} />
            )}

            {/* Sticky full-width pastel control bar — stays pinned below the navbar */}
            <DealerTabBar active={catalog} onSelect={selectTab} />

            <div className="tc-container py-8 sm:py-10">
                {catalog === "printers" ? (
                    <>
                        <h2 id="printers" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your printers</h2>
                        <CenterAction title="Manage your printers" subtitle="Add a single printer with full specs, edit your catalogue inline, or upload many at once.">
                            <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-add-printer")))} data-testid="add-printer-cta-btn"><Plus size={16} /> Add Printer</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-bulk-printer")))} data-testid="bulk-upload-printer-btn"><Upload size={15} /> Bulk upload</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-edit-printer")))} data-testid="edit-printers-btn"><Layers size={15} /> Edit Printers</Button>
                        </CenterAction>
                        <D2DExplainer />
                        <PrinterListings />
                    </>
                ) : catalog === "papers" ? (
                    <>
                        <h2 id="papers" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your papers</h2>
                        <CenterAction title="Manage your papers" subtitle="Add a single paper SKU, edit your catalogue inline, or upload many at once.">
                            <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-add-paper")))} data-testid="add-paper-cta-btn"><Plus size={16} /> Add Paper</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-bulk-paper")))} data-testid="bulk-upload-paper-btn"><Upload size={15} /> Bulk upload</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-edit-paper")))} data-testid="edit-papers-btn"><Layers size={15} /> Edit Papers</Button>
                        </CenterAction>
                        <D2DExplainer />
                        <PaperListings />
                    </>
                ) : catalog === "consumables" ? (
                    <>
                        <h2 id="consumables" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your consumables</h2>
                        <CenterAction title="Manage your consumables" subtitle="Add a single consumable SKU, edit your catalogue inline, or upload many at once.">
                            <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-add-consumable")))} data-testid="add-consumable-cta-btn"><Plus size={16} /> Add Consumable</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-bulk-consumable")))} data-testid="bulk-upload-consumable-btn"><Upload size={15} /> Bulk upload</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-edit-consumable")))} data-testid="edit-consumables-btn"><Layers size={15} /> Edit Inks & Consumables</Button>
                        </CenterAction>
                        <D2DExplainer />
                        <ConsumableListings />
                    </>
                ) : catalog === "scanners" ? (
                    <>
                        <h2 id="scanners" className="text-[#0A0A0B] mb-4 scroll-mt-24" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Your scanners</h2>
                        <CenterAction title="Manage your scanners" subtitle="Add a single scanner SKU, edit your catalogue inline, or upload many at once.">
                            <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-add-scanner")))} data-testid="add-scanner-cta-btn"><Plus size={16} /> Add Scanner</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-bulk-scanner")))} data-testid="bulk-upload-scanner-btn"><Upload size={15} /> Bulk upload</Button>
                            <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => window.dispatchEvent(new CustomEvent("tc-open-edit-scanner")))} data-testid="edit-scanners-btn"><Layers size={15} /> Edit Scanners</Button>
                        </CenterAction>
                        <ScannerListings />
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
                            <h2 id="orders" className="text-[#0A0A0B] scroll-mt-[130px]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>Incoming orders</h2>
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
                                                                <div className="text-[10.5px] text-[#86868B]">Referral fee ({c.rateLabel}): −₹{c.commission.toLocaleString("en-IN")}</div>
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
                                                        <CourierDispatchInput onSubmit={(d) => updateOrder(o.id, "shipped", d)} testIdSuffix={o.id} />
                                                    )}
                                                    {o.status === "shipped" && (
                                                        <div className="space-y-1.5">
                                                            <div className="text-[10.5px] text-[#6E6E73]">
                                                                {o.courier_name && <div>Courier: <span className="text-[#0A0A0B] font-semibold">{o.courier_name}</span></div>}
                                                                <div className="font-mono text-[#0A0A0B]">Tracking: {o.tracking_number || "—"}</div>
                                                            </div>
                                                            <button onClick={() => updateOrder(o.id, "delivered")} className="text-[11px] px-2 py-1 rounded bg-teal-50 text-teal-700 border border-teal-200" data-testid={`mark-delivered-${o.id}`}>Mark Delivered</button>
                                                        </div>
                                                    )}
                                                    {o.status === "delivered" && (
                                                        <div className="text-[10.5px] text-[#6E6E73]">Awaiting customer confirmation…<div className="text-[#86868B]">Auto-confirms in 5 days</div></div>
                                                    )}
                                                    {o.status === "completed" && (
                                                        <div className="text-[10.5px] text-emerald-700 font-semibold">Completed{o.payout_eligible_at ? <div className="text-[#86868B] font-normal">Payout eligible {new Date(o.payout_eligible_at).toLocaleDateString("en-IN")}</div> : null}</div>
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
                                { label: "Toners", onClick: () => openBulkFor("toner"), tid: "bulk-hub-toners" },
                                { label: "Printers", onClick: () => openBulkFor("printer"), tid: "bulk-hub-printers" },
                                { label: "Papers", onClick: () => openBulkFor("paper"), tid: "bulk-hub-papers" },
                                { label: "Inks & Consumables", onClick: () => openBulkFor("consumable"), tid: "bulk-hub-consumables" },
                                { label: "Scanners", onClick: () => openBulkFor("scanner"), tid: "bulk-hub-scanners" },
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
                    <Button className="btn-cta h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => requestAddAction("single"))} data-testid="add-listing-btn"><Plus size={16} /> Add Toner</Button>
                    <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(() => requestAddAction("bulk"))} data-testid="bulk-upload-btn"><Upload size={15} /> Bulk upload</Button>
                    {listings.length > 0 && (
                        <Button variant="outline" className="h-12 px-6 text-[14px] inline-flex items-center gap-2" disabled={!isApproved} title={!isApproved ? lockReason : undefined} onClick={guardedClick(openEditBulk)} data-testid="edit-toners-btn"><Layers size={15} /> Edit toners</Button>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5" data-testid="supplier-toner-grid">
                    {visibleListings.map((l) => {
                        const typeStyle = l.toner_type === "Original"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : l.toner_type === "Compatible"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-amber-50 text-amber-700 border-amber-200";
                        // Wave 98 — entire card is clickable; navigates to the
                        // public product detail page (which itself shows an
                        // "Edit my listing" button for the owning dealer).
                        // The inline pencil/price/stock + Edit/Duplicate/Remove
                        // buttons stop propagation so they don't trigger the
                        // navigation.
                        const openDetail = () => navigate(`/toner/${l.id}`);
                        return (
                            <div key={l.id} onClick={openDetail} className="tc-product-card cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all" data-testid={`supplier-listing-${l.id}`}>
                                <div className="tc-product-img h-44">
                                    <span className="tc-product-img-label">{l.brand}</span>
                                    {l.image_url ? (
                                        <img src={l.image_url} alt="" className="w-full h-full object-contain" loading="lazy" />
                                    ) : (
                                        <TonerCartridge color={l.color || "Black"} brand={l.brand} model={l.model_number} type={l.toner_type} />
                                    )}
                                </div>
                                <div className="p-3.5 flex flex-col gap-2 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="text-[13px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>{l.brand}</div>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-[0.06em] shrink-0 ${typeStyle}`}>{l.toner_type}</span>
                                    </div>
                                    <div className="text-[11px] text-[#6E6E73] truncate" title={l.model_number}>{l.model_number || l.color || "—"}</div>
                                    <div className="mt-0.5 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                                        <div className="leading-tight">
                                            <div className="font-mono text-[14px] font-semibold text-[#0A0A0B]" data-testid={`listing-incl-price-${l.id}`}>{formatINR(inclGstPrice(l.price, l.gst_rate))}</div>
                                            <div className="text-[9px] text-[#86868B]">incl. {l.gst_rate ?? 18}% GST</div>
                                        </div>
                                        <InlineStock stock={l.stock} onSave={(v) => patchStock(l.id, v)} testId={`stock-edit-${l.id}`} />
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
                                        {/* Wave 105.2 — two-choice edit popover. Default is
                                          * "Edit this listing" (individual dialog, supports
                                          * photo upload). The bulk-grid path is preserved as
                                          * a secondary option for dealers who prefer editing
                                          * many rows at once. Compact, clean, spacious inside. */}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button className="text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`edit-${l.id}`}>
                                                    <Pencil size={10} /> Edit
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent align="start" className="w-64 p-2">
                                                <button
                                                    onClick={() => openEditToner(l)}
                                                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-[#F5F5F7] text-left"
                                                    data-testid={`edit-single-${l.id}`}>
                                                    <Pencil size={14} className="mt-0.5 text-[#0A0A0B]" />
                                                    <div className="min-w-0">
                                                        <div className="text-[13px] font-semibold text-[#0A0A0B]">Edit this listing</div>
                                                        <div className="text-[11px] text-[#6E6E73] mt-0.5">Add photos, tweak specs, change price</div>
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={openEditBulk}
                                                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-[#F5F5F7] text-left mt-1"
                                                    data-testid={`edit-bulk-${l.id}`}>
                                                    <Layers size={14} className="mt-0.5 text-[#0A0A0B]" />
                                                    <div className="min-w-0">
                                                        <div className="text-[13px] font-semibold text-[#0A0A0B]">Edit in bulk grid</div>
                                                        <div className="text-[11px] text-[#6E6E73] mt-0.5">Update many rows at once</div>
                                                    </div>
                                                </button>
                                            </PopoverContent>
                                        </Popover>
                                        <button onClick={() => duplicateListing(l.id)} className="text-[#0A0A0B] hover:text-[#00B7C7] inline-flex items-center gap-1" data-testid={`duplicate-${l.id}`}>
                                            <Copy size={10} /> Dup
                                        </button>
                                        <button onClick={() => removeListing(l.id)} className="text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`remove-${l.id}`}>
                                            <Trash2 size={10} /> Del
                                        </button>
                                    </div>
                                    <div onClick={(e) => e.stopPropagation()}>
                                        <D2DRow listing={l} endpoint={`/supplier/listings/${l.id}`} onChanged={load} />
                                    </div>
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

            {/* All Listings — combined view across every category, always visible */}
            <section id="all-listings" className="mt-10 scroll-mt-[130px]" data-testid="all-listings-section">
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div>
                        <h2 className="text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>All listings</h2>
                        <p className="text-[12.5px] text-[#6E6E73] mt-0.5">Every product across all categories in one place.</p>
                    </div>
                    {listingFilter === "active" && (
                        <button onClick={() => setListingFilter("all")} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0891B2] bg-[#ECFBFD] border border-[#C2EFF5] rounded-full px-3 py-1.5 hover:bg-[#D6F5F9]" data-testid="all-listings-filter-clear">
                            Showing active (in-stock) only · Clear
                        </button>
                    )}
                </div>
                {visibleAllProducts.length === 0 ? (
                    <div className="tc-card-flat p-10 text-center text-[#6E6E73]" data-testid="all-listings-empty">
                        {listingFilter === "active" ? "No active products — everything is out of stock." : "No products yet. Use the tabs above to add toners, printers, papers or consumables."}
                    </div>
                ) : (
                    <div className="tc-card-flat p-0 overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                <tr>
                                    <th className="text-left p-3">Product name</th>
                                    <th className="text-left p-3">Category</th>
                                    <th className="text-left p-3">Price (incl. GST)</th>
                                    <th className="text-left p-3">Stock</th>
                                    <th className="text-left p-3">Status</th>
                                    <th className="text-right p-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleAllProducts.map((p) => {
                                    const active = Number(p.stock) > 0;
                                    return (
                                        <tr key={`${p.kind}-${p.id}`} className="border-t border-black/[0.06]" data-testid={`all-row-${p.id}`}>
                                            <td className="p-3 font-medium text-[#0A0A0B] max-w-[280px] truncate">{p.name || "—"}</td>
                                            <td className="p-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${CAT_BADGE[p.cat] || ""}`}>{p.cat}</span></td>
                                            <td className="p-3" data-testid={`all-row-price-${p.id}`}>
                                                {p.price != null ? (
                                                    <div className="leading-tight">
                                                        <InlineEditCell
                                                            value={p.price}
                                                            displayValue={<span className="font-mono text-[#0A0A0B]">{formatINR(inclGstPrice(p.price, p.gst_rate))}</span>}
                                                            onSave={(v) => inlineUpdate(p, "price", v)}
                                                            min={1}
                                                            step="0.01"
                                                            ariaLabel="Edit price"
                                                            testid={`inline-price-${p.id}`}
                                                        />
                                                        <div className="text-[10px] text-[#86868B] mt-0.5">incl. {p.gst_rate ?? 18}% GST</div>
                                                    </div>
                                                ) : "—"}
                                            </td>
                                            <td className="p-3" data-testid={`all-row-stock-${p.id}`}>
                                                <InlineEditCell
                                                    value={p.stock ?? 0}
                                                    onSave={(v) => inlineUpdate(p, "stock", v)}
                                                    min={0}
                                                    step="1"
                                                    ariaLabel="Edit stock"
                                                    testid={`inline-stock-${p.id}`}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${active ? "text-emerald-600" : "text-[#9A9AA0]"}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-[#C8C8CD]"}`} /> {active ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center justify-end gap-3 flex-wrap">
                                                    <button onClick={() => viewAsBuyer(p)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0A0A0B] hover:text-[#00B7C7]" data-testid={`all-view-${p.id}`}><Eye size={12} /> View</button>
                                                    <button onClick={() => toggleStock(p)} className={`inline-flex items-center gap-1 text-[12px] font-semibold ${active ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`} data-testid={`all-stocktoggle-${p.id}`}>
                                                        {active ? "Mark out of stock" : "Mark in stock"}
                                                    </button>
                                                    <button onClick={() => editProduct(p)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0A0A0B] hover:text-[#00B7C7]" data-testid={`all-edit-${p.id}`}><Pencil size={12} /> Edit</button>
                                                    <button onClick={() => deleteProduct(p)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-600 hover:text-red-700" data-testid={`all-delete-${p.id}`}><Trash2 size={12} /> Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

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
                                    {TONER_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Toner model number</Label>
                                <TonerModelSearchSelect
                                    value={tonerModel}
                                    onChange={setTonerModel}
                                    onSelect={(model, printers) => {
                                        // Auto-populate "Suitable for" with the
                                        // cartridge's known printers. Dealer can
                                        // still add/remove from the populated list.
                                        if (model && Array.isArray(printers) && printers.length > 0) {
                                            setCompatibleModels(printers.join(", "));
                                        }
                                    }}
                                    brand={brand}
                                    testIdPrefix="listing-toner-model"
                                />
                                <div className="text-[11px] text-[#86868B] mt-1">Pick from the catalogue or type your own — we&apos;ll auto-fill compatible printers.</div>
                            </div>
                            <div className="sm:col-span-2">
                                <Label>Suitable for<span className="text-red-500"> *</span></Label>
                                <CompatibleModelsSelect
                                    mode="printers"
                                    value={compatibleModels}
                                    onChange={setCompatibleModels}
                                    onItemAdded={async (printerLabel, { isFirst }) => {
                                        // Wave 97 — bidirectional auto-suggest:
                                        // if the dealer adds the first printer
                                        // before picking a toner model, look up
                                        // the printer's native cartridge code
                                        // and offer to fill the model field.
                                        if (!isFirst || (tonerModel || "").trim()) return;
                                        try {
                                            const { data } = await api.get(
                                                `/compat/lookup-by-printer?model=${encodeURIComponent(printerLabel)}`
                                            );
                                            const t = Array.isArray(data?.toners) ? data.toners[0] : null;
                                            if (t) setTonerModel(t);
                                        } catch { /* silent — printer not in catalogue */ }
                                    }}
                                    brand={brand}
                                    testid="listing-compatible-models"
                                />
                                <div className="text-[11px] text-[#86868B] mt-1">This identifies your toner and is shown on the product card.</div>
                                <MissingModelLink category="toner" brand={brand} testidPrefix="toner-missing-model" />
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

                        {/* GST rate must be picked first so the incl./excl. conversion is accurate */}
                        <div className="mb-3">
                            <Label>GST rate (%) <span className="text-red-500">*</span></Label>
                            <select
                                value={gstRate}
                                onChange={(e) => setGstRate(Number(e.target.value))}
                                className="tc-input-lg w-full"
                                data-testid="listing-gst-rate"
                            >
                                {GST_RATES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                            </select>
                            <div className="text-[11px] text-[#86868B] mt-1">Set the correct GST rate first — the toggle below uses it to convert prices.</div>
                        </div>

                        {/* Wave 58 — plain-language base-price clarity box.
                            Repositioned to render directly ABOVE the price input
                            (was below) so dealers read it before they type a price. */}

                        {/* Small inline incl/excl GST pill toggle — must be picked, no default */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-[11.5px] font-semibold text-[#3a3a40]">Variant prices:</span>
                            <div className="inline-flex items-center gap-1.5" role="radiogroup" aria-label="Variant price type">
                                {[
                                    { id: "incl", label: "Incl. GST" },
                                    { id: "excl", label: "Excl. GST" },
                                ].map((opt) => {
                                    const sel = priceType === opt.id;
                                    const showErr = priceTypeError && !priceType;
                                    return (
                                        <button
                                            type="button"
                                            key={opt.id}
                                            role="radio"
                                            aria-checked={sel}
                                            onClick={() => { setPriceType(opt.id); setPriceTypeError(false); }}
                                            className={`h-7 px-3 text-[11.5px] font-semibold rounded-full transition ${sel ? "bg-[#0A0A0B] text-white shadow-sm" : showErr ? "bg-white text-red-600 border border-red-400 hover:bg-red-50" : "bg-white text-[#6E6E73] border border-black/[0.12] hover:bg-black/[0.04]"}`}
                                            data-testid={`listing-price-type-${opt.id}`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {priceTypeError && !priceType && (
                                <span className="text-[11.5px] text-red-600 w-full" data-testid="listing-price-type-error">
                                    Pick whether variant prices <strong>include</strong> or <strong>exclude</strong> GST.
                                </span>
                            )}
                        </div>

                        <div className="space-y-2" data-testid="variant-list">
                            {variants.map((v, i) => {
                                const typed = parseFloat(v.price || 0);
                                const buyerSees = priceType === "incl" ? Math.round(typed) : withGst(typed, gstRate);
                                return (
                                <div key={i} className="bg-[#FAFAFB] border border-black/[0.06] rounded-lg p-2" data-testid={`variant-row-${i}`}>
                                    <div className="grid grid-cols-12 gap-2 items-center">
                                        <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                                            <span className="inline-block w-5 h-5 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: colorSwatchHex(v.color) }} />
                                            <Input value={v.color} onChange={(e) => updateVariant(i, "color", e.target.value)} placeholder="Black / Cyan / Light Magenta…" className="tc-input-lg" data-testid={`variant-color-${i}`} />
                                        </div>
                                        <Input type="number" min="0" step="1" value={v.price} onChange={(e) => updateVariant(i, "price", e.target.value)} placeholder={priceType === "incl" ? "Final price ₹" : "Base price ₹"} className="tc-input-lg col-span-3 sm:col-span-3" data-testid={`variant-price-${i}`} />
                                        <Input type="number" min="0" step="1" value={v.stock} onChange={(e) => updateVariant(i, "stock", e.target.value)} placeholder="Stock" className="tc-input-lg col-span-3 sm:col-span-3" data-testid={`variant-stock-${i}`} />
                                        <button type="button" onClick={() => removeVariant(i)} className="col-span-1 sm:col-span-2 h-9 inline-flex items-center justify-center text-red-600 hover:bg-red-50 rounded-md" aria-label="Remove variant" data-testid={`variant-remove-${i}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {typed > 0 && priceType && (() => {
                                        const pb = payoutBreakdown(typed, priceType, gstRate);
                                        if (!pb) return null;
                                        return (
                                            <div className="mt-2 ml-0.5 rounded-md border border-black/[0.08] bg-white px-3 py-2 text-[11.5px] text-[#0A0A0B] leading-relaxed" data-testid={`variant-payout-breakdown-${i}`}>
                                                <div className="flex justify-between" data-testid={`variant-buyer-sees-${i}`}>
                                                    <span className="text-[#3a3a40]">Buyer pays (incl. GST):</span>
                                                    <span className="font-mono">{formatINR(buyerSees)}</span>
                                                </div>
                                                <div className="flex justify-between font-bold text-[#065F46] mt-1">
                                                    <span>You&rsquo;ll receive (per unit):</span>
                                                    <span className="font-mono">{formatINR(pb.basePrice - pb.commission)}</span>
                                                </div>
                                                <div className="text-[10.5px] text-[#6E6E73] mt-1 leading-snug">
                                                    GST {formatINR(pb.gstAmount)} ({gstRate}%) and delivery pass through to you in full.
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                );
                            })}
                            <button type="button" onClick={addVariant} className="inline-flex items-center gap-1.5 mt-1 text-[12.5px] text-[#00B7C7] hover:text-[#0096a3] font-semibold" data-testid="variant-add-btn">
                                <Plus size={13} /> Add colour
                            </button>
                        </div>

                        <div className="tc-form-section">Specifications</div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Page yield (sheets)<span className="text-red-500"> *</span></Label>
                                <Input type="number" min="1" step="1" value={pageYield} onChange={(e) => setPageYield(e.target.value)} placeholder="e.g. 2000" required className="tc-input-lg" data-testid="listing-page-yield" />
                            </div>
                            <div>
                                <Label>OEM part number</Label>
                                <Input value={oemPartNumber} onChange={(e) => setOemPartNumber(e.target.value)} placeholder="e.g. Q2612A" className="tc-input-lg" data-testid="listing-oem" />
                            </div>
                            <div>
                                <Label>Cartridge weight (g) <span className="text-[#86868B] font-normal">(optional)</span></Label>
                                <Input type="number" min="1" step="1" value={cartridgeWeight} onChange={(e) => setCartridgeWeight(e.target.value)} placeholder="e.g. 450" className="tc-input-lg" data-testid="listing-weight" />
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
                                    <option value="1 Year">1 Year</option>
                                    <option value="2 Years">2 Years</option>
                                    <option value="3 Years">3 Years</option>
                                    <option value="On-site">On-site</option>
                                    <option value="Carry-in">Carry-in</option>
                                    <option value="No Warranty">No Warranty</option>
                                    <option value="Other">Other</option>
                                </select>
                                {warranty === "Other" && (
                                    <Input value={warrantyOther} onChange={(e) => setWarrantyOther(e.target.value)} placeholder="Enter months (e.g. 18)" className="tc-input-lg mt-2" data-testid="listing-warranty-other" />
                                )}
                            </div>
                            <div className="col-span-2">
                                <DeliveryPolicyNote />
                            </div>
                        </div>

                        {/* Wave 68 — Product image upload on the toner single form
                            (animated cartridge graphic still shows on cards when
                            no image is uploaded). */}
                        <div className="mt-4">
                            <Label>Product images <span className="text-[#86868B] font-normal">(optional, up to 3 — 5&nbsp;MB each)</span></Label>
                            <div className="flex flex-wrap items-center gap-3 mt-1" data-testid="toner-images">
                                {/* Wave 105.3 — existing image thumbs (only shown in edit mode).
                                  * Dealer sees what's already stored on the listing and can
                                  * remove any before saving. Without this the edit form looked
                                  * empty and dealers couldn't tell if their new photo replaced
                                  * or added to the existing ones. */}
                                {existingImages.map((src, i) => (
                                    <div key={`existing-${i}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#E5E5EA]" data-testid={`toner-existing-image-${i}`}>
                                        <img src={src} alt={`existing ${i + 1}`} className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => setExistingImages(existingImages.filter((_, ii) => ii !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white" aria-label="Remove image" data-testid={`toner-existing-image-remove-${i}`}>
                                            <XIcon size={11} />
                                        </button>
                                    </div>
                                ))}
                                {imagePreviews.map((src, i) => (
                                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#E5E5EA]">
                                        <img src={src} alt={`preview ${i + 1}`} className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white" aria-label="Remove image" data-testid={`toner-image-remove-${i}`}>
                                            <XIcon size={11} />
                                        </button>
                                    </div>
                                ))}
                                {(existingImages.length + imageFiles.filter(Boolean).length) < 3 && (
                                    <label className="w-20 h-20 rounded-lg border-2 border-dashed border-[#00B7C7]/50 grid place-items-center cursor-pointer hover:border-[#00B7C7] text-[#00B7C7]" data-testid="toner-image-add">
                                        <ImageIcon size={20} />
                                        <input type="file" accept="image/*" multiple onChange={onPickFile} className="hidden" />
                                    </label>
                                )}
                            </div>
                            <div className="text-[11px] text-[#86868B] mt-1.5">Listings with photos get significantly more buyer attention. If left blank, we show an animated cartridge graphic on the card.</div>
                        </div>

                        <CompetitivePricingNote />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3" data-testid="toner-delivery-charges">
                            <div>
                                <Label>Intra-city delivery charge (₹)</Label>
                                <Input type="number" min="0" step="1" value={intracityCharge} onChange={(e) => setIntracityCharge(e.target.value)} className="tc-input-lg" data-testid="toner-intracity-charge" />
                                <div className="text-[11px] text-[#86868B] mt-1">Charged when buyer is in your city. Default ₹0.</div>
                            </div>
                            <div>
                                <Label>Inter-city delivery charge (₹)</Label>
                                <Input type="number" min="0" step="1" value={intercityCharge} onChange={(e) => setIntercityCharge(e.target.value)} className="tc-input-lg" data-testid="toner-intercity-charge" />
                                <div className="text-[11px] text-[#86868B] mt-1">Charged when buyer is in a different city. Default ₹100.</div>
                            </div>
                        </div>

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
            </div>
        </div>
    );
}
