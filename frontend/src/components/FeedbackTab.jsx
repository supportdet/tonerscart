import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

/**
 * Fixed right-edge "Feedback" tab (rotated 90°). Appears only after the user
 * scrolls past the hero (~480px). Clicking opens a feedback dialog that records
 * to mps_inquiries + emails support@tonerscart.com (POST /api/mps/inquiry with
 * selections.type = "feedback").
 */
export default function FeedbackTab() {
    const { user } = useAuth();
    const [visible, setVisible] = useState(false);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ email: user?.email || "", message: "" });
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 480);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const close = () => {
        setOpen(false);
        setTimeout(() => setDone(false), 250);
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!form.message.trim()) {
            toast.error("Please share your feedback.");
            return;
        }
        setSubmitting(true);
        try {
            await api.post("/mps/inquiry", {
                name: user?.name || "",
                email: (form.email || "").trim() || "anonymous@tonerscart.com",
                description: form.message.trim(),
                selections: {
                    type: "feedback",
                    page: typeof window !== "undefined" ? window.location.pathname : "",
                },
            });
            setDone(true);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <div
                className={`fixed right-0 top-[42%] z-[110] transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                style={{ transformOrigin: "bottom right", transform: "rotate(-90deg)" }}
            >
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Send feedback"
                data-testid="feedback-tab"
                className="inline-flex items-center gap-1.5 bg-[#00B7C7] text-white text-[12px] font-semibold tracking-wide px-3.5 py-2 rounded-t-lg shadow-lg hover:bg-[#00A0AF] transition-colors"
            >
                <MessageSquareText size={14} /> Feedback
            </button>
            </div>

            {open && createPortal(
                <div
                    className="fixed inset-0 z-[130] grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
                    data-testid="feedback-dialog"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
                >
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-black/[0.06]">
                            <div>
                                <div className="text-[11px] tracking-[0.2em] uppercase font-medium text-[#00838f]">We&apos;re listening</div>
                                <h3 className="text-[18px] text-[#0A0A0B] mt-1" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>Share your feedback</h3>
                            </div>
                            <button onClick={close} className="p-1.5 rounded-lg hover:bg-black/5 text-[#86868B]" data-testid="feedback-close" aria-label="Close"><X size={18} /></button>
                        </div>

                        {done ? (
                            <div className="px-6 py-10 text-center" data-testid="feedback-success">
                                <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
                                <p className="mt-4 text-[15px] text-[#0A0A0B]">Thank you for the feedback!</p>
                                <p className="mt-1 text-[13px] text-[#6E6E73] max-w-sm mx-auto">It helps us make TonersCart better. Our team reads every message.</p>
                                <button onClick={close} className="mt-6 h-10 px-6 rounded-xl bg-[#0A0A0B] text-white text-[13.5px] font-semibold hover:bg-[#1D1D1F] transition" data-testid="feedback-done-btn">Done</button>
                            </div>
                        ) : (
                            <form onSubmit={submit} className="px-6 py-5 space-y-4">
                                <div>
                                    <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">Your feedback *</label>
                                    <textarea value={form.message} onChange={set("message")} rows={4} placeholder="What did you love? What could be better? Found a bug?" className="w-full rounded-xl border border-[#D2D2D7] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#0A0A0B] resize-none" data-testid="feedback-message" />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">Email (optional)</label>
                                    <input type="email" value={form.email} onChange={set("email")} placeholder="you@company.com — if you'd like a reply" className="w-full h-11 rounded-xl border border-[#D2D2D7] bg-white px-3 text-[14px] outline-none focus:border-[#0A0A0B]" data-testid="feedback-email" />
                                </div>
                                <button type="submit" disabled={submitting} className="w-full h-12 rounded-xl bg-[#F5C400] text-[#0A0A0B] text-[14px] font-semibold hover:bg-[#FFD90A] disabled:opacity-50 transition inline-flex items-center justify-center gap-2" data-testid="feedback-submit">
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {submitting ? "Sending…" : "Send feedback"}
                                </button>
                            </form>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
