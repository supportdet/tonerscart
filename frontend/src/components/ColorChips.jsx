import React, { useState } from "react";
import { ChevronDown, ChevronUp, Palette } from "lucide-react";
import { TONER_COLORS } from "../lib/listingConstants";
import { colorSwatch } from "../lib/colors";

const TRI_COLOR_BG = "linear-gradient(90deg,#00B7C7 0%,#00B7C7 33%,#E6007E 33%,#E6007E 66%,#F5C400 66%,#F5C400 100%)";

const swatchFor = (name) => {
    if (name === "Tri-color") return TRI_COLOR_BG;
    const v = colorSwatch(name);
    return v && v !== "" ? v : "#1C1C1E";
};

/**
 * Collapsible multi-select colour filter chip row. Mirrors `BrandChips`.
 * Collapsed: single button with "Colour · {summary}" and chevron.
 * Expanded: All · Black · Cyan · Magenta · Yellow · Tri-color chips with
 * brand-coloured swatch dots.
 */
export default function ColorChips({ value, onChange, testidPrefix = "color-chip" }) {
    const selected = Array.isArray(value) ? value : (value ? [value] : []);
    const [open, setOpen] = useState(false);
    const isAllActive = selected.length === 0;

    const toggle = (col) => {
        if (!col) { onChange([]); return; }
        const next = selected.includes(col) ? selected.filter((c) => c !== col) : [...selected, col];
        onChange(next);
    };

    const summary = isAllActive
        ? "All colours"
        : selected.length <= 2
        ? selected.join(" · ")
        : `${selected.slice(0, 2).join(" · ")} +${selected.length - 2}`;

    const chips = [{ name: "All", val: "" }, ...TONER_COLORS.map((c) => ({ name: c, val: c }))];

    return (
        <div className="mt-3" data-testid={`${testidPrefix}-wrapper`}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#D2D2D7] bg-white text-[12.5px] font-semibold text-[#1D1D1F] hover:bg-black/[0.04] transition"
                aria-expanded={open}
                data-testid={`${testidPrefix}-toggle`}
            >
                <Palette size={13} className="text-[#6E6E73]" />
                Colour
                <span className={`text-[11px] font-medium ${isAllActive ? "text-[#86868B]" : "text-[#0A0A0B]"}`}>· {summary}</span>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {open && (
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
            )}
        </div>
    );
}
