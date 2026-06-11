import React from "react";
import { extractBrand } from "../lib/brands";

/**
 * Default toner product image — the static photo `/toner-placeholder.png`
 * (frontend/public) with a rectangular band overlaid across the middle showing
 * the toner's brand name in the brand's official colors (e.g. CANON on red,
 * HP on blue). Unknown brands fall back to red.
 *
 * Rendered as an SVG wrapper so the band + text scale proportionally at every
 * size it is used: listing cards, detail page, related cards, SEO pages.
 *
 * Props:
 *   brand: e.g. "HP", "Canon" — extracted to a clean brand name for the band
 */

// Official-ish brand colors for the label band.
const BRAND_BANDS = {
    Canon:   { band: "#CC0000", text: "#FFFFFF" },                       // red
    Xerox:   { band: "#D40000", text: "#FFFFFF" },                       // red
    HP:      { band: "#0096D6", text: "#FFFFFF" },                       // blue
    Brother: { band: "#0053A6", text: "#FFFFFF" },                       // blue
    Epson:   { band: "#003399", text: "#FFFFFF" },                       // dark blue
    Ricoh:   { band: "#E8491D", text: "#FFFFFF" },                       // red/orange
    Kyocera: { band: "#9B111E", text: "#FFFFFF" },                       // dark red
    Samsung: { band: "#1428A0", text: "#FFFFFF" },                       // blue
    "Konica Minolta": { band: "#FFFFFF", text: "#1C1C1E", border: "rgba(0,0,0,0.3)" }, // black on white
    Pantum:  { band: "#009A44", text: "#FFFFFF" },                       // green
    Riso:    { band: "#5F259F", text: "#FFFFFF" },                       // purple
    Sharp:   { band: "#F47920", text: "#FFFFFF" },                       // orange
};

// All other / unknown brands → default red.
const DEFAULT_BAND = { band: "#C8102E", text: "#FFFFFF" };

export default function TonerCartridge({ brand = "HP" }) {
    const cleanBrand = extractBrand(brand) || "Toner";
    const brandName = cleanBrand.toUpperCase();
    const colors = BRAND_BANDS[cleanBrand] || DEFAULT_BAND;

    return (
        <svg
            viewBox="0 0 296 144"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`${brandName} toner cartridge`}
            data-testid="toner-placeholder-image"
        >
            <image href="/toner-placeholder.png" x="0" y="0" width="296" height="144" preserveAspectRatio="xMidYMid meet" />

            {/* Brand band across the middle — official brand color */}
            <rect x="40" y="56" width="216" height="32" rx="3" fill={colors.band} stroke={colors.border || "none"} strokeWidth={colors.border ? 1.5 : 0} />
            {colors.band !== "#FFFFFF" && (
                <>
                    <rect x="40" y="56" width="216" height="1.5" fill="rgba(255,255,255,0.30)" />
                    <rect x="40" y="86.5" width="216" height="1.5" fill="rgba(0,0,0,0.18)" />
                </>
            )}
            <text
                x="148"
                y="79"
                fill={colors.text}
                fontSize={brandName.length > 9 ? 13 : 19}
                fontWeight="800"
                fontFamily="'Montserrat', 'Inter', sans-serif"
                letterSpacing="2"
                textAnchor="middle"
            >
                {brandName}
            </text>
        </svg>
    );
}
