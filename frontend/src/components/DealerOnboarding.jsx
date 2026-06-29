import React from "react";
import { Link } from "react-router-dom";
import { Check, Lock, ArrowRight, ShieldCheck, FileText, Building2, Rocket, Mail } from "lucide-react";
import { Button } from "./ui/button";

/**
 * Wave 100 — Dealer onboarding gateway.
 *
 * Shown in place of the normal supplier dashboard until the dealer is fully
 * verified. All "Add product / Bulk upload / Edit listings" CTAs are HIDDEN
 * (not just disabled) so there is zero ambiguity about live status.
 *
 * 4 steps:
 *   1. Account created          — auto (always ✅ on this page)
 *   2. Business details         — fill via the existing /sell form
 *   3. Bank details + documents — unlocks after Step 2 approval
 *   4. Go live                  — unlocks after Step 3 approved
 *
 * Props:
 *   stage     – "no_app" | "pending" | "approved_phase2" | "phase2_review"
 *   user      – /auth/me payload (for the email + name in headings)
 *   onStartStep2 – fired when "Fill business details" is clicked
 *                  (parent opens the SellerApplicationForm dialog)
 *   onOpenPhase2 – fired when "Add bank details / Upload documents" is clicked
 */
export default function DealerOnboarding({ stage, user, onStartStep2, onOpenPhase2 }) {
    const steps = [
        {
            id: 1,
            title: "Account created",
            body: "Your TonersCart seller account is live.",
            Icon: ShieldCheck,
            status: "done",
        },
        {
            id: 2,
            title: "Business details",
            body: stage === "pending"
                ? "Submitted — under review. We'll email you in 1–2 business days."
                : "Add your GSTIN, PAN, what you sell, and the cities you serve.",
            Icon: Building2,
            status: stage === "no_app" ? "current" : "done",
            cta: stage === "no_app" ? { label: "Fill business details", onClick: onStartStep2 } : null,
        },
        {
            id: 3,
            title: "Bank details + KYC documents",
            body: stage === "approved_phase2"
                ? "Bank account + GST, PAN, ID & cancelled-cheque uploads."
                : stage === "phase2_review"
                ? "Documents submitted — under review. Your listings will go live once verified."
                : "Unlocks after your business details are approved.",
            Icon: FileText,
            status:
                stage === "approved_phase2" ? "current"
                : stage === "phase2_review" ? "done"
                : "locked",
            cta: stage === "approved_phase2" ? { label: "Add bank details & upload documents", onClick: onOpenPhase2 } : null,
        },
        {
            id: 4,
            title: "Go live",
            body: stage === "phase2_review"
                ? "Pending final verification — usually within one business day."
                : "Once verified you can list products and start selling.",
            Icon: Rocket,
            status: "locked",
        },
    ];

    return (
        <div className="bg-[#F4F4F6] min-h-[calc(100vh-180px)]" data-testid="dealer-onboarding">
            <div className="tc-container py-8 sm:py-12 max-w-3xl">
                <div className="flex items-center gap-3 mb-4">
                    <span className="tc-strip" />
                    <span className="text-[10.5px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">Seller onboarding</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] font-light text-[#0A0A0B] leading-tight" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.02em" }}>
                    Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
                </h1>
                <p className="mt-2 text-[14px] text-[#6E6E73]">
                    {stage === "pending"
                        ? "Your business details are being reviewed. We'll email you the moment they're approved."
                        : stage === "phase2_review"
                        ? "Documents submitted — pending final verification. We'll unlock listing as soon as it's done."
                        : stage === "approved_phase2"
                        ? "Business details approved! Complete bank details + documents to go live."
                        : "Three quick steps and you're live. Most dealers complete this in 5 minutes."}
                </p>

                {/* Pending banner — Step 2 review */}
                {stage === "pending" && (
                    <div className="mt-5 rounded-xl bg-[#FFFBEB] border border-[#F5C400]/40 p-4 text-[13.5px] text-[#5C4A00] flex items-start gap-3" data-testid="onboarding-pending-step2">
                        <Mail size={16} className="mt-0.5 shrink-0" />
                        <div>
                            <strong>Business details submitted — under review.</strong> You&apos;ll get an email once approved (usually 1–2 business days). Bank details and documents will unlock after approval.
                        </div>
                    </div>
                )}
                {stage === "phase2_review" && (
                    <div className="mt-5 rounded-xl bg-[#FFFBEB] border border-[#F5C400]/40 p-4 text-[13.5px] text-[#5C4A00] flex items-start gap-3" data-testid="onboarding-pending-phase2">
                        <Mail size={16} className="mt-0.5 shrink-0" />
                        <div>
                            <strong>Documents submitted — under review.</strong> Your listings will go live once verified.
                        </div>
                    </div>
                )}

                <div className="mt-6 space-y-3" data-testid="onboarding-steps">
                    {steps.map((s) => <StepCard key={s.id} {...s} />)}
                </div>

                <div className="mt-7 text-[12.5px] text-[#6E6E73] flex items-center gap-2">
                    Questions? <Link to="/contact" className="text-[#00B7C7] hover:underline font-semibold">Contact our team</Link>
                </div>
            </div>
        </div>
    );
}

function StepCard({ id, title, body, Icon, status, cta }) {
    const styles =
        status === "done"
            ? "bg-white border-emerald-200"
            : status === "current"
            ? "bg-white border-[#00B7C7] shadow-md"
            : "bg-[#FAFAFC] border-[#E5E5EA] opacity-80";
    const badge =
        status === "done" ? <Check size={14} /> :
        status === "current" ? <span className="text-[10px] font-bold">{id}</span> :
        <Lock size={12} />;
    const badgeStyle =
        status === "done" ? "bg-emerald-500 text-white" :
        status === "current" ? "bg-[#00B7C7] text-white animate-pulse" :
        "bg-[#E5E5EA] text-[#6E6E73]";
    return (
        <div className={`rounded-xl border-2 p-4 transition-all flex items-start gap-4 ${styles}`} data-testid={`onboarding-step-${id}`}>
            <div className={`shrink-0 w-8 h-8 rounded-full grid place-items-center ${badgeStyle}`}>{badge}</div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <Icon size={15} className={status === "locked" ? "text-[#86868B]" : "text-[#0A0A0B]"} />
                    <div className={`text-[14.5px] font-semibold ${status === "locked" ? "text-[#6E6E73]" : "text-[#0A0A0B]"}`} style={{ fontFamily: "'Montserrat', sans-serif" }}>
                        Step {id} — {title}
                    </div>
                </div>
                <div className={`mt-1 text-[12.5px] leading-relaxed ${status === "locked" ? "text-[#86868B]" : "text-[#6E6E73]"}`}>{body}</div>
                {cta && (
                    <div className="mt-3">
                        <Button type="button" onClick={cta.onClick} className="btn-cta inline-flex items-center gap-1.5 h-9 text-[12.5px]" data-testid={`onboarding-cta-step-${id}`}>
                            {cta.label} <ArrowRight size={14} />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
