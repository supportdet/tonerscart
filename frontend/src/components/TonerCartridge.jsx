import React from "react";

/**
 * Realistic toner cartridge SVG. Renders an HP/Canon-style cartridge body
 * with a colored accent band (CMYK) based on the toner color.
 *
 * Props:
 *   color: "Cyan" | "Magenta" | "Yellow" | "Black"
 *   brand: e.g. "HP", "Canon" — shown on the label
 *   model: e.g. "88A", "TN-2365" — shown on the label
 *   compact: bool — uses smaller proportions
 */
const ACCENTS = {
    Cyan:    "#00B7C7",
    Magenta: "#E6007E",
    Yellow:  "#F5C400",
    Black:   "#222428",
};

export default function TonerCartridge({ color = "Black", brand = "HP", model = "88A" }) {
    const accent = ACCENTS[color] || ACCENTS.Black;
    const labelText = `${brand} ${model}`;
    return (
        <svg viewBox="0 0 360 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id={`body-${color}-${model}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3A3D44" />
                    <stop offset="55%" stopColor="#1F2025" />
                    <stop offset="100%" stopColor="#0E0F12" />
                </linearGradient>
                <linearGradient id={`top-${color}-${model}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2E3036" />
                    <stop offset="100%" stopColor="#16171A" />
                </linearGradient>
                <linearGradient id={`drum-${color}-${model}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3A3D44" />
                    <stop offset="100%" stopColor="#0A0A0B" />
                </linearGradient>
                <linearGradient id={`lever-${color}-${model}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4A4D54" />
                    <stop offset="100%" stopColor="#222428" />
                </linearGradient>
            </defs>

            {/* Main body */}
            <path
                d="M 30 50 Q 30 30 50 30 L 300 30 Q 320 30 320 50 L 320 60 L 340 60 Q 350 60 350 70 L 350 180 Q 350 195 335 195 L 60 195 Q 30 195 30 170 Z"
                fill={`url(#body-${color}-${model})`}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
            />

            {/* Top fin */}
            <rect x="50" y="20" width="240" height="14" rx="4" fill={`url(#top-${color}-${model})`} />

            {/* Highlight strip on body */}
            <rect x="38" y="42" width="280" height="2" fill="rgba(255,255,255,0.08)" rx="1" />

            {/* Vents */}
            {[0, 1, 2, 3, 4].map((i) => (
                <rect key={i} x={50} y={62 + i * 14} width={36} height={4} rx="2" fill="rgba(255,255,255,0.06)" />
            ))}

            {/* Color accent band — CMYK strip */}
            <rect x="100" y="70" width="160" height="28" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" />
            <rect x="106" y="76" width="148" height="6" rx="2" fill={accent} opacity="0.95" />

            {/* Label box */}
            <rect x="100" y="108" width="160" height="44" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" />
            <text x="180" y="132"
                fill="rgba(255,255,255,0.92)"
                fontSize="14"
                fontWeight="700"
                fontFamily="'JetBrains Mono', ui-monospace, monospace"
                textAnchor="middle"
                letterSpacing="1.5">
                {labelText}
            </text>
            <text x="180" y="146"
                fill="rgba(255,255,255,0.45)"
                fontSize="7"
                fontWeight="600"
                fontFamily="'Inter', sans-serif"
                textAnchor="middle"
                letterSpacing="2">
                TONERSCART
            </text>

            {/* Bottom branding */}
            <text x="100" y="178"
                fill="rgba(255,255,255,0.32)"
                fontSize="8"
                fontWeight="500"
                fontFamily="'Inter', sans-serif"
                letterSpacing="2.5">
                ORIGINAL · {color.toUpperCase()}
            </text>

            {/* Small status LED */}
            <circle cx="290" cy="178" r="3" fill={accent} opacity="0.9">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" repeatCount="indefinite" />
            </circle>

            {/* Drum (right side) */}
            <g transform="translate(312 130)">
                <circle cx="0" cy="0" r="36" fill={`url(#drum-${color}-${model})`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                <circle cx="0" cy="0" r="24" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.55" />
                <circle cx="0" cy="0" r="10" fill="#16171A" stroke="rgba(255,255,255,0.10)" />
                <line x1="0" y1="-22" x2="0" y2="-12" stroke={accent} strokeWidth="2" strokeLinecap="round" />
            </g>

            {/* Side lever */}
            <rect x="46" y="48" width="6" height="14" rx="2" fill={`url(#lever-${color}-${model})`} />
        </svg>
    );
}
