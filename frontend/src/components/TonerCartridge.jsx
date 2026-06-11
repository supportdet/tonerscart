import React from "react";
import { extractBrand } from "../lib/brands";

/**
 * Photo-realistic laser toner cartridge SVG.
 * Styled after an HP LaserJet cartridge — light gray plastic body with a
 * brand-coloured label band running across the top. Reads at a glance as a
 * physical product rather than a dark block.
 *
 * Props:
 *   color: "Cyan" | "Magenta" | "Yellow" | "Black"
 *   brand: e.g. "HP", "Canon", "Brother" — the only text shown on the cartridge
 */

const BRAND_ACCENTS = {
    HP:      { label: "#0096D6", text: "#FFFFFF" },   // HP blue
    Canon:   { label: "#CC0000", text: "#FFFFFF" },   // Canon red
    Brother: { label: "#E60012", text: "#FFFFFF" },   // Brother red
    Samsung: { label: "#1428A0", text: "#FFFFFF" },   // Samsung blue
    Ricoh:   { label: "#D7282F", text: "#FFFFFF" },   // Ricoh red
    Epson:   { label: "#003399", text: "#FFFFFF" },   // Epson blue
    Xerox:   { label: "#CE1126", text: "#FFFFFF" },   // Xerox red
    Kyocera: { label: "#E60012", text: "#FFFFFF" },   // Kyocera red
    "Konica Minolta": { label: "#005EB8", text: "#FFFFFF" }, // KM blue
    Pantum:  { label: "#DA291C", text: "#FFFFFF" },   // Pantum red
    Riso:    { label: "#E4002B", text: "#FFFFFF" },   // RISO red
    Sharp:   { label: "#E60012", text: "#FFFFFF" },   // Sharp red
};

// Unknown / unrecognised brands fall back to RED (not blue).
const DEFAULT_ACCENT = { label: "#C8102E", text: "#FFFFFF" };

const COLOR_DOT = {
    Cyan:    "#00B7C7",
    Magenta: "#E6007E",
    Yellow:  "#F5C400",
    Black:   "#1C1C1E",
};

export default function TonerCartridge({ color = "Black", brand = "HP" }) {
    // Show ONLY the clean brand name (e.g. "CANON" from "CARTRIDGE CANON 071").
    const brandName = extractBrand(brand) || "Toner";
    const brandAccent = BRAND_ACCENTS[brandName] || DEFAULT_ACCENT;
    const dot = COLOR_DOT[color] || COLOR_DOT.Black;
    const uid = `${brandName}-${color}`.replace(/[^a-zA-Z0-9]/g, "");

    return (
        <svg viewBox="0 0 400 280" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                {/* Main plastic body gradient — light to medium gray */}
                <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F2F3F5" />
                    <stop offset="35%" stopColor="#D8DADE" />
                    <stop offset="100%" stopColor="#A8ABB2" />
                </linearGradient>
                {/* Top fin / handle */}
                <linearGradient id={`fin-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E6E7EB" />
                    <stop offset="100%" stopColor="#B4B7BD" />
                </linearGradient>
                {/* Brand label band */}
                <linearGradient id={`band-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={brandAccent.label} stopOpacity="1" />
                    <stop offset="100%" stopColor={brandAccent.label} stopOpacity="0.88" />
                </linearGradient>
                {/* Drum roller */}
                <linearGradient id={`drum-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3A3D44" />
                    <stop offset="100%" stopColor="#141518" />
                </linearGradient>
                {/* Drop shadow under cartridge */}
                <radialGradient id={`shadow-${uid}`} cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor="rgba(0,0,0,0.25)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
            </defs>

            {/* Shadow under cartridge */}
            <ellipse cx="200" cy="255" rx="160" ry="10" fill={`url(#shadow-${uid})`} />

            {/* ====================== CARTRIDGE BODY ====================== */}
            {/* Main body — elongated rounded trapezoid */}
            <path
                d="M 40 90 Q 40 72 58 72 L 342 72 Q 360 72 360 90 L 360 210 Q 360 232 338 232 L 62 232 Q 40 232 40 210 Z"
                fill={`url(#body-${uid})`}
                stroke="rgba(0,0,0,0.12)"
                strokeWidth="1"
            />

            {/* Top specular highlight */}
            <path
                d="M 46 82 L 354 82 L 340 90 L 60 90 Z"
                fill="rgba(255,255,255,0.55)"
                opacity="0.7"
            />

            {/* Top fin / grip ridge */}
            <rect x="64" y="58" width="272" height="18" rx="5" fill={`url(#fin-${uid})`} stroke="rgba(0,0,0,0.08)" />
            <rect x="70" y="62" width="260" height="1.5" rx="1" fill="rgba(255,255,255,0.8)" />

            {/* Grip ridges on top */}
            {[0, 1, 2].map((i) => (
                <rect key={i} x={90 + i * 80} y="64" width="40" height="1.5" rx="0.75" fill="rgba(0,0,0,0.15)" />
            ))}

            {/* ====================== BRAND LABEL BAND ====================== */}
            <rect x="40" y="106" width="320" height="52" fill={`url(#band-${uid})`} />
            {/* Subtle top & bottom rails on label */}
            <rect x="40" y="106" width="320" height="1.5" fill="rgba(255,255,255,0.35)" />
            <rect x="40" y="156.5" width="320" height="1.5" fill="rgba(0,0,0,0.2)" />

            {/* Brand name — centered; the ONLY text overlaid on the cartridge */}
            <text x="200" y="141"
                fill={brandAccent.text}
                fontSize={brandName.length > 9 ? 22 : 30}
                fontWeight="800"
                fontFamily="'Montserrat', 'Inter', sans-serif"
                letterSpacing="2"
                textAnchor="middle"
            >
                {brandName.toUpperCase()}
            </text>

            {/* ====================== LOWER BODY DETAILS ====================== */}
            {/* Lower body kept clean — no model / type / label text overlay. */}

            {/* Color indicator dot bottom-right */}
            <circle cx="336" cy="181" r="6" fill={dot} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
            <circle cx="336" cy="181" r="2.2" fill="rgba(255,255,255,0.7)" />

            {/* ====================== DRUM ROLLER (bottom strip) ====================== */}
            <rect x="60" y="226" width="280" height="14" rx="7" fill={`url(#drum-${uid})`} stroke="rgba(0,0,0,0.25)" />
            <rect x="68" y="230" width="264" height="1" rx="0.5" fill="rgba(255,255,255,0.15)" />

            {/* Drum end caps */}
            <circle cx="60" cy="233" r="9" fill="#2A2C31" stroke="rgba(0,0,0,0.3)" />
            <circle cx="60" cy="233" r="4" fill="#15171A" />
            <circle cx="340" cy="233" r="9" fill="#2A2C31" stroke="rgba(0,0,0,0.3)" />
            <circle cx="340" cy="233" r="4" fill="#15171A" />
        </svg>
    );
}
