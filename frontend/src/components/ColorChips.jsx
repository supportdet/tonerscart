import React from "react";
import { TONER_COLORS } from "../lib/listingConstants";
import { colorSwatch } from "../lib/colors";

// Tri-color chip uses a CMY gradient swatch.
const TRI_COLOR_BG = "linear-gradient(90deg,#00B7C7 0%,#00B7C7 33%,#E6007E 33%,#E6007E 66%,#F5C400 66%,#F5C400 100%)";

const swatchFor = (name) => {
    if (name === "Tri-color") return TRI_COLOR_BG;
    const v = colorSwatch(name);
    return v && v !== "" ? v : "#1C1C1E";
};

/**
 * Multi-select colour filter chips. Used alongside <BrandChips/> on toner
 * and consumable category pages. `value` is an array; clicking a chip toggles
 * it. The "All" chip clears the selection.
 */
export default function ColorChips({ value, onChange, testidPrefix = "color-chip" }) {
    const selected = Array.isArray(value) ? value : (value ? [value] : []);
    const isAllActive = selected.length === 0;
    const toggle = (col) => {
        if (!col) { onChange([]); return; }
        const next = selected.includes(col) ? selected.filter((c) => c !== col) : [...selected, col];
        onChange(next);
    };
    const chips = [{ name: "All", val: "" }, ...TONER_COLORS.map((c) => ({ name: c, val: c }))];
    return (
        <div className="mt-3 flex flex-wrap gap-2" data-testid={`${testidPrefix}-row`}>
            {chips.map((c) => {
                const active = c.val ? selected.includes(c.val) : isAllActive;
                const swatch = c.val ? swatchFor(c.val) : "#0A0A0B";
                const isLight = c.val === "Yellow";
                const baseStyle = active
                    ? (c.val === "Tri-color"
                        ? { background: TRI_COLOR_BG, color: "#FFFFFF", borderColor: "#1C1C1E" }
                        : { background: swatch, color: isLight ? "#0A0A0B" : "#FFFFFF", borderColor: swatch })
                    : { background: "#FFFFFF", color: "#1D1D1F", borderColor: "#D2D2D7" };
                return (
                    <button
                        key={c.name}
                        onClick={() => toggle(c.val)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition hover:opacity-90"
                        style={baseStyle}
                        aria-pressed={active}
                        data-testid={`${testidPrefix}-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                        {c.val && (
                            <span
                                className="inline-block w-3 h-3 rounded-full border border-black/15"
                                style={{ background: swatch }}
                                aria-hidden
                            />
                        )}
                        {c.name}
                    </button>
                );
            })}
        </div>
    );
}
