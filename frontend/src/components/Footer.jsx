import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { TERMS_VERSION } from "../pages/Terms";
import { PRIVACY_VERSION } from "../pages/Privacy";

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="bg-white text-[#0A0A0B] border-t border-[#E8E8EC]" data-testid="site-footer">
            <div className="tc-container" style={{ paddingTop: 48, paddingBottom: 32 }}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
                    {/* Brand column */}
                    <div data-testid="footer-brand" className="md:col-span-4">
                        <div className="inline-flex">
                            <img src="/TONERSCART-bg.png" alt="TonersCart" className="block h-10 w-auto" data-testid="footer-logo-img" />
                        </div>
                        <p className="mt-4 text-[13px] text-[#6E6E73] leading-relaxed max-w-sm" data-testid="footer-about-blurb">
                            TonersCart is India's B2B marketplace for printers, toners, papers and consumables —
                            connecting businesses with verified suppliers for better prices, real stock and reliable
                            delivery across the country.
                        </p>
                        <p className="mt-4 text-[#1D1D1F] text-[13px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                            Buy Better. Print Smarter.
                        </p>
                        <p className="mt-2 text-[#6E6E73] text-[11px]">
                            TonersCart Private Limited · Bangalore, India
                        </p>
                        <p className="mt-5 text-[12px] text-[#86868B]">© {year} TonersCart. All rights reserved.</p>
                    </div>

                    {/* Marketplace column */}
                    <div data-testid="footer-marketplace" className="md:col-span-3">
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mb-3">Marketplace</div>
                        <ul className="space-y-2 text-[13.5px]">
                            <li><Link to="/search"       className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-toners">Toners</Link></li>
                            <li><Link to="/printers"     className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-printers">Printers</Link></li>
                            <li><Link to="/papers"       className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-papers">Papers</Link></li>
                            <li><Link to="/consumables"  className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-consumables">Consumables</Link></li>
                            <li><Link to="/scanners"     className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-scanners">Scanners</Link></li>
                            <li><Link to="/mps"          className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-mps">MPS / Rentals</Link></li>
                        </ul>
                    </div>

                    {/* Solutions column */}
                    <div data-testid="footer-solutions" className="md:col-span-2">
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mb-3">Solutions</div>
                        <ul className="space-y-2 text-[13.5px]">
                            <li><Link to="/bulk"               className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-bulk">Bulk Orders</Link></li>
                            <li><Link to="/dealer"             className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-dealer">Dealer to Dealer</Link></li>
                            <li><Link to="/oem"                className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-oem">OEM Marketplace</Link></li>
                            <li><Link to="/procurement/login"  className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-govt">Govt Portal</Link></li>
                            <li><Link to="/sell"               className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-sell">Sell on TonersCart</Link></li>
                        </ul>
                    </div>

                    {/* Company column */}
                    <div data-testid="footer-company" className="md:col-span-3">
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mb-3">Company</div>
                        <ul className="space-y-2 text-[13.5px]">
                            <li><Link to="/about"   className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-about">About Us</Link></li>
                            <li><Link to="/terms"   className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-terms">Terms of Service</Link></li>
                            <li><Link to="/privacy" className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-privacy">Privacy Policy</Link></li>
                            <li><Link to="/contact" className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-contact">Contact Us</Link></li>
                            <li><Link to="/admin"   className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-admin">Admin</Link></li>
                        </ul>
                    </div>
                </div>

                {/* Grievance Officer strip */}
                <div className="mt-10 pt-6 border-t border-[#E8E8EC] text-[12px] text-[#6E6E73] leading-relaxed" data-testid="footer-grievance">
                    <span className="font-semibold text-[#0A0A0B]">For grievances contact:</span>{" "}
                    <a href="mailto:support@tonerscart.com" className="text-[#1D1D1F] hover:text-[#00B7C7] transition">support@tonerscart.com</a>
                    {" · "}TonersCart Private Limited, Bangalore
                    {" · "}Response within 48 hours
                </div>

                {/* Legal version badge */}
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="footer-legal-badge">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0A8754] bg-[#0A8754]/[0.08] border border-[#0A8754]/20 rounded-full px-2.5 py-1">
                        <ShieldCheck size={12} /> Legally compliant
                    </span>
                    <Link to="/terms" className="text-[11px] text-[#6E6E73] hover:text-[#00B7C7] transition" data-testid="footer-terms-version">
                        Terms v{TERMS_VERSION}
                    </Link>
                    <span className="text-[#D2D2D7]">·</span>
                    <Link to="/privacy" className="text-[11px] text-[#6E6E73] hover:text-[#00B7C7] transition" data-testid="footer-privacy-version">
                        Privacy v{PRIVACY_VERSION}
                    </Link>
                    <span className="text-[#D2D2D7]">·</span>
                    <span className="text-[11px] text-[#86868B]">Last updated June 2026</span>
                </div>
            </div>
            {/* CMYK print marks — absolute last element */}
            <div className="tc-print-marks" data-testid="footer-cmyk-bar" />
        </footer>
    );
}
