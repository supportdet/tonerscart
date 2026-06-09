import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Printer, Package } from "lucide-react";

/**
 * Horizontal, scrollable row of compatibility-DB suggestion cards (max 6).
 * `items` are normalised to { brand, title, subtitle, url }.
 */
export default function RelatedRow({ label, items, kind = "printer", testid }) {
    if (!items || items.length === 0) return null;
    const Icon = kind === "printer" ? Printer : Package;
    return (
        <div className="space-y-3" data-testid={testid}>
            <h3 className="text-[14px] font-semibold text-[#0A0A0B]">{label}</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
                {items.slice(0, 6).map((it) => (
                    <Link
                        to={it.url}
                        key={it.url}
                        className="shrink-0 w-[210px] bg-white border border-[#E5E5EA] rounded-xl p-3.5 hover:shadow-md hover:border-[#00B7C7]/50 transition"
                        data-testid="related-card"
                    >
                        <div className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">
                            <Icon size={12} /> {it.brand}
                        </div>
                        <div className="mt-1.5 text-[14px] font-semibold text-[#0A0A0B] leading-snug line-clamp-2 min-h-[36px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                            {it.title}
                        </div>
                        {it.subtitle && <div className="mt-1 text-[11px] text-[#6E6E73] uppercase tracking-[0.06em]">{it.subtitle}</div>}
                        <div className="mt-2 text-[12px] text-[#00B7C7] font-semibold inline-flex items-center gap-1">View <ArrowRight size={12} /></div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
