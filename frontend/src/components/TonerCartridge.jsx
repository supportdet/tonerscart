import React from "react";
import { extractBrand, BRAND_BANDS, DEFAULT_BAND } from "../lib/brands";

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
