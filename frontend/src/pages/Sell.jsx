import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SellerApplicationForm from "../components/SellerApplicationForm";
import { Button } from "../components/ui/button";
import { Hourglass, AlertTriangle, ArrowRight, RefreshCw, FileText } from "lucide-react";
import PageMeta from "../components/PageMeta";

export default function Sell() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [showResubmit, setShowResubmit] = useState(false);
    const formRef = useRef(null);

    // Approved sellers go straight to the dashboard
    useEffect(() => {
        if (!loading && user?.role === "supplier") {
            navigate("/supplier", { replace: true });
        }
    }, [user, loading, navigate]);

    useEffect(() => {
        if (showResubmit && formRef.current) {
            formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [showResubmit]);

    if (loading) {
        return <div className="tc-container py-24 text-white/70" data-testid="sell-loading">Loading…</div>;
    }

    // Guest: prompt sign-in / register — Wave 55 messaging
    if (!user) {
        return (
            <div className="tc-hero relative pb-16 overflow-x-hidden" data-testid="sell-guest">
                <PageMeta
                    title="Sell on TonersCart — Free for Suppliers, Sellers & Partners"
                    description="Suppliers, sellers and partners — apply here for FREE to upload and list your products on TonersCart. Reach verified buyers across India with zero listing fees."
                    path="/sell"
                />
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16 max-w-2xl">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Become a seller</span>
                    </div>
                    <h1
                        className="text-white"
                        style={{
                            fontFamily: "'Montserrat', sans-serif",
                            fontSize: "clamp(26px, 4vw, 50px)",
                            fontWeight: 300,
                            letterSpacing: "-0.025em",
                            lineHeight: 1.14,
                            wordBreak: "break-word",
                        }}
                    >
                        Suppliers, sellers &amp; partners — <span className="text-[#3FD267] font-medium">apply here for FREE</span> to upload and list your products on TonersCart
                    </h1>
                    <p className="text-white/65 mt-4 text-[14.5px] max-w-xl">
                        No listing fee. No subscription. Reach verified buyers across India and start receiving orders within 1–2 business days of approval.
                    </p>
                    <ul className="mt-5 space-y-1.5 text-white/70 text-[13.5px]">
                        <li>• Upload toners, printers, inks, consumables, papers &amp; scanners.</li>
                        <li>• Set your own price &mdash; we add GST &amp; delivery at checkout.</li>
                    </ul>
                    <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:items-center w-full sm:w-auto">
                        <Button
                            onClick={() => navigate("/register?next=/sell")}
                            className="btn-cta inline-flex items-center justify-center gap-2 w-full sm:w-auto"
                            data-testid="sell-signup-btn"
                        >
                            Create account &amp; apply <ArrowRight size={14} />
                        </Button>
                        <Button
                            onClick={() => navigate("/login?next=/sell")}
                            variant="outline"
                            className="text-[#0A0A0B] bg-white w-full sm:w-auto"
                            data-testid="sell-signin-btn"
                        >
                            Sign in
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Pending application
    if (user.application_status === "pending") {
        return (
            <div className="tc-hero relative pb-16 overflow-x-hidden" data-testid="sell-pending">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16 max-w-xl">
                    <div className="bg-white border border-black/[0.06] rounded-2xl p-8 text-center text-[#0A0A0B]">
                        <div className="mx-auto w-12 h-12 rounded-full bg-[#FFF8DD] grid place-items-center">
                            <Hourglass size={22} className="text-[#8A6F00]" />
                        </div>
                        <h2 className="mt-4 text-[24px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>📋 Application under review</h2>
                        <p className="text-[#6E6E73] text-[14px] mt-2">
                            Our team typically responds within <strong>1–2 business days</strong>. You&apos;ll get an email as soon as you&apos;re approved.
                        </p>
                        {user.application?.business_name && (
                            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/[0.06] bg-black/[0.02] text-[12.5px]">
                                <span className="text-[#86868B]">Application:</span>
                                <span className="font-mono text-[#0A0A0B]">{user.application.business_name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Rejected — show banner + Resubmit CTA, form reveals on click
    if (user.application_status === "rejected") {
        return (
            <div className="tc-hero relative pb-16 overflow-x-hidden" data-testid="sell-rejected">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16 max-w-3xl">
                    <div className="bg-white border border-red-200 rounded-2xl p-5 mb-5 text-[#0A0A0B]" data-testid="rejected-banner">
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <div className="font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>❌ Application rejected</div>
                                {user.application?.rejection_reason && (
                                    <div className="text-[13px] text-[#3a3a40] mt-1.5"><span className="text-[#86868B]">Reason:</span> {user.application.rejection_reason}</div>
                                )}
                                <p className="text-[12.5px] text-[#6E6E73] mt-2">
                                    No need to create a new account — you can update your documents and resubmit using the same account.
                                </p>
                                {!showResubmit && (
                                    <Button
                                        onClick={() => setShowResubmit(true)}
                                        className="btn-cta mt-4 inline-flex items-center gap-2"
                                        data-testid="rejected-resubmit-btn"
                                    >
                                        <RefreshCw size={14} /> Update &amp; resubmit
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    {showResubmit && (
                        <div ref={formRef} className="text-white" data-testid="resubmit-form-wrap">
                            <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-white/65 mb-3 inline-flex items-center gap-2">
                                <FileText size={12} /> Resubmit application
                            </div>
                            <SellerApplicationForm />
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Buyer with no application — show the form
    return (
        <div className="tc-hero relative pb-16 overflow-x-hidden" data-testid="sell-apply">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14 max-w-3xl">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Become a seller</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Tell us about your business
                </h1>
                <p className="text-white/60 mt-3 text-[14px]">All sellers are reviewed before listings go live. This usually takes 1–2 business days.</p>
                <div className="mt-6">
                    <SellerApplicationForm />
                </div>
            </div>
        </div>
    );
}
