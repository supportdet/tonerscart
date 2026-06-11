import React from "react";
import { TONER_BRANDS, BRAND_BANDS, DEFAULT_BAND } from "../lib/brands";

/**
 * Clickable brand filter chips shown above category listings (toners,
 * printers, consumables, scanners). Each chip uses the brand's official
 * color; selected chips are filled. Multi-select: clicking a selected chip
 * deselects it, multiple brands can be active simultaneously. "All" resets.
 *
 * Props:
 *   value: array of currently selected brand names ([] = all). Strings are
 *          accepted for backward compat ("" treated as []).
 *   onChange(arr): receives the next array of selected brands ([] = all).
 */
export default function BrandChips({ value, onChange, testidPrefix = "brand-chip" }) {
    const selected = Array.isArray(value) ? value : (value ? [value] : []);
    const isAllActive = selected.length === 0;
    const toggle = (brand) => {
        if (!brand) { onChange([]); return; }
        const next = selected.includes(brand)
            ? selected.filter((b) => b !== brand)
            : [...selected, brand];
        onChange(next);
    };
    const chips = [{ name: "All", val: "" }, ...TONER_BRANDS.map((b) => ({ name: b, val: b }))];
    return (
        <div className="mt-4 flex flex-wrap gap-2" data-testid={`${testidPrefix}-row`}>
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
    );
}
