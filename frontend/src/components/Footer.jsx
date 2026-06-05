import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="bg-white text-[#0A0A0B] border-t border-[#E8E8EC]" data-testid="site-footer">
            <div className="tc-container" style={{ paddingTop: 48, paddingBottom: 32 }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
                    {/* Brand column */}
                    <div data-testid="footer-brand">
                        <div className="inline-flex flex-col items-start">
                            <div className="inline-flex">
                                <img src="/TONERSCART-bg.png" alt="TonersCart" className="block h-10 w-auto" data-testid="footer-logo-img" />
                            </div>
                            <p className="mt-4 text-[#1D1D1F] text-[13px] max-w-xs" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                Buy Better. Print Smarter.
                            </p>
                            <p className="mt-2 text-[#6E6E73] text-[11px]">
                                TonersCart Private Limited · Bangalore, India
                            </p>
                            <p className="mt-5 text-[12px] text-[#86868B]">© {year} TonersCart. All rights reserved.</p>
                        </div>
                    </div>

                    {/* Marketplace column */}
                    <div data-testid="footer-marketplace">
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mb-3">Marketplace</div>
                        <ul className="space-y-2 text-[13.5px]">
                            <li><Link to="/search"   className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-toners">Toners</Link></li>
                            <li><Link to="/printers" className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-printers">Printers</Link></li>
                            <li><Link to="/mps"      className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-mps">MPS</Link></li>
                            <li><Link to="/sell"     className="text-[#1D1D1F] hover:text-[#00B7C7] transition" data-testid="footer-link-sell">Sell on TonersCart</Link></li>
                        </ul>
                    </div>

                    {/* Company column */}
                    <div data-testid="footer-company">
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
            </div>
            {/* CMYK print marks — absolute last element */}
            <div className="tc-print-marks" data-testid="footer-cmyk-bar" />
        </footer>
    );
}
