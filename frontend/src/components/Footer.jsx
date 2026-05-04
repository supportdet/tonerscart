import React from "react";
import { Link } from "react-router-dom";
import { Phone, Mail } from "lucide-react";

export default function Footer() {
    return (
        <footer className="bg-[#0E0F12] text-slate-300 mt-24" data-testid="site-footer">
            <div className="tc-print-marks" />
            <div className="tc-container py-14 grid md:grid-cols-4 gap-10">
                <div className="md:col-span-2">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="relative w-8 h-8 rounded-lg bg-white grid place-items-center overflow-hidden">
                            <span className="text-[#0E0F12] font-bold text-sm relative z-10">TC</span>
                        </div>
                        <div className="font-bold text-white text-lg">TonersCart</div>
                    </div>
                    <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                        India&apos;s focused B2B marketplace for printer toners. Compare verified suppliers, place bulk order requests, track shipments — no payment gateway, just direct trade.
                    </p>
                    <div className="mt-5 space-y-2 text-sm" data-testid="footer-contact">
                        <a href="tel:+919742270585" className="inline-flex items-center gap-2 text-slate-300 hover:text-white" data-testid="footer-phone-1">
                            <Phone size={13} className="text-[#00B7C7]" /> +91 97422 70585
                        </a>
                        <a href="tel:+918971768796" className="inline-flex items-center gap-2 text-slate-300 hover:text-white ml-4" data-testid="footer-phone-2">
                            <Phone size={13} className="text-[#00B7C7]" /> +91 89717 68796
                        </a>
                        <div>
                            <a href="mailto:support@tonerscart.com" className="inline-flex items-center gap-2 text-slate-300 hover:text-white" data-testid="footer-email">
                                <Mail size={13} className="text-[#00B7C7]" /> support@tonerscart.com
                            </a>
                        </div>
                    </div>
                </div>
                <div>
                    <div className="tc-eyebrow text-slate-500 mb-3">Buyers</div>
                    <ul className="space-y-2 text-sm">
                        <li><Link to="/search" className="hover:text-white">Browse toners</Link></li>
                        <li><Link to="/printers" className="hover:text-white">Find printers</Link></li>
                        <li><Link to="/register" className="hover:text-white">Create buyer account</Link></li>
                        <li><Link to="/login" className="hover:text-white">Sign in</Link></li>
                    </ul>
                </div>
                <div>
                    <div className="tc-eyebrow text-slate-500 mb-3">Suppliers</div>
                    <ul className="space-y-2 text-sm">
                        <li><Link to="/sell" className="hover:text-white">List your business</Link></li>
                        <li><Link to="/mps" className="hover:text-white">Managed Print Services</Link></li>
                        <li>Manage stock & pricing</li>
                        <li>Order pipeline dashboard</li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-white/10">
                <div className="tc-container py-5 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                    <div>© {new Date().getFullYear()} TonersCart Trade Pvt. Ltd.</div>
                    <div>Suppliers handle delivery. Platform connects buyers and sellers.</div>
                </div>
            </div>
        </footer>
    );
}
