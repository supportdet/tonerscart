import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** A verified-dealer listing card used on the compatible/toner SEO pages. */
export default function CompatListingCard({ l }) {
    return (
        <Link to={l.url} className="tc-product-card p-4 block hover:shadow-lg transition-shadow" data-testid={`compatible-listing-${l.id}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">{l.brand}</div>
                    <div className="text-[15px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>{l.model_number}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 uppercase shrink-0">
                    <ShieldCheck size={11} /> Verified
                </span>
            </div>
            {l.compatible_models && <div className="mt-2 text-[11.5px] text-[#6E6E73] line-clamp-2">Suitable for: {l.compatible_models}</div>}
            <div className="mt-3 flex items-center justify-between">
                <PriceInclGst base={l.price} gstRate={l.gst_rate} size="sm" testId={`compat-price-${l.id}`} />
                <span className="text-[12px] text-[#00B7C7] font-semibold inline-flex items-center gap-1">View <ArrowRight size={13} /></span>
            </div>
            <div className="text-[11.5px] text-[#86868B] mt-1">{l.stock} in stock · {l.condition || "New"}</div>
        </Link>
    );
}
