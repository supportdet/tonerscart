import React, { useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import PageMeta from "../components/PageMeta";
import { Mail, Loader2 } from "lucide-react";

// Generic Coming-Soon page with an email interest capture.
// Used by /consumables and /scanners.

export default function ComingSoon({ category, accent, blurb }) {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        const v = email.trim();
        if (!/^\S+@\S+\.\S+$/.test(v)) {
            toast.error("Please enter a valid email");
            return;
        }
        setSubmitting(true);
        try {
            await api.post("/mps/inquiry", {
                name: "",
                email: v,
                phone: "",
                description: `Interest capture — ${category}`,
                estimated_printers: "—",
                selections: { type: `${category.toLowerCase()}_interest`, category },
            });
            setDone(true);
            toast.success("Thanks — we'll email you the moment it goes live");
        } catch {
            toast.error("Could not register your interest. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <PageMeta title={`${category} — Coming Soon · TonersCart`} description={`${category} on TonersCart — launching soon. Get notified.`} />
            <div className="min-h-[70vh] bg-[#F5F5F7] py-16 sm:py-24" data-testid={`coming-soon-${category.toLowerCase()}`}>
                <div className="tc-container max-w-[640px]">
                    <div
                        className="rounded-[24px] bg-white border border-black/[0.06] p-8 sm:p-12 text-center"
                        style={{ boxShadow: "0 8px 40px -12px rgba(0,0,0,0.08)" }}
                    >
                        <div
                            className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-6"
                            style={{ background: `${accent}1A`, color: accent }}
                        >
                            <Mail size={22} />
                        </div>
                        <div
                            className="tc-eyebrow mb-3"
                            style={{ color: accent }}
                        >
                            Coming soon
                        </div>
                        <h1
                            className="text-[#0A0A0B] mb-4"
                            style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 400, letterSpacing: "-0.02em" }}
                            data-testid={`coming-soon-${category.toLowerCase()}-title`}
                        >
                            {category} on TonersCart
                        </h1>
                        <p className="text-[15px] text-[#6E6E73] leading-relaxed mb-8 max-w-[480px] mx-auto">
                            {blurb}
                        </p>

                        {done ? (
                            <div
                                className="rounded-2xl px-5 py-4 text-[14px] font-medium"
                                style={{ background: `${accent}10`, color: accent }}
                                data-testid={`coming-soon-${category.toLowerCase()}-success`}
                            >
                                ✓ You're on the list. We'll be in touch.
                            </div>
                        ) : (
                            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-[440px] mx-auto" data-testid={`coming-soon-${category.toLowerCase()}-form`}>
                                <input
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={submitting}
                                    className="flex-1 h-12 px-4 rounded-xl border border-[#D2D2D7] bg-white text-[14px] text-[#0A0A0B] placeholder:text-[#86868B] focus:outline-none focus:border-[#0A0A0B] disabled:opacity-60"
                                    data-testid={`coming-soon-${category.toLowerCase()}-email`}
                                />
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="h-12 px-6 rounded-xl text-[13px] font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                                    style={{ background: accent }}
                                    data-testid={`coming-soon-${category.toLowerCase()}-submit`}
                                >
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {submitting ? "Sending…" : "Notify me"}
                                </button>
                            </form>
                        )}

                        <div className="mt-6 text-[11.5px] text-[#86868B]">
                            We'll only email you once — when {category.toLowerCase()} go live on TonersCart.
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
