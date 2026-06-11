import React from "react";
import { extractBrand, BRAND_BANDS, DEFAULT_BAND } from "../lib/brands";

/**
 * Static placeholder product image for printers, consumables and scanners —
 * clean line-art (matching the toner placeholder aesthetic) with the brand
 * name on a brand-colored band. Used wherever a listing has no dealer image
 * so no listing ever shows an empty grey box.
 *
 * Props:
 *   kind:  "printer" | "consumable" | "scanner"
 *   brand: raw brand string — extracted to a clean brand name
 */

const STROKE = "#33343A";

const ART = {
    printer: (
        <g stroke={STROKE} strokeWidth="3" fill="#FFFFFF" strokeLinejoin="round" strokeLinecap="round">
            {/* paper sheet in rear tray */}
            <rect x="122" y="16" width="52" height="30" rx="2" />
            <line x1="130" y1="24" x2="166" y2="24" strokeWidth="2" />
            <line x1="130" y1="31" x2="166" y2="31" strokeWidth="2" />
            {/* printer body */}
            <rect x="78" y="42" width="140" height="50" rx="9" />
            {/* output slot + tray */}
            <line x1="96" y1="78" x2="200" y2="78" strokeWidth="2.5" />
            <rect x="106" y="92" width="84" height="8" rx="3" />
            {/* control panel */}
            <circle cx="198" cy="56" r="3.5" fill={STROKE} stroke="none" />
            <rect x="88" y="52" width="22" height="9" rx="2.5" strokeWidth="2" />
        </g>
    ),
    scanner: (
        <g stroke={STROKE} strokeWidth="3" fill="#FFFFFF" strokeLinejoin="round" strokeLinecap="round">
            {/* lid */}
            <rect x="84" y="34" width="128" height="16" rx="6" />
            <line x1="84" y1="50" x2="76" y2="62" strokeWidth="2.5" />
            {/* flatbed base */}
            <rect x="72" y="60" width="152" height="32" rx="9" />
            {/* glass line */}
            <line x1="86" y1="70" x2="178" y2="70" strokeWidth="2" />
            {/* panel button */}
            <circle cx="204" cy="76" r="4" fill={STROKE} stroke="none" />
            {/* feet */}
            <rect x="86" y="92" width="18" height="6" rx="2" strokeWidth="2" />
            <rect x="192" y="92" width="18" height="6" rx="2" strokeWidth="2" />
        </g>
    ),
    consumable: (
        <g stroke={STROKE} strokeWidth="3" fill="#FFFFFF" strokeLinejoin="round" strokeLinecap="round">
            {/* ink bottle */}
            <rect x="112" y="38" width="36" height="56" rx="7" />
            <rect x="121" y="26" width="18" height="12" rx="3" />
            <path d="M 130 56 q -6 9 0 14 q 6 -5 0 -14 Z" fill={STROKE} stroke="none" />
            {/* drum cylinder */}
            <rect x="160" y="52" width="48" height="34" rx="8" />
            <circle cx="172" cy="69" r="6" strokeWidth="2.5" />
            <line x1="184" y1="60" x2="200" y2="60" strokeWidth="2" />
            <line x1="184" y1="69" x2="200" y2="69" strokeWidth="2" />
            <line x1="184" y1="78" x2="200" y2="78" strokeWidth="2" />
        </g>
    ),
};

export default function ProductPlaceholder({ kind = "printer", brand = "" }) {
    const cleanBrand = extractBrand(brand) || "";
    const name = cleanBrand.toUpperCase();
    const colors = BRAND_BANDS[cleanBrand] || DEFAULT_BAND;
    return (
        <svg
            viewBox="0 0 296 144"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={`${name || kind} ${kind}`}
            data-testid={`${kind}-placeholder-image`}
        >
            <rect x="0" y="0" width="296" height="144" fill="#FFFFFF" />
            {ART[kind] || ART.printer}
            {/* Brand band */}
            <rect
                x="58" y="108" width="180" height="26" rx="3"
                fill={colors.band}
                stroke={colors.border || "none"}
                strokeWidth={colors.border ? 1.5 : 0}
            />
            <text
                x="148"
                y="126"
                fill={colors.text}
                fontSize={name.length > 9 ? 11 : 15}
                fontWeight="800"
                fontFamily="'Montserrat', 'Inter', sans-serif"
                letterSpacing="2"
                textAnchor="middle"
            >
                {name || kind.toUpperCase()}
            </text>
        </svg>
    );
}
