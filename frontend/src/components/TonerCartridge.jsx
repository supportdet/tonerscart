import React from "react";
import { extractBrand } from "../lib/brands";

/**
 * Default toner product image — the static photo `/toner-placeholder.png`
 * (frontend/public) with a red rectangular band overlaid across the middle,
 * showing the toner's brand name in white bold text (e.g. CANON, HP, XEROX).
 *
 * Rendered as an SVG wrapper so the band + text scale proportionally at every
 * size it is used: listing cards, detail page, related cards, SEO pages.
 *
 * Props:
 *   brand: e.g. "HP", "Canon" — extracted to a clean brand name for the band
 */

const BAND_RED = "#C8102E";

export default function TonerCartridge({ brand = "HP" }) {
    const brandName = (extractBrand(brand) || "Toner").toUpperCase();

    return (
        <svg
            viewBox="0 0 296 144"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`${brandName} toner cartridge`}
            data-testid="toner-placeholder-image"
        >
            <image href="/toner-placeholder.png" x="0" y="0" width="296" height="144" preserveAspectRatio="xMidYMid meet" />

            {/* Red brand band across the middle */}
            <rect x="40" y="56" width="216" height="32" rx="3" fill={BAND_RED} />
            <rect x="40" y="56" width="216" height="1.5" fill="rgba(255,255,255,0.30)" />
            <rect x="40" y="86.5" width="216" height="1.5" fill="rgba(0,0,0,0.18)" />
            <text
                x="148"
                y="79"
                fill="#FFFFFF"
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
