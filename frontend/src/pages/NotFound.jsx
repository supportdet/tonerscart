import React from "react";
import { Link } from "react-router-dom";
import { Compass, Home, Search } from "lucide-react";

/** Friendly 404 page rendered for any unmatched route. */
export default function NotFound() {
    return (
        <div className="bg-white min-h-[70vh]" data-testid="not-found-page">
            <div className="tc-container py-16 sm:py-24 text-center max-w-xl">
                <div className="mx-auto w-16 h-16 rounded-full bg-[#FFFBEB] border border-[#F5C400]/30 grid place-items-center">
                    <Compass size={28} className="text-[#F5C400]" />
                </div>
                <div className="mt-5 font-mono text-[12px] tracking-[0.22em] uppercase text-[#86868B]">Error 404</div>
                <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.15 }}>
                    Page not found
                </h1>
                <p className="mt-3 text-[14px] text-[#6E6E73]">
                    We couldn&apos;t find what you were looking for. Try heading to the homepage, or search for a specific toner model.
                </p>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    <Link to="/" className="btn-cta inline-flex items-center gap-1.5" data-testid="not-found-home-btn">
                        <Home size={14} /> Go to homepage
                    </Link>
                    <Link to="/search" className="btn-light inline-flex items-center gap-1.5" data-testid="not-found-search-btn">
                        <Search size={14} /> Search toners
                    </Link>
                </div>
            </div>
        </div>
    );
}
