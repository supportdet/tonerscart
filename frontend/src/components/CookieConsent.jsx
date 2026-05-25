import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "tc_cookie_consent";

export default function CookieConsent() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        try {
            const accepted = window.localStorage.getItem(STORAGE_KEY);
            if (!accepted) {
                // Give the page a moment to settle before the slide-up
                const t = setTimeout(() => setShow(true), 600);
                return () => clearTimeout(t);
            }
        } catch (_e) {
            // localStorage disabled — fail silently
        }
    }, []);

    const accept = () => {
        try { window.localStorage.setItem(STORAGE_KEY, "true"); } catch (_e) { /* noop */ }
        setShow(false);
    };

    if (!show) return null;

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-[2000] bg-[#0A0A0B] text-white px-4 sm:px-6 py-4 shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.4)] tc-cookie-bar"
            role="dialog"
            aria-label="Cookie consent"
            data-testid="cookie-consent"
        >
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-6">
                <div className="text-[13px] leading-relaxed text-white/85">
                    We use cookies to improve your experience on TonersCart. By continuing to use this site, you agree to our{" "}
                    <Link to="/privacy" className="underline underline-offset-2 hover:text-[#F5C400]" data-testid="cookie-privacy-link">
                        Privacy Policy
                    </Link>.
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <button
                        onClick={accept}
                        className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-[#F5C400] hover:bg-[#FFD119] text-[#0A0A0B] text-[13px] font-semibold transition"
                        data-testid="cookie-accept-btn"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
