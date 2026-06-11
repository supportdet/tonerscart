import React from "react";
import { extractBrand } from "../lib/brands";

/**
 * Photo-realistic laser toner cartridge SVG — UPRIGHT/boxy design with a
 * carrying handle on top (like a real boxed laser cartridge), light gray
 * plastic body and a brand-coloured label band. Only the clean brand name is
 * shown on the label.
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
        <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                {/* Main plastic body gradient — light to medium gray */}
                <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#C9CBD0" />
                    <stop offset="18%" stopColor="#F2F3F5" />
                    <stop offset="55%" stopColor="#DDDFE3" />
                    <stop offset="100%" stopColor="#A8ABB2" />
                </linearGradient>
                {/* Lid / handle plastic */}
                <linearGradient id={`fin-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E9EAEE" />
                    <stop offset="100%" stopColor="#AFB2B8" />
                </linearGradient>
                {/* Brand label band */}
                <linearGradient id={`band-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={brandAccent.label} stopOpacity="1" />
                    <stop offset="100%" stopColor={brandAccent.label} stopOpacity="0.86" />
                </linearGradient>
                {/* Bottom shutter / drum */}
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
            <ellipse cx="200" cy="280" rx="112" ry="9" fill={`url(#shadow-${uid})`} />

            {/* ====================== CARRYING HANDLE (top) ====================== */}
            <path
                d="M 162 62 L 162 46 Q 162 32 176 32 L 224 32 Q 238 32 238 46 L 238 62"
                fill="none"
                stroke={`url(#fin-${uid})`}
                strokeWidth="13"
                strokeLinecap="round"
            />
            {/* Handle inner shading line */}
            <path
                d="M 162 62 L 162 46 Q 162 32 176 32 L 224 32 Q 238 32 238 46 L 238 62"
                fill="none"
                stroke="rgba(0,0,0,0.14)"
                strokeWidth="1.5"
            />

            {/* ====================== TOP LID ====================== */}
            <rect x="104" y="58" width="192" height="22" rx="7" fill={`url(#fin-${uid})`} stroke="rgba(0,0,0,0.10)" />
            <rect x="112" y="62" width="176" height="1.5" rx="0.75" fill="rgba(255,255,255,0.8)" />
            {/* Lid grip notches */}
            {[0, 1, 2].map((i) => (
                <rect key={i} x={128 + i * 56} y="68" width="32" height="1.5" rx="0.75" fill="rgba(0,0,0,0.14)" />
            ))}

            {/* ====================== MAIN BODY (upright, boxy) ====================== */}
            <rect
                x="112" y="78" width="176" height="184" rx="12"
                fill={`url(#body-${uid})`}
                stroke="rgba(0,0,0,0.12)"
                strokeWidth="1"
            />
            {/* Top specular highlight */}
            <rect x="122" y="84" width="156" height="6" rx="3" fill="rgba(255,255,255,0.55)" opacity="0.7" />

            {/* Side tabs (left & right) for the boxy cartridge silhouette */}
            <rect x="98" y="100" width="14" height="44" rx="4" fill={`url(#fin-${uid})`} stroke="rgba(0,0,0,0.10)" />
            <rect x="288" y="100" width="14" height="44" rx="4" fill={`url(#fin-${uid})`} stroke="rgba(0,0,0,0.10)" />

            {/* ====================== BRAND LABEL BAND ====================== */}
            <rect x="112" y="120" width="176" height="46" fill={`url(#band-${uid})`} />
            <rect x="112" y="120" width="176" height="1.5" fill="rgba(255,255,255,0.35)" />
            <rect x="112" y="164.5" width="176" height="1.5" fill="rgba(0,0,0,0.2)" />

            {/* Brand name — centered; the ONLY text on the cartridge */}
            <text x="200" y="150"
                fill={brandAccent.text}
                fontSize={brandName.length > 9 ? 15 : 24}
                fontWeight="800"
                fontFamily="'Montserrat', 'Inter', sans-serif"
                letterSpacing="1.5"
                textAnchor="middle"
            >
                {brandName.toUpperCase()}
            </text>

            {/* ====================== LOWER BODY DETAILS ====================== */}
            {/* Grip ridges */}
            {[0, 1, 2].map((i) => (
                <rect key={i} x="132" y={180 + i * 9} width="136" height="2" rx="1" fill="rgba(0,0,0,0.08)" />
            ))}

            {/* Toner level window */}
            <rect x="132" y="216" width="92" height="14" rx="7" fill="#23252A" stroke="rgba(0,0,0,0.25)" />
            <rect x="136" y="219.5" width="58" height="7" rx="3.5" fill={dot} opacity="0.92" />

            {/* Colour indicator dot */}
            <circle cx="260" cy="223" r="7" fill={dot} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
            <circle cx="260" cy="223" r="2.6" fill="rgba(255,255,255,0.7)" />

            {/* ====================== BOTTOM SHUTTER / DRUM STRIP ====================== */}
            <rect x="126" y="248" width="148" height="13" rx="6.5" fill={`url(#drum-${uid})`} stroke="rgba(0,0,0,0.25)" />
            <rect x="134" y="251.5" width="132" height="1" rx="0.5" fill="rgba(255,255,255,0.15)" />

            {/* Drum end caps */}
            <circle cx="126" cy="254.5" r="8" fill="#2A2C31" stroke="rgba(0,0,0,0.3)" />
            <circle cx="126" cy="254.5" r="3.5" fill="#15171A" />
            <circle cx="274" cy="254.5" r="8" fill="#2A2C31" stroke="rgba(0,0,0,0.3)" />
            <circle cx="274" cy="254.5" r="3.5" fill="#15171A" />
        </svg>
    );
}
