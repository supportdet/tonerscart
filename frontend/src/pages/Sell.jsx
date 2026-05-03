import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SellerApplicationForm from "../components/SellerApplicationForm";
import { Button } from "../components/ui/button";
import { Hourglass, AlertTriangle, ArrowRight } from "lucide-react";

export default function Sell() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    // Approved sellers go straight to the dashboard
    useEffect(() => {
        if (!loading && user?.role === "supplier") {
            navigate("/supplier", { replace: true });
        }
    }, [user, loading, navigate]);

    if (loading) {
        return <div className="tc-container py-24 text-white/70" data-testid="sell-loading">Loading…</div>;
    }

    // Guest: prompt sign-in but don't bounce off — give context first
    if (!user) {
        return (
            <div className="tc-hero relative pb-16" data-testid="sell-guest">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16 max-w-2xl">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Become a seller</span>
                    </div>
                    <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                        Sell printer toners on TonersCart
                    </h1>
                    <p className="text-white/65 mt-4 text-[14.5px] max-w-xl">
                        Reach verified buyers across India. Sign in to your TonersCart account to start your seller application — it takes a few minutes.
                    </p>
                    <div className="mt-7 flex items-center gap-3">
                        <Button onClick={() => navigate("/login?next=/sell")} className="btn-cta inline-flex items-center gap-2" data-testid="sell-signin-btn">
                            Sign in to continue <ArrowRight size={14} />
                        </Button>
                        <Button onClick={() => navigate("/register?next=/sell")} variant="outline" className="text-[#0A0A0B] bg-white" data-testid="sell-signup-btn">
                            Create account
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Pending application
    if (user.application_status === "pending") {
        return (
            <div className="tc-hero relative pb-16" data-testid="sell-pending">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16 max-w-xl">
                    <div className="bg-white border border-black/[0.06] rounded-2xl p-8 text-center text-[#0A0A0B]">
                        <div className="mx-auto w-12 h-12 rounded-full bg-[#FFF8DD] grid place-items-center">
                            <Hourglass size={22} className="text-[#8A6F00]" />
                        </div>
                        <h2 className="mt-4 text-[24px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Application under review</h2>
                        <p className="text-[#6E6E73] text-[14px] mt-2">
                            Thanks for applying! Our admin team is reviewing your business details. You&apos;ll get an email as soon as you&apos;re approved.
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

    // Rejected — allow re-apply
    if (user.application_status === "rejected") {
        return (
            <div className="tc-hero relative pb-16" data-testid="sell-rejected">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16 max-w-3xl">
                    <div className="bg-white border border-red-200 rounded-2xl p-5 mb-5 text-[#0A0A0B] flex items-start gap-3">
                        <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
                        <div>
                            <div className="font-semibold">Your previous application was not approved</div>
                            {user.application?.rejection_reason && (
                                <div className="text-[13px] text-[#6E6E73] mt-1">Reason: {user.application.rejection_reason}</div>
                            )}
                            <div className="text-[12.5px] text-[#6E6E73] mt-2">You can update the details and submit again below.</div>
                        </div>
                    </div>
                    <div className="text-white">
                        <SellerApplicationForm />
                    </div>
                </div>
            </div>
        );
    }

    // Buyer with no application — show the form
    return (
        <div className="tc-hero relative pb-16" data-testid="sell-apply">
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
