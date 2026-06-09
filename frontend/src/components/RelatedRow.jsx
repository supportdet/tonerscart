import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Printer as PrinterIcon } from "lucide-react";
import TonerCartridge from "./TonerCartridge";

const TYPE_BADGE = {
    toner: "bg-slate-100 text-slate-700 border-slate-200",
    ink: "bg-blue-50 text-blue-700 border-blue-200",
    drum: "bg-amber-50 text-amber-700 border-amber-200",
    ribbon: "bg-purple-50 text-purple-700 border-purple-200",
};

/**
 * Horizontal, scrollable row of rich compatibility-DB suggestion cards (max 6).
 * `kind="toner"` items: { brand, model, type, url, printers_count }
 * `kind="printer"` items: { brand, full_name, type, url, toners_count }
 */
export default function RelatedRow({ label, items, kind = "toner", testid }) {
    if (!items || items.length === 0) return null;
    return (
        <div className="space-y-3" data-testid={testid}>
            <h3 className="text-[14px] font-semibold text-[#0A0A0B]">{label}</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
                {items.slice(0, 6).map((it) => {
                    const title = kind === "printer" ? it.full_name : it.model;
                    const type = (it.type || (kind === "printer" ? "printer" : "toner")).toLowerCase();
                    const badge = TYPE_BADGE[type] || "bg-slate-100 text-slate-700 border-slate-200";
                    const subtitle = kind === "printer"
                        ? `${it.toners_count || 0} compatible cartridge${(it.toners_count || 0) === 1 ? "" : "s"}`
                        : `Compatible with ${it.printers_count || 0} printer${(it.printers_count || 0) === 1 ? "" : "s"}`;
                    return (
                        <div key={it.url} className="shrink-0 w-[212px] tc-product-card overflow-hidden flex flex-col" data-testid="related-card">
                            <Link to={it.url} className="tc-product-img block relative" style={{ height: 120 }}>
                                <span className="tc-product-img-label">{it.brand}</span>
                                {kind === "printer"
                                    ? <div className="w-full h-full grid place-items-center"><PrinterIcon size={40} className="text-[#C7C7CC]" /></div>
                                    : <TonerCartridge color="Black" brand={it.brand} />}
                            </Link>
                            <div className="p-3 flex flex-col gap-1.5 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[#86868B] truncate">{it.brand}</span>
                                    <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-[0.06em] ${badge}`}>{type}</span>
                                </div>
                                <Link to={it.url} className="text-[14px] font-bold text-[#0A0A0B] leading-snug line-clamp-2 min-h-[36px] hover:text-[#00B7C7] transition" style={{ fontFamily: "'Montserrat', sans-serif" }}>{title}</Link>
                                <div className="text-[11px] text-[#6E6E73]">{subtitle}</div>
                                <Link to={it.url} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#00B7C7]" data-testid="related-view-btn">View <ArrowRight size={12} /></Link>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
