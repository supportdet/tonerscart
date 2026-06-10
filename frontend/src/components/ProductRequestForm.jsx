import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, SearchX } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCity } from "../context/CityContext";

/**
 * "Couldn't find your toner?" enquiry card + dialog.
 * Lets a buyer request a product that isn't listed yet. Records demand to
 * mps_inquiries and emails support@tonerscart.com (via POST /api/mps/inquiry
 * with selections.type = "product_request").
 *
 * Props:
 *  - category: "toner" | "printer" | "paper" | "consumable" (drives copy + label)
 */
const LABELS = {
    toner: { noun: "toner", placeholder: "e.g. HP 88A, Canon 337, Brother TN-2365" },
    printer: { noun: "printer", placeholder: "e.g. HP LaserJet M1005, Epson L3150" },
    paper: { noun: "paper", placeholder: "e.g. A4 75 GSM JK Copier" },
    consumable: { noun: "product", placeholder: "e.g. Brother DR-2305 drum" },
};

export default function ProductRequestForm({ category = "toner" }) {
    const { user } = useAuth();
    const { city: appCity } = useCity();
    const cfg = LABELS[category] || LABELS.toner;
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        product: "",
        email: user?.email || "",
        phone: "",
        city: appCity || "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const close = () => {
        setOpen(false);
        // Reset success state after the dialog closes so reopening is clean.
        setTimeout(() => setDone(false), 250);
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!form.product.trim() || !form.email.trim()) {
            toast.error("Please enter the product and your email.");
            return;
        }
        const phone = form.phone.replace(/\D/g, "").slice(-10);
        setSubmitting(true);
        try {
            await api.post("/mps/inquiry", {
                name: user?.name || "",
                email: form.email.trim(),
                phone: phone ? `+91${phone}` : "",
                description: `Buyer is looking for: ${form.product.trim()}${form.city ? ` (city: ${form.city})` : ""}`,
                selections: {
                    type: "product_request",
                    category,
                    product: form.product.trim(),
                    city: form.city || "",
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
                className="mt-10 rounded-2xl border border-[#E8E8EC] bg-white px-5 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6"
                data-testid="product-request-card"
            >
                <div className="shrink-0 w-12 h-12 rounded-xl bg-[#F5F5F7] grid place-items-center">
                    <SearchX size={22} className="text-[#00838f]" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[15px] sm:text-[16px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                        Couldn&apos;t find your {cfg.noun}?
                    </div>
                    <p className="text-[13px] text-[#6E6E73] mt-0.5">
                        Tell us what you need — we&apos;ll source it from our verified dealers and email you when it&apos;s available.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="shrink-0 h-11 px-6 rounded-xl bg-[#0A0A0B] text-white text-[13.5px] font-semibold hover:bg-[#1D1D1F] transition w-full sm:w-auto"
                    data-testid="product-request-open-btn"
                >
                    Request this {cfg.noun}
                </button>
            </div>

            {open && createPortal(
                <div
                    className="fixed inset-0 z-[120] grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
                    data-testid="product-request-dialog"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
                >
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-black/[0.06]">
                            <div>
                                <div className="text-[11px] tracking-[0.2em] uppercase font-medium text-[#00838f]">Product request</div>
                                <h3 className="text-[18px] text-[#0A0A0B] mt-1" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                                    Couldn&apos;t find your {cfg.noun}?
                                </h3>
                            </div>
                            <button onClick={close} className="p-1.5 rounded-lg hover:bg-black/5 text-[#86868B]" data-testid="product-request-close" aria-label="Close"><X size={18} /></button>
                        </div>

                        {done ? (
                            <div className="px-6 py-10 text-center" data-testid="product-request-success">
                                <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
                                <p className="mt-4 text-[15px] text-[#0A0A0B]">Got it — request received.</p>
                                <p className="mt-1 text-[13px] text-[#6E6E73] max-w-sm mx-auto">We&apos;ll source it from our verified dealers and email you the moment it&apos;s listed.</p>
                                <button onClick={close} className="mt-6 h-10 px-6 rounded-xl bg-[#0A0A0B] text-white text-[13.5px] font-semibold hover:bg-[#1D1D1F] transition" data-testid="product-request-done-btn">Done</button>
                            </div>
                        ) : (
                            <form onSubmit={submit} className="px-6 py-5 space-y-4">
                                <div>
                                    <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">What are you looking for? *</label>
                                    <input value={form.product} onChange={set("product")} placeholder={cfg.placeholder} className="w-full h-11 rounded-xl border border-[#D2D2D7] bg-white px-3 text-[14px] outline-none focus:border-[#0A0A0B]" data-testid="product-request-product" />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">Email *</label>
                                    <input type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" className="w-full h-11 rounded-xl border border-[#D2D2D7] bg-white px-3 text-[14px] outline-none focus:border-[#0A0A0B]" data-testid="product-request-email" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">Phone (optional)</label>
                                        <div className="flex items-center h-11 rounded-xl border border-[#D2D2D7] bg-white focus-within:border-[#0A0A0B] overflow-hidden">
                                            <span className="px-2.5 text-[13px] text-[#86868B] border-r border-[#E5E5E7]">+91</span>
                                            <input value={form.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} placeholder="10-digit" className="flex-1 min-w-0 px-2.5 bg-transparent outline-none text-[14px]" data-testid="product-request-phone" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">City (optional)</label>
                                        <input value={form.city} onChange={set("city")} placeholder="Bangalore" className="w-full h-11 rounded-xl border border-[#D2D2D7] bg-white px-3 text-[14px] outline-none focus:border-[#0A0A0B]" data-testid="product-request-city" />
                                    </div>
                                </div>
                                <button type="submit" disabled={submitting} className="w-full h-12 rounded-xl bg-[#F5C400] text-[#0A0A0B] text-[14px] font-semibold hover:bg-[#FFD90A] disabled:opacity-50 transition inline-flex items-center justify-center gap-2" data-testid="product-request-submit">
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {submitting ? "Sending…" : "Send request"}
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
