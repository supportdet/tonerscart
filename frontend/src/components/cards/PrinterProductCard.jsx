import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import VerifiedBadge from "../VerifiedBadge";
import ProductPlaceholder from "../ProductPlaceholder";
import { useCity } from "../../context/CityContext";
import { useCart } from "../../context/CartContext";
import { deliveryLabel } from "../../lib/location";

const LABELS = {
    home: "Home", corporate: "Corporate", commercial: "Commercial", print_shop: "Print Shop",
    inkjet: "Inkjet", laser: "Laser", tank: "Tank", thermal: "Thermal", production: "Production",
    digital_press: "Digital Press", label_barcode: "Label / Barcode", ink: "Ink", other: "Other",
    color: "Color", bw: "B&W", both: "Color + B&W",
    print_only: "Print only", print_scan: "Print + Scan", all_in_one: "All-in-one", high_volume: "High volume",
};
const fmt = (v) => LABELS[v] || v;

// Shared printer product card — used on /printers/results and /search universal printers.
export default function PrinterProductCard({ p }) {
    const navigate = useNavigate();
    const { addItem } = useCart();
    const { city: userCity } = useCity();
    const loc = deliveryLabel(p.city || p.supplier_city, userCity);
    // Printer rows from the API don't carry a `kind`; stamp it so checkout
    // applies the correct system-defined intercity delivery rate (printer, not toner).
    const prod = { ...p, kind: "printer" };
    const onAdd = (e) => {
        e.preventDefault(); e.stopPropagation();
        addItem(prod, 1);
        toast.success(`Added ${p.brand} ${p.model_number} to cart`);
    };
    const onBuyNow = (e) => {
        e.preventDefault(); e.stopPropagation();
        addItem(prod, 1);
        navigate("/checkout");
    };
    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden transition hover:shadow-xl group relative" data-testid={`printer-card-${p.id}`}>
            <Link to={`/printer/${p.id}`} className="block bg-white aspect-[4/3] grid place-items-center hover:opacity-95" data-testid={`printer-link-${p.id}`}>
                {p.image_url ? (
                    <img src={p.image_url} alt={`${p.brand} ${p.model_number}`} className="w-full h-full object-contain" loading="lazy" />
                ) : (
                    <div className="w-[88%]"><ProductPlaceholder kind="printer" brand={p.brand} /></div>
                )}
            </Link>
            <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] tracking-[0.14em] uppercase font-semibold px-2 py-0.5 rounded-full ${p.condition === "new" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {p.condition === "new" ? "Brand New" : "Refurbished"}
                    </span>
                    <span className="text-[10px] text-[#86868B]">{fmt(p.usage_type)} · {fmt(p.category)}</span>
                </div>
                <div className="font-mono text-[14px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.brand} · {p.model_number}
                </div>
                <div className="text-[12px] text-[#6E6E73] flex items-center gap-2 flex-wrap">
                    <span>{fmt(p.color)}</span>
                    {p.paper_sizes?.length > 0 && <span>· {p.paper_sizes.slice(0, 3).join(", ")}</span>}
                    {p.connectivity?.length > 0 && <span>· {p.connectivity.slice(0, 2).join(" / ")}</span>}
                </div>
                <div className="text-[11px] text-[#86868B] flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{p.supplier_name}{p.city ? ` · ${p.city}` : ""}</span>
                    <VerifiedBadge compact />
                </div>
                {loc.text && (
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border w-fit ${loc.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#F4F4F6] text-[#6E6E73] border-[#E5E5EA]"}`} data-testid={`printer-delivery-${p.id}`}>
                        {loc.local ? "Local · Free delivery" : loc.text}
                    </span>
                )}
                <div className="font-mono text-[18px] font-bold text-[#0A0A0B] mt-2">₹{Number(p.price).toLocaleString("en-IN")}</div>
                <div className="text-[10.5px] text-emerald-700 font-semibold">{p.stock} in stock</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button size="sm" variant="outline" className="text-[12px] h-9 gap-1.5" onClick={onAdd} data-testid={`printer-add-to-cart-${p.id}`}>
                        <ShoppingCart size={13} /> Add to cart
                    </Button>
                    <Button size="sm" className="btn-cta text-[12px] h-9" onClick={onBuyNow} data-testid={`printer-buy-now-${p.id}`}>
                        Buy now
                    </Button>
                </div>
            </div>
        </div>
    );
}
