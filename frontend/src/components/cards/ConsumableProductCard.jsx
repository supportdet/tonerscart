import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { MapPin, ShoppingCart, Zap } from "lucide-react";
import { toast } from "sonner";
import VerifiedBadge from "../VerifiedBadge";
import ProductPlaceholder from "../ProductPlaceholder";
import { useCity } from "../../context/CityContext";
import { useCart } from "../../context/CartContext";
import { deliveryLabel } from "../../lib/location";
import PriceInclGst from "../PriceInclGst";

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

// Shared consumable product card — used on /consumables and /search universal consumables.
export default function ConsumableProductCard({ c }) {
    const navigate = useNavigate();
    const { addItem } = useCart();
    const { city: userCity } = useCity();
    const outOfStock = Number(c.stock || 0) <= 0;
    const loc = deliveryLabel(c.supplier_city || c.city, userCity);
    const subLabel = c.subcategory === "Other" && c.subcategory_other ? c.subcategory_other : c.subcategory;

    const onAddToCart = () => {
        const prod = toCartProduct(c);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        toast.success(`${prod.brand} ${prod.model_number} added to cart`);
    };
    const onBuyNow = () => {
        const prod = toCartProduct(c);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        navigate("/checkout");
    };

    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl p-4 shadow-sm hover:border-black/[0.15] transition flex flex-col" data-testid={`consumable-card-${c.id}`}>
            <Link to={`/consumable/${c.id}`} className="block flex-1" data-testid={`consumable-link-${c.id}`}>
                <div className="aspect-[2.05/1] rounded-xl overflow-hidden border border-black/[0.05] bg-white mb-3 grid place-items-center" data-testid={`consumable-img-${c.id}`}>
                    {c.image_url ? (
                        <img src={c.image_url} alt={`${c.brand} ${c.model_number}`} className="w-full h-full object-contain" loading="lazy" />
                    ) : (
                        <ProductPlaceholder kind="consumable" brand={c.brand} />
                    )}
                </div>
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
                    <PriceInclGst base={c.price} gstRate={c.gst_rate} size="md" testId={`consumable-price-${c.id}`} />
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${outOfStock ? "text-red-700 bg-red-50 border border-red-200" : "text-emerald-700 bg-emerald-50 border border-emerald-200"}`}>
                        {outOfStock ? "Out of stock" : `${c.stock} in stock`}
                    </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6E6E73] gap-2">
                    <span className="inline-flex items-center gap-1 min-w-0">
                        <MapPin size={11} />
                        <span className="truncate">{c.supplier_city || c.city || "—"}</span>
                        <VerifiedBadge compact />
                    </span>
                    {loc.text && (
                        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`} data-testid={`consumable-delivery-${c.id}`}>
                            {loc.local ? "Local · Free delivery" : loc.text}
                        </span>
                    )}
                </div>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={onAddToCart} disabled={outOfStock} className="h-10 rounded-xl border border-[#D2D2D7] bg-white text-[12.5px] font-semibold text-[#0A0A0B] hover:bg-black/[0.04] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" data-testid={`consumable-addcart-${c.id}`}>
                    <ShoppingCart size={13} /> Add to cart
                </button>
                <button onClick={onBuyNow} disabled={outOfStock} className="h-10 rounded-xl bg-[#0A0A0B] text-white text-[12.5px] font-semibold hover:bg-[#1D1D1F] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" data-testid={`consumable-buy-${c.id}`}>
                    <Zap size={13} /> Buy now
                </button>
            </div>
        </div>
    );
}
