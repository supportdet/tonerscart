import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { MapPin, ShoppingCart, Zap } from "lucide-react";
import { toast } from "sonner";
import VerifiedBadge from "../VerifiedBadge";
import PriceInclGst from "../PriceInclGst";
import { useCity } from "../../context/CityContext";
import { useCart } from "../../context/CartContext";
import { deliveryLabel } from "../../lib/location";

const fmtMoney = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Map a paper-listing row into the generic cart-product shape so the existing
// Cart + Checkout flow works unchanged.
function toCartProduct(p) {
    return {
        id: p.id,
        kind: "paper",
        brand: p.brand,
        model_number: `${p.size} · ${p.gsm} GSM`,
        color: "White",
        toner_type: "Paper",
        price: Number(p.price_per_ream || 0),
        stock: Number(p.stock || 0),
        image_url: p.image_url || "",
        supplier_id: p.supplier_id,
        supplier_name: p.supplier_name,
        city: p.supplier_city || p.city,
        gst_rate: p.gst_rate ?? 18,
        intercity_delivery_charge: p.intercity_delivery_charge ?? 0,
        size: p.size,
        gsm: p.gsm,
        reams_per_box: p.reams_per_box,
    };
}

// Shared paper product card — used on /papers and /search universal papers.
export default function PaperProductCard({ p }) {
    const navigate = useNavigate();
    const { addItem } = useCart();
    const { city: userCity } = useCity();
    const pricePerBox = Number(p.price_per_ream) * Number(p.reams_per_box || 1);
    const outOfStock = Number(p.stock || 0) <= 0;
    const loc = deliveryLabel(p.supplier_city || p.city, userCity);

    const onAddToCart = () => {
        const prod = toCartProduct(p);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        toast.success(`${prod.brand} · ${prod.size} added to cart`);
    };
    const onBuyNow = () => {
        const prod = toCartProduct(p);
        if (prod.stock <= 0) { toast.error("Out of stock"); return; }
        addItem(prod, 1);
        navigate("/checkout");
    };

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
                        <PriceInclGst base={p.price_per_ream} gstRate={p.gst_rate} size="sm" tag={false} testId={`paper-price-ream-${p.id}`} />
                    </div>
                    <div>
                        <div className="text-[10.5px] uppercase tracking-wider text-[#86868B]">Per box ({p.reams_per_box})</div>
                        <PriceInclGst base={pricePerBox} gstRate={p.gst_rate} size="sm" tag={false} testId={`paper-price-box-${p.id}`} />
                    </div>
                </div>
                <div className="text-[9.5px] font-medium tracking-[0.05em] text-[#86868B] mt-1 uppercase">Price incl. GST</div>
                <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6E6E73] gap-2">
                    <span className="inline-flex items-center gap-1 min-w-0">
                        <MapPin size={11} />
                        <span className="truncate">{p.supplier_city || p.city || "—"}</span>
                        <VerifiedBadge compact />
                    </span>
                    {loc.text && (
                        <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`} data-testid={`paper-delivery-${p.id}`}>
                            {loc.local ? "Local · Free delivery" : loc.text}
                        </span>
                    )}
                </div>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    onClick={onAddToCart}
                    disabled={outOfStock}
                    className="h-10 rounded-xl border border-[#D2D2D7] bg-white text-[12.5px] font-semibold text-[#0A0A0B] hover:bg-black/[0.04] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid={`paper-addcart-${p.id}`}
                >
                    <ShoppingCart size={13} /> Add to cart
                </button>
                <button
                    onClick={onBuyNow}
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
