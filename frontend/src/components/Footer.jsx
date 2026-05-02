import React from "react";

export default function Footer() {
    return (
        <footer className="bg-[#0B1B3D] text-slate-200 mt-20" data-testid="site-footer">
            <div className="tc-container py-12 grid md:grid-cols-4 gap-8">
                <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-md bg-white grid place-items-center">
                            <span className="text-[#0B1B3D] font-bold text-sm">TC</span>
                        </div>
                        <div className="font-bold text-white tc-display text-lg">TonersCart</div>
                    </div>
                    <p className="text-sm text-slate-300 max-w-md leading-relaxed">
                        India&apos;s focused B2B marketplace for printer toners — connecting bulk buyers with verified suppliers across Delhi, Mumbai, Bangalore, Chennai, Pune and beyond.
                    </p>
                </div>
                <div>
                    <div className="tc-eyebrow text-slate-400 mb-3">For Buyers</div>
                    <ul className="space-y-2 text-sm">
                        <li>Compare suppliers</li>
                        <li>Bulk order requests</li>
                        <li>Track every shipment</li>
                    </ul>
                </div>
                <div>
                    <div className="tc-eyebrow text-slate-400 mb-3">For Suppliers</div>
                    <ul className="space-y-2 text-sm">
                        <li>Reach verified buyers</li>
                        <li>Manage stock & pricing</li>
                        <li>Order pipeline dashboard</li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-white/10">
                <div className="tc-container py-5 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
                    <div>© {new Date().getFullYear()} TonersCart Trade Pvt. Ltd. — A B2B trade platform.</div>
                    <div>Suppliers handle delivery. Platform connects buyers and sellers — no payment processing.</div>
                </div>
            </div>
        </footer>
    );
}
