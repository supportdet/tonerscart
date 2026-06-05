import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Package, Search, MapPin, ShoppingCart, Zap } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import PageMeta from "../components/PageMeta";
import VerifiedBadge from "../components/VerifiedBadge";
import { deliveryLabel } from "../lib/location";
import { formatApiError } from "../lib/api";

const SIZES = ["A4", "A3", "A5", "Letter"];
const GSMS = [70, 75, 80, 90, 100, 120];

const fmtMoney = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Wave 13 — papers are direct purchases (Add to cart / Buy now). Map the
// paper-listing row into a generic product shape so the existing Cart +
// Checkout flow works without any further plumbing.
function toCartProduct(p) {
    return {
        id: p.id,
        kind: "paper",
        brand: p.brand,
        model_number: `${p.size} · ${p.gsm} GSM`,
        color: "White",
        toner_type: "Paper",
        price: Number(p.price_per_ream || 0),       // per ream
        stock: Number(p.stock || 0),                 // in boxes
        image_url: p.image_url || "",
        supplier_id: p.supplier_id,
        supplier_name: p.supplier_name,
        city: p.supplier_city || p.city,
        gst_rate: p.gst_rate ?? 18,
        intercity_delivery_charge: p.intercity_delivery_charge ?? 0,
        // paper-specific extras retained for checkout / details
        size: p.size,
        gsm: p.gsm,
        reams_per_box: p.reams_per_box,
    };
}

export default function Papers() {
    const { city: appCity } = useCity();
    const navigate = useNavigate();
    const { addItem } = useCart();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        brand: "", size: "", gsm: "", city: appCity || "",
    });

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
            if (!params.city && appCity) params.near_city = appCity;
            const { data } = await api.get("/papers", { params });
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const onAddToCart = (p) => {
        const prod = toCartProduct(p);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        toast.success(`${prod.brand} · ${prod.size} added to cart`);
    };

    const onBuyNow = (p) => {
        const prod = toCartProduct(p);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        navigate("/checkout");
    };

    return (
        <div className="min-h-screen bg-[#F5F5F7]">
            <PageMeta
                title="Buy Printing Paper Online India — Verified Dealers | TonersCart"
                description="Buy A4, A3, A5 and Letter-size papers in bulk from verified suppliers across India. Compare GSM, price per ream and box from real stock."
                path="/papers"
            />
            <div className="tc-container py-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">Buy Papers</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                    A4 / A3 papers from verified suppliers
                </h1>

                <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 mt-6 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-black/[0.04]" data-testid="papers-sticky-wrapper">
                    <div className="flex flex-wrap gap-3 items-center bg-white border border-black/[0.06] rounded-xl p-3 shadow-sm">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                            <Input value={filters.brand} onChange={(e) => setFilters({ ...filters, brand: e.target.value })} placeholder="Brand…" className="pl-9" data-testid="papers-brand-input" />
                        </div>
                        <select value={filters.size} onChange={(e) => setFilters({ ...filters, size: e.target.value })} className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]" data-testid="papers-size-select">
                            <option value="">All sizes</option>
                            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={filters.gsm} onChange={(e) => setFilters({ ...filters, gsm: e.target.value })} className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]" data-testid="papers-gsm-select">
                            <option value="">All GSM</option>
                            {GSMS.map((g) => <option key={g} value={g}>{g} GSM</option>)}
                        </select>
                        <select value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]" data-testid="papers-city-select">
                            <option value="">All cities</option>
                            {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <Button onClick={load} className="btn-cta" data-testid="papers-apply-btn">Apply</Button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-20 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading papers…</div>
                ) : rows.length === 0 ? (
                    <div className="mt-10 bg-white border border-black/[0.06] rounded-2xl p-10 text-center" data-testid="papers-empty">
                        <Package size={28} className="mx-auto text-[#86868B]" />
                        <div className="mt-3 text-[15px] font-semibold text-[#0A0A0B]">No paper listings yet</div>
                        <div className="mt-1 text-[12.5px] text-[#6E6E73]">Suppliers are onboarding. Check back soon or contact us for bulk needs.</div>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rows.map((p) => (
                            <PaperCard key={p.id} p={p} onAddToCart={onAddToCart} onBuyNow={onBuyNow} userCity={appCity} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function PaperCard({ p, onAddToCart, onBuyNow, userCity }) {
    const pricePerBox = Number(p.price_per_ream) * Number(p.reams_per_box || 1);
    const outOfStock = Number(p.stock || 0) <= 0;
    const loc = deliveryLabel(p.supplier_city || p.city, userCity);
    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl p-4 shadow-sm hover:border-black/[0.15] transition flex flex-col" data-testid={`paper-card-${p.id}`}>
            <Link to={`/paper/${p.id}`} className="block flex-1" data-testid={`paper-link-${p.id}`}>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">{p.brand}</div>
                        <div className="font-semibold text-[15px] text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.size} · {p.gsm} GSM</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${outOfStock ? "text-red-700 bg-red-50 border border-red-200" : "text-emerald-700 bg-emerald-50 border border-emerald-200"}`}>
                        {outOfStock ? "Out of stock" : `${p.stock} boxes`}
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                    <div>
                        <div className="text-[10.5px] uppercase tracking-wider text-[#86868B]">Per ream</div>
                        <div className="font-mono font-semibold text-[#0A0A0B]">{fmtMoney(p.price_per_ream)}</div>
                    </div>
                    <div>
                        <div className="text-[10.5px] uppercase tracking-wider text-[#86868B]">Per box ({p.reams_per_box})</div>
                        <div className="font-mono font-semibold text-[#0A0A0B]">{fmtMoney(pricePerBox)}</div>
                    </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6E6E73] gap-2">
                    <span className="inline-flex items-center gap-1 min-w-0">
                        <span className="truncate max-w-[120px]">{p.supplier_name}</span>
                        <VerifiedBadge compact />
                    </span>
                    {loc.text ? (
                        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`} data-testid={`paper-delivery-${p.id}`}>
                            {loc.local ? "Local · Free delivery" : loc.text}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><MapPin size={11} /> {p.supplier_city || p.city || "—"}</span>
                    )}
                </div>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    onClick={() => onAddToCart(p)}
                    disabled={outOfStock}
                    className="h-10 rounded-xl border border-[#D2D2D7] bg-white text-[12.5px] font-semibold text-[#0A0A0B] hover:bg-black/[0.04] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid={`paper-addcart-${p.id}`}
                >
                    <ShoppingCart size={13} /> Add to cart
                </button>
                <button
                    onClick={() => onBuyNow(p)}
                    disabled={outOfStock}
                    className="h-10 rounded-xl bg-[#0A0A0B] text-white text-[12.5px] font-semibold hover:bg-[#1D1D1F] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid={`paper-buy-${p.id}`}
                >
                    <Zap size={13} /> Buy now
                </button>
            </div>
        </div>
    );
}
