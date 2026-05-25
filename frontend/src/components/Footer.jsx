import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="bg-[#0A0A0B] text-white" data-testid="site-footer">
            <div className="tc-container" style={{ paddingTop: 48, paddingBottom: 32 }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
                    {/* Brand column */}
                    <div data-testid="footer-brand">
                        <div className="inline-flex flex-col items-start">
                            <div className="bg-white rounded-lg p-2 inline-flex">
                                <img src="/TONERSCART-bg.png" alt="TonersCart" className="block h-10 w-auto" data-testid="footer-logo-img" />
                            </div>
                            <p className="mt-4 text-white text-[13px] opacity-70 max-w-xs" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                Buy Better. Print Smarter.
                            </p>
                            <p className="mt-2 text-white text-[11px] opacity-50">
                                A brand of Digital Edge Technologies | Bangalore
                            </p>
                            <p className="mt-5 text-[12px] text-white/40">© {year} TonersCart. All rights reserved.</p>
                        </div>
                    </div>

                    {/* Marketplace column */}
                    <div data-testid="footer-marketplace">
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-white/45 mb-3">Marketplace</div>
                        <ul className="space-y-2 text-[13.5px]">
                            <li><Link to="/search"   className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-toners">Toners</Link></li>
                            <li><Link to="/printers" className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-printers">Printers</Link></li>
                            <li><Link to="/mps"      className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-mps">MPS</Link></li>
                            <li><Link to="/sell"     className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-sell">Sell on TonersCart</Link></li>
                        </ul>
                    </div>

                    {/* Company column */}
                    <div data-testid="footer-company">
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-white/45 mb-3">Company</div>
                        <ul className="space-y-2 text-[13.5px]">
                            <li><Link to="/about"   className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-about">About Us</Link></li>
                            <li><Link to="/terms"   className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-terms">Terms of Service</Link></li>
                            <li><Link to="/privacy" className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-privacy">Privacy Policy</Link></li>
                            <li><Link to="/contact" className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-contact">Contact Us</Link></li>
                            <li><Link to="/admin"   className="text-white/85 hover:text-[#F5C400] transition" data-testid="footer-link-admin">Admin</Link></li>
                        </ul>
                    </div>
                </div>

                {/* Grievance Officer strip */}
                <div className="mt-10 pt-6 border-t border-white/[0.1] text-[12px] text-white/60 leading-relaxed" data-testid="footer-grievance">
                    <span className="font-semibold text-white/80">Grievance Officer:</span> Mr. Karthik Nair
                    {" · "}<a href="mailto:grievance@tonerscart.com" className="text-white/80 hover:text-[#F5C400] transition">grievance@tonerscart.com</a>
                    {" · "}Digital Edge Technologies, Bangalore
                    {" · "}Response within 48 hours
                </div>
            </div>
            {/* CMYK print marks — absolute last element */}
            <div className="tc-print-marks" data-testid="footer-cmyk-bar" />
        </footer>
    );
}
