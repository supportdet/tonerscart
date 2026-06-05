import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Boxes, Search, MapPin, ShoppingCart, Zap } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import PageMeta from "../components/PageMeta";
import VerifiedBadge from "../components/VerifiedBadge";
import { deliveryLabel } from "../lib/location";
import { CONSUMABLE_SUBCATEGORIES } from "../lib/consumableConstants";

const fmtMoney = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Map a consumable row into the generic cart-product shape so the existing
// Cart + Checkout flow works unchanged (kind="consumable" routes the order).
function toCartProduct(c) {
    return {
        id: c.id,
        kind: "consumable",
        brand: c.brand,
        model_number: c.model_number,
        color: c.subcategory,
        toner_type: "Consumable",
        price: Number(c.price || 0),
        stock: Number(c.stock || 0),
        image_url: c.image_url || "",
        supplier_id: c.supplier_id,
        supplier_name: c.supplier_name,
        city: c.supplier_city || c.city,
        gst_rate: c.gst_rate ?? 18,
        intercity_delivery_charge: c.intercity_delivery_charge ?? 0,
        subcategory: c.subcategory,
    };
}

export default function Consumables() {
    const { city: appCity } = useCity();
    const navigate = useNavigate();
    const { addItem } = useCart();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sub, setSub] = useState("all");
    const [brand, setBrand] = useState("");
    const [filterCity, setFilterCity] = useState(appCity || "");

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (sub && sub !== "all") params.subcategory = sub;
            if (brand) params.brand = brand;
            if (filterCity) params.city = filterCity;
            if (!filterCity && appCity) params.near_city = appCity;
            const { data } = await api.get("/consumables", { params });
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [sub]);

    const onAddToCart = (c) => {
        const prod = toCartProduct(c);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        toast.success(`${prod.brand} ${prod.model_number} added to cart`);
    };
    const onBuyNow = (c) => {
        const prod = toCartProduct(c);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        navigate("/checkout");
    };

    return (
        <div className="min-h-screen bg-[#F5F5F7]">
            <PageMeta
                title="Buy Printer Consumables Online India — TonersCart"
                description="Buy ink cartridges, drums, fusers, maintenance kits, staple cartridges and transfer belts from verified dealers across India. Compare prices and real stock."
                path="/consumables"
            />
            <div className="tc-container py-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">Buy Consumables</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                    Inks, drums, fusers &amp; kits from verified dealers
                </h1>

                {/* Subcategory tabs */}
                <div className="mt-6 flex flex-wrap gap-2" data-testid="consumables-subcat-tabs">
                    {[{ key: "all", label: "All" }, ...CONSUMABLE_SUBCATEGORIES.map((s) => ({ key: s, label: s }))].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setSub(t.key)}
                            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border transition ${sub === t.key ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]"}`}
                            data-testid={`consumables-tab-${t.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="sticky top-[64px] z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-3 mt-5 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-black/[0.04]" data-testid="consumables-sticky-wrapper">
                    <div className="flex flex-wrap gap-3 items-center bg-white border border-black/[0.06] rounded-xl p-3 shadow-sm">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand or model…" className="pl-9" data-testid="consumables-brand-input" />
                        </div>
                        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]" data-testid="consumables-city-select">
                            <option value="">All cities</option>
                            {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <Button onClick={load} className="btn-cta" data-testid="consumables-apply-btn">Apply</Button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-20 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading consumables…</div>
                ) : rows.length === 0 ? (
                    <div className="mt-10 bg-white border border-black/[0.06] rounded-2xl p-10 text-center" data-testid="consumables-empty">
                        <Boxes size={28} className="mx-auto text-[#86868B]" />
                        <div className="mt-3 text-[15px] font-semibold text-[#0A0A0B]">No consumable listings yet</div>
                        <div className="mt-1 text-[12.5px] text-[#6E6E73]">Verified dealers are onboarding. Check back soon or contact us for bulk needs.</div>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rows.map((c) => (
                            <ConsumableCard key={c.id} c={c} onAddToCart={onAddToCart} onBuyNow={onBuyNow} userCity={appCity} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function ConsumableCard({ c, onAddToCart, onBuyNow, userCity }) {
    const outOfStock = Number(c.stock || 0) <= 0;
    const loc = deliveryLabel(c.supplier_city || c.city, userCity);
    const subLabel = c.subcategory === "Other" && c.subcategory_other ? c.subcategory_other : c.subcategory;
    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl p-4 shadow-sm hover:border-black/[0.15] transition flex flex-col" data-testid={`consumable-card-${c.id}`}>
            <Link to={`/consumable/${c.id}`} className="block flex-1" data-testid={`consumable-link-${c.id}`}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">{c.brand}</div>
                        <div className="font-semibold text-[15px] text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>{c.model_number}</div>
                    </div>
                    <span className="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-md border bg-[#FFF8E0] text-[#8C6A00] border-[#F5E5A6] uppercase tracking-[0.06em] shrink-0">{subLabel}</span>
                </div>
                {c.compatible_models && (
                    <div className="mt-2 text-[11.5px] text-[#6E6E73] line-clamp-2">Fits: {c.compatible_models}</div>
                )}
                <div className="mt-3 flex items-center justify-between">
                    <div>
                        <div className="text-[10.5px] uppercase tracking-wider text-[#86868B]">Price</div>
                        <div className="font-mono text-[18px] font-semibold text-[#0A0A0B]">{fmtMoney(c.price)}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${outOfStock ? "text-red-700 bg-red-50 border border-red-200" : "text-emerald-700 bg-emerald-50 border border-emerald-200"}`}>
                        {outOfStock ? "Out of stock" : `${c.stock} in stock`}
                    </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6E6E73] gap-2">
                    <span className="inline-flex items-center gap-1 min-w-0">
                        <span className="truncate max-w-[120px]">{c.supplier_name}</span>
                        <VerifiedBadge compact />
                    </span>
                    {loc.text ? (
                        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`} data-testid={`consumable-delivery-${c.id}`}>
                            {loc.local ? "Local · Free delivery" : loc.text}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><MapPin size={11} /> {c.supplier_city || c.city || "—"}</span>
                    )}
                </div>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => onAddToCart(c)} disabled={outOfStock} className="h-10 rounded-xl border border-[#D2D2D7] bg-white text-[12.5px] font-semibold text-[#0A0A0B] hover:bg-black/[0.04] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" data-testid={`consumable-addcart-${c.id}`}>
                    <ShoppingCart size={13} /> Add to cart
                </button>
                <button onClick={() => onBuyNow(c)} disabled={outOfStock} className="h-10 rounded-xl bg-[#0A0A0B] text-white text-[12.5px] font-semibold hover:bg-[#1D1D1F] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" data-testid={`consumable-buy-${c.id}`}>
                    <Zap size={13} /> Buy now
                </button>
            </div>
        </div>
    );
}
