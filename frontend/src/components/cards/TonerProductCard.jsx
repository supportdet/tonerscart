import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Plus, Minus, ShoppingCart } from "lucide-react";
import TonerCartridge from "../TonerCartridge";
import VerifiedBadge from "../VerifiedBadge";
import PriceInclGst from "../PriceInclGst";
import { colorSwatch } from "../../lib/colors";
import { deliveryLabel } from "../../lib/location";
import { extractBrand } from "../../lib/brands";

const variantColorFromName = (name) => {
    const v = colorSwatch(name);
    return v.startsWith("linear") ? "#C8C8CD" : v;
};

// Shared toner product card — used on /search (toner browse + universal toners).
export default function TonerProductCard({ p, qty, setQty, onBuy, onCart, userCity }) {
    const typeStyle = p.toner_type === "Original"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : p.toner_type === "Compatible"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200";
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const loc = deliveryLabel(p.city || p.supplier_city, userCity);
    return (
        <div className="tc-product-card group relative" data-testid={`product-card-${p.id}`}>
            <Link to={`/toner/${p.id}`} className="tc-product-img block hover:opacity-95 transition" data-testid={`product-link-${p.id}`}>
                <span className="tc-product-img-label">{extractBrand(p.brand)}</span>
                {p.image_url ? (
                    <img src={p.image_url} alt={`${p.brand} ${p.model_number}`} className="w-full h-full object-contain" loading="lazy" />
                ) : (
                    <TonerCartridge color={p.color || "Black"} brand={p.brand} model={p.model_number} type={p.toner_type || "Original"} />
                )}
            </Link>
            <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{extractBrand(p.brand)}</div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md border uppercase tracking-[0.08em] ${typeStyle}`}>
                        {p.toner_type || "Original"}
                    </span>
                </div>
                <Link to={`/toner/${p.id}`} className="text-[17px] font-bold leading-snug text-[#0A0A0B] tracking-tight hover:text-[#00B7C7] transition" data-testid={`product-title-${p.id}`}>{p.model_number || p.compatible_models}</Link>
                {p.compatible_models && (
                    <div
                        className="text-[12.5px] font-bold text-[#4A4A4F] leading-snug"
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                        data-testid={`product-compat-${p.id}`}
                    >
                        Suitable for: {p.compatible_models}
                    </div>
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                    <VerifiedBadge compact />
                </div>
                <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] text-[#6E6E73] flex items-center gap-1">
                        <MapPin size={11} /> {p.city}
                    </div>
                    {loc.text && (
                        <span
                            className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`}
                            data-testid={`delivery-label-${p.id}`}
                        >
                            {loc.local ? "Local · Free delivery" : loc.text}
                        </span>
                    )}
                </div>

                {variants.length > 0 && (
                    <div className="flex items-center gap-1.5" data-testid={`card-variants-${p.id}`}>
                        {variants.slice(0, 6).map((v) => (
                            <span
                                key={v.id}
                                title={v.color}
                                className="inline-block w-3.5 h-3.5 rounded-full border border-black/10"
                                style={{ backgroundColor: variantColorFromName(v.color) }}
                            />
                        ))}
                        <span className="text-[10.5px] text-[#86868B]">{variants.length} colour{variants.length === 1 ? "" : "s"}</span>
                    </div>
                )}

                <div className="mt-2 pt-3 border-t border-black/[0.05] flex items-end justify-between gap-2">
                    <PriceInclGst base={p.price} gstRate={p.gst_rate} size="md" testId={`product-price-${p.id}`} />
                    <div className="tc-qty" data-testid={`qty-${p.id}`}>
                        <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease"><Minus size={14} /></button>
                        <span data-testid={`qty-value-${p.id}`}>{qty}</span>
                        <button type="button" onClick={() => setQty(Math.min(p.stock, qty + 1))} disabled={qty >= p.stock} aria-label="Increase"><Plus size={14} /></button>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => onCart(p, qty)} className="btn-light text-[12.5px] py-2" data-testid={`add-to-cart-${p.id}`}>
                        <ShoppingCart size={13} className="inline mr-1" /> Add
                    </button>
                    <button onClick={() => onBuy(p, qty)} className="btn-cta text-[12.5px] py-2" disabled={p.stock <= 0} data-testid={`buy-now-${p.id}`}>
                        {p.stock > 0 ? "Buy" : "Out of stock"}
                    </button>
                </div>
            </div>
        </div>
    );
}
