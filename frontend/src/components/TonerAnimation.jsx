import React, { useEffect, useState } from "react";

const BRANDS = ["HP", "Xerox", "Riso"];

/**
 * Premium printer-toner cartridge animation. Pure CSS / SVG.
 * Floats, has CMYK glow, drum spins gently. Label rotates across brands.
 */
export default function TonerAnimation() {
    const [bi, setBi] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setBi((i) => (i + 1) % BRANDS.length), 2200);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="tc-toner-wrap" aria-hidden="true" data-testid="toner-animation">
            {/* Glow halos */}
            <div className="tc-toner-halo tc-halo-cyan" />
            <div className="tc-toner-halo tc-halo-magenta" />
            <div className="tc-toner-halo tc-halo-yellow" />

            {/* Cartridge */}
            <svg viewBox="0 0 520 320" className="tc-toner-svg">
                <defs>
                    <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3A3D44" />
                        <stop offset="50%" stopColor="#1F2025" />
                        <stop offset="100%" stopColor="#0A0A0B" />
                    </linearGradient>
                    <linearGradient id="topGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#2A2C32" />
                        <stop offset="100%" stopColor="#16171A" />
                    </linearGradient>
                    <linearGradient id="drumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2A2C32" />
                        <stop offset="100%" stopColor="#0A0A0B" />
                    </linearGradient>
                    <linearGradient id="labelGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#00B7C7" />
                        <stop offset="50%" stopColor="#E6007E" />
                        <stop offset="100%" stopColor="#F5C400" />
                    </linearGradient>
                    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
                        <feOffset dx="0" dy="10" />
                        <feComponentTransfer><feFuncA type="linear" slope="0.45" /></feComponentTransfer>
                        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* Body group — floats up/down */}
                <g className="tc-toner-float" filter="url(#softShadow)">
                    {/* Main body */}
                    <rect x="60" y="80" width="380" height="160" rx="12" fill="url(#bodyGrad)" />
                    {/* Top fin */}
                    <rect x="60" y="60" width="380" height="28" rx="8" fill="url(#topGrad)" />
                    {/* Highlight strip */}
                    <rect x="60" y="78" width="380" height="2" fill="rgba(255,255,255,0.08)" />
                    {/* Vents on left */}
                    {[0, 1, 2, 3, 4].map((i) => (
                        <rect key={i} x="78" y={108 + i * 18} width="40" height="6" rx="3" fill="rgba(255,255,255,0.05)" />
                    ))}
                    {/* CMYK label band */}
                    <rect x="160" y="118" width="220" height="46" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" />
                    <rect x="172" y="130" width="14" height="22" rx="2" fill="#00B7C7" />
                    <rect x="194" y="130" width="14" height="22" rx="2" fill="#E6007E" />
                    <rect x="216" y="130" width="14" height="22" rx="2" fill="#F5C400" />
                    <rect x="238" y="130" width="14" height="22" rx="2" fill="#FAFAFC" />
                    <text key={BRANDS[bi]} x="266" y="148" fill="rgba(255,255,255,0.9)" fontSize="14" fontWeight="700" fontFamily="'JetBrains Mono', monospace" letterSpacing="2" className="tc-toner-label">{BRANDS[bi]}</text>
                    {/* Bottom branding */}
                    <text x="170" y="190" fill="rgba(255,255,255,0.55)" fontSize="10" fontWeight="500" letterSpacing="3">TONERSCART · ORIGINAL</text>

                    {/* Drum (spinning) */}
                    <g className="tc-toner-drum" style={{ transformOrigin: "410px 200px" }}>
                        <circle cx="410" cy="200" r="34" fill="url(#drumGrad)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                        <circle cx="410" cy="200" r="22" fill="none" stroke="rgba(0,183,199,0.22)" strokeWidth="2" strokeDasharray="3 4" />
                        <circle cx="410" cy="200" r="8" fill="#16171A" stroke="rgba(255,255,255,0.08)" />
                        <line x1="410" y1="178" x2="410" y2="190" stroke="rgba(0,183,199,0.65)" strokeWidth="2" strokeLinecap="round" />
                    </g>

                    {/* Right cap */}
                    <rect x="438" y="100" width="12" height="120" rx="3" fill="rgba(255,255,255,0.05)" />
                    {/* Glow strip near drum */}
                    <rect x="370" y="244" width="80" height="3" rx="1.5" fill="#00B7C7" opacity="0.6" className="tc-toner-pulse" />
                </g>

                {/* Print marks falling */}
                <g className="tc-print-fall">
                    <rect x="220" y="260" width="6" height="14" rx="2" fill="#00B7C7" />
                    <rect x="245" y="270" width="6" height="14" rx="2" fill="#E6007E" />
                    <rect x="270" y="280" width="6" height="14" rx="2" fill="#F5C400" />
                </g>
            </svg>
        </div>
    );
}
