import React from "react";
import { extractBrand } from "../lib/brands";

/**
 * Default toner cartridge product image — clean, minimal SVG modelled on a
 * real horizontal laser toner cartridge: wider than tall, cylindrical
 * housings on both ends, rectangular body in the middle, grip at the bottom
 * center. Light grey/white plastic with subtle shading; the only text is the
 * brand name in white on a red band across the front face.
 *
 * Props:
 *   color: "Cyan" | "Magenta" | "Yellow" | "Black" (small indicator dot)
 *   brand: e.g. "HP", "Canon" — extracted to a clean brand name
 */

const BAND_RED = "#C8102E";

const COLOR_DOT = {
    Cyan:    "#00B7C7",
    Magenta: "#E6007E",
    Yellow:  "#F5C400",
    Black:   "#1C1C1E",
};

export default function TonerCartridge({ color = "Black", brand = "HP" }) {
    const brandName = extractBrand(brand) || "Toner";
    const dot = COLOR_DOT[color] || COLOR_DOT.Black;
    const uid = `${brandName}-${color}`.replace(/[^a-zA-Z0-9]/g, "");

    return (
        <svg viewBox="0 0 440 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                {/* Cylindrical end shading — dark edge → light center → dark edge */}
                <linearGradient id={`cyl-${uid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#9DA0A6" />
                    <stop offset="28%" stopColor="#E9EAED" />
                    <stop offset="55%" stopColor="#F6F7F8" />
                    <stop offset="80%" stopColor="#D4D6DA" />
                    <stop offset="100%" stopColor="#A5A8AE" />
                </linearGradient>
                {/* Middle body — light top → soft grey bottom */}
                <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FBFBFC" />
                    <stop offset="45%" stopColor="#EDEEF0" />
                    <stop offset="100%" stopColor="#C6C9CE" />
                </linearGradient>
                {/* Red brand band */}
                <linearGradient id={`band-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BAND_RED} />
                    <stop offset="100%" stopColor={BAND_RED} stopOpacity="0.88" />
                </linearGradient>
                {/* Grip plastic */}
                <linearGradient id={`grip-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D9DBDF" />
                    <stop offset="100%" stopColor="#A8ABB1" />
                </linearGradient>
                {/* Soft drop shadow */}
                <radialGradient id={`shadow-${uid}`} cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor="rgba(0,0,0,0.22)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
            </defs>

            {/* Floor shadow */}
            <ellipse cx="220" cy="208" rx="162" ry="9" fill={`url(#shadow-${uid})`} />

            {/* ============ CYLINDRICAL ENDS (left & right) ============ */}
            {/* Left cylinder */}
            <rect x="28" y="56" width="64" height="126" rx="32" fill={`url(#cyl-${uid})`} stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
            <rect x="48" y="66" width="6" height="106" rx="3" fill="rgba(255,255,255,0.55)" />
            {/* Right cylinder */}
            <rect x="348" y="56" width="64" height="126" rx="32" fill={`url(#cyl-${uid})`} stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
            <rect x="368" y="66" width="6" height="106" rx="3" fill="rgba(255,255,255,0.55)" />

            {/* ============ RECTANGULAR MIDDLE BODY ============ */}
            <rect x="80" y="64" width="280" height="110" rx="9" fill={`url(#body-${uid})`} stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
            {/* Top specular highlight */}
            <rect x="92" y="70" width="256" height="5" rx="2.5" fill="rgba(255,255,255,0.7)" />
            {/* Faint top seam */}
            <rect x="80" y="86" width="280" height="1.2" fill="rgba(0,0,0,0.07)" />

            {/* ============ RED BRAND BAND (front face) ============ */}
            <rect x="80" y="96" width="280" height="44" fill={`url(#band-${uid})`} />
            <rect x="80" y="96" width="280" height="1.5" fill="rgba(255,255,255,0.30)" />
            <rect x="80" y="138.5" width="280" height="1.5" fill="rgba(0,0,0,0.18)" />
            <text x="220" y="126"
                fill="#FFFFFF"
                fontSize={brandName.length > 9 ? 18 : 27}
                fontWeight="800"
                fontFamily="'Montserrat', 'Inter', sans-serif"
                letterSpacing="2"
                textAnchor="middle"
            >
                {brandName.toUpperCase()}
            </text>

            {/* ============ LOWER BODY DETAILS ============ */}
            {/* Subtle ridges */}
            {[0, 1].map((i) => (
                <rect key={i} x="102" y={150 + i * 8} width="160" height="1.6" rx="0.8" fill="rgba(0,0,0,0.07)" />
            ))}
            {/* Colour indicator dot */}
            <circle cx="334" cy="156" r="6" fill={dot} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
            <circle cx="334" cy="156" r="2.2" fill="rgba(255,255,255,0.7)" />

            {/* ============ GRIP / HANDLE (bottom center) ============ */}
            <rect x="188" y="170" width="64" height="24" rx="8" fill={`url(#grip-${uid})`} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
            {/* Grip slot */}
            <rect x="200" y="177" width="40" height="8" rx="4" fill="rgba(0,0,0,0.18)" />
        </svg>
    );
}
