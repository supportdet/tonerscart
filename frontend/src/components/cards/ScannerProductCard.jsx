import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { MapPin, ShoppingCart, Zap, ScanLine } from "lucide-react";
import { toast } from "sonner";
import VerifiedBadge from "../VerifiedBadge";
import ProductPlaceholder from "../ProductPlaceholder";
import PriceInclGst from "../PriceInclGst";
import { useCity } from "../../context/CityContext";
import { useCart } from "../../context/CartContext";
import { deliveryLabel } from "../../lib/location";

const fmtMoney = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Map a scanner row into the generic cart-product shape so the existing
// Cart + Checkout flow works unchanged (kind="scanner" routes the order).
function toCartProduct(s) {
    return {
        id: s.id,
        kind: "scanner",
        brand: s.brand,
        model_number: s.model_number,
        color: s.scanner_type,
        toner_type: "Scanner",
        price: Number(s.price || 0),
        stock: Number(s.stock || 0),
        image_url: s.image_url || "",
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        city: s.supplier_city || s.city,
        gst_rate: s.gst_rate ?? 18,
        intercity_delivery_charge: s.intercity_delivery_charge ?? 0,
    };
}

// Shared scanner product card — used on /scanners and /search universal scanners.
export default function ScannerProductCard({ s }) {
    const navigate = useNavigate();
    const { addItem } = useCart();
    const { city: userCity } = useCity();
    const outOfStock = Number(s.stock || 0) <= 0;
    const loc = deliveryLabel(s.supplier_city || s.city, userCity);

    const onAddToCart = () => {
        const prod = toCartProduct(s);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        toast.success(`${prod.brand} ${prod.model_number} added to cart`);
    };
    const onBuyNow = () => {
        const prod = toCartProduct(s);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        navigate("/checkout");
    };

    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl p-4 shadow-sm hover:border-black/[0.15] transition flex flex-col" data-testid={`scanner-card-${s.id}`}>
            <Link to={`/scanner/${s.id}`} className="block flex-1" data-testid={`scanner-link-${s.id}`}>
                <div className="aspect-[2.05/1] rounded-xl overflow-hidden border border-black/[0.05] bg-white mb-3 grid place-items-center" data-testid={`scanner-img-${s.id}`}>
                    {s.image_url ? (
                        <img src={s.image_url} alt={`${s.brand} ${s.model_number}`} className="w-full h-full object-contain" loading="lazy" />
                    ) : (
                        <ProductPlaceholder kind="scanner" brand={s.brand} />
                    )}
                </div>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">{s.brand}</div>
                        <div className="font-semibold text-[15px] text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>{s.model_number}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border bg-[#EAF6FF] text-[#0369A1] border-[#BFE3FB] uppercase tracking-[0.06em] shrink-0">
                        <ScanLine size={11} /> {s.scanner_type}
                    </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-[#6E6E73]">
                    {s.scan_resolution && <span className="px-2 py-0.5 rounded-full bg-[#F4F4F6] border border-[#E5E5EA]">{s.scan_resolution}</span>}
                    {s.scan_speed_ppm ? <span className="px-2 py-0.5 rounded-full bg-[#F4F4F6] border border-[#E5E5EA]">{s.scan_speed_ppm} ppm</span> : null}
                    {s.color_mode && <span className="px-2 py-0.5 rounded-full bg-[#F4F4F6] border border-[#E5E5EA]">{s.color_mode}</span>}
                    {Array.isArray(s.connectivity) && s.connectivity.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-[#F4F4F6] border border-[#E5E5EA]">{s.connectivity.join(" · ")}</span>
                    )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                    <PriceInclGst base={s.price} gstRate={s.gst_rate} size="md" testId={`scanner-price-${s.id}`} />
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${outOfStock ? "text-red-700 bg-red-50 border border-red-200" : "text-emerald-700 bg-emerald-50 border border-emerald-200"}`}>
                        {outOfStock ? "Out of stock" : `${s.stock} in stock`}
                    </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6E6E73] gap-2">
                    <span className="inline-flex items-center gap-1 min-w-0">
                        <span className="truncate max-w-[120px]">{s.supplier_name}</span>
                        <VerifiedBadge compact />
                    </span>
                    {loc.text ? (
                        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`} data-testid={`scanner-delivery-${s.id}`}>
                            {loc.local ? "Local · Free delivery" : loc.text}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><MapPin size={11} /> {s.supplier_city || s.city || "—"}</span>
                    )}
                </div>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={onAddToCart} disabled={outOfStock} className="h-10 rounded-xl border border-[#D2D2D7] bg-white text-[12.5px] font-semibold text-[#0A0A0B] hover:bg-black/[0.04] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" data-testid={`scanner-addcart-${s.id}`}>
                    <ShoppingCart size={13} /> Add to cart
                </button>
                <button onClick={onBuyNow} disabled={outOfStock} className="h-10 rounded-xl bg-[#0A0A0B] text-white text-[12.5px] font-semibold hover:bg-[#1D1D1F] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" data-testid={`scanner-buy-${s.id}`}>
                    <Zap size={13} /> Buy now
                </button>
            </div>
        </div>
    );
}
