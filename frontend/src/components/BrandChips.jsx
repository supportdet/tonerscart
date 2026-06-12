import React, { useState } from "react";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { TONER_BRANDS, BRAND_BANDS, DEFAULT_BAND } from "../lib/brands";

/**
 * Collapsible multi-select brand filter chip row.
 *
 * Collapsed (default): a single thin button showing the filter label and the
 * count of active brands. Expanded: full chip row with "All" + every brand.
 * Brands persist their colour treatment when active.
 */
export default function BrandChips({ value, onChange, testidPrefix = "brand-chip" }) {
    const selected = Array.isArray(value) ? value : (value ? [value] : []);
    const [open, setOpen] = useState(false);
    const isAllActive = selected.length === 0;

    const toggle = (brand) => {
        if (!brand) { onChange([]); return; }
        const next = selected.includes(brand)
            ? selected.filter((b) => b !== brand)
            : [...selected, brand];
        onChange(next);
    };

    const summary = isAllActive
        ? "All brands"
        : selected.length <= 2
        ? selected.join(" · ")
        : `${selected.slice(0, 2).join(" · ")} +${selected.length - 2}`;

    const chips = [{ name: "All", val: "" }, ...TONER_BRANDS.map((b) => ({ name: b, val: b }))];

    return (
        <div className="mt-4" data-testid={`${testidPrefix}-wrapper`}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#D2D2D7] bg-white text-[12.5px] font-semibold text-[#1D1D1F] hover:bg-black/[0.04] transition"
                aria-expanded={open}
                data-testid={`${testidPrefix}-toggle`}
            >
                <Filter size={13} className="text-[#6E6E73]" />
                Brand
                <span className={`text-[11px] font-medium ${isAllActive ? "text-[#86868B]" : "text-[#0A0A0B]"}`}>· {summary}</span>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {open && (
                <div className="mt-3 flex flex-wrap gap-2" data-testid={`${testidPrefix}-row`}>
                    {chips.map((c) => {
                        const colors = c.val ? (BRAND_BANDS[c.val] || DEFAULT_BAND) : { band: "#0A0A0B", text: "#FFFFFF" };
                        const whiteBand = colors.band === "#FFFFFF";
                        const accent = whiteBand ? "#1C1C1E" : colors.band;
                        const active = c.val ? selected.includes(c.val) : isAllActive;
                        const style = active
                            ? { background: accent, color: "#FFFFFF", borderColor: accent }
                            : { background: "#FFFFFF", color: accent, borderColor: accent };
                        return (
                            <button
                                key={c.name}
                                onClick={() => toggle(c.val)}
                                className="px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition hover:opacity-80"
                                style={style}
                                aria-pressed={active}
                                data-testid={`${testidPrefix}-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                            >
                                {c.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
