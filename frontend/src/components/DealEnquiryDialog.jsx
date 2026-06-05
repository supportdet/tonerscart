import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// High-value (deal-basis) enquiry form. Shown for products above ₹1,50,000
// where online checkout is replaced by a "request demo & custom pricing" flow.
export default function DealEnquiryDialog({ product, onClose }) {
    const { user } = useAuth();
    const [form, setForm] = useState({
        name: user?.name || "",
        email: user?.email || "",
        phone: "",
        city: product?.city || "",
        notes: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
            toast.error("Please fill name, email and phone.");
            return;
        }
        setSubmitting(true);
        try {
            await api.post("/mps/inquiry", {
                name: form.name.trim(),
                email: form.email.trim(),
                phone: `+91${form.phone.replace(/\D/g, "").slice(-10)}`,
                description: `High-value (deal-basis) enquiry for ${product?.title} (${fmtMoney(product?.price)}) · Qty ${product?.qty || 1}${form.notes ? ` · ${form.notes}` : ""}`,
                estimated_printers: String(product?.qty || 1),
                selections: {
                    type: "deal_enquiry",
                    product: product?.title,
                    price: product?.price,
                    qty: product?.qty || 1,
                    city: form.city,
                    kind: product?.kind,
                    listing_id: product?.id,
                },
            });
            setDone(true);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center p-4 bg-black/40 backdrop-blur-sm" data-testid="deal-enquiry-dialog" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-black/[0.06]">
                    <div>
                        <div className="text-[11px] tracking-[0.2em] uppercase font-medium text-[#00838f]">Deal-basis item</div>
                        <h3 className="text-[18px] text-[#0A0A0B] mt-1" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>Request pricing &amp; demo</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 text-[#86868B]" data-testid="deal-enquiry-close" aria-label="Close"><X size={18} /></button>
                </div>

                {done ? (
                    <div className="px-6 py-10 text-center" data-testid="deal-enquiry-success">
                        <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
                        <p className="mt-4 text-[15px] text-[#0A0A0B]">Thanks — your request is in.</p>
                        <p className="mt-1 text-[13px] text-[#6E6E73] max-w-sm mx-auto">Our team will reach out shortly with custom pricing and a demo for <strong>{product?.title}</strong>.</p>
                        <button onClick={onClose} className="mt-6 h-10 px-6 rounded-xl bg-[#0A0A0B] text-white text-[13.5px] font-semibold hover:bg-[#1D1D1F] transition" data-testid="deal-enquiry-done-btn">Done</button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="px-6 py-5 space-y-4">
                        <p className="text-[13px] text-[#6E6E73]">
                            <strong className="text-[#0A0A0B]">{product?.title}</strong> ({fmtMoney(product?.price)}) is a high-value item handled on a deal basis. Share your details and our team will send custom pricing and arrange a demo.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Field label="Full name *" value={form.name} onChange={set("name")} testid="deal-name" />
                            <Field label="Email *" type="email" value={form.email} onChange={set("email")} testid="deal-email" />
                            <div>
                                <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">Phone *</label>
                                <div className="flex items-center h-11 rounded-xl border border-[#D2D2D7] bg-white focus-within:border-[#0A0A0B] overflow-hidden">
                                    <span className="px-3 text-[13px] text-[#86868B] border-r border-[#E5E5E7]">+91</span>
                                    <input value={form.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} placeholder="10-digit number" className="flex-1 min-w-0 px-3 bg-transparent outline-none text-[14px]" data-testid="deal-phone" />
                                </div>
                            </div>
                            <Field label="City" value={form.city} onChange={set("city")} testid="deal-city" />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">Requirements (optional)</label>
                            <textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Quantity, timeline, installation/demo needs…" className="w-full rounded-xl border border-[#D2D2D7] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#0A0A0B] resize-none" data-testid="deal-notes" />
                        </div>
                        <button type="submit" disabled={submitting} className="w-full h-12 rounded-xl bg-[#F5C400] text-[#0A0A0B] text-[14px] font-semibold hover:bg-[#FFD90A] disabled:opacity-50 transition inline-flex items-center justify-center gap-2" data-testid="deal-enquiry-submit">
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                            {submitting ? "Sending…" : "Send request"}
                        </button>
                    </form>
                )}
            </div>
        </div>,
        document.body
    );
}

function Field({ label, value, onChange, type = "text", testid }) {
    return (
        <div>
            <label className="block text-[12px] font-medium text-[#3a3a40] mb-1">{label}</label>
            <input type={type} value={value} onChange={onChange} className="w-full h-11 rounded-xl border border-[#D2D2D7] bg-white px-3 text-[14px] outline-none focus:border-[#0A0A0B]" data-testid={testid} />
        </div>
    );
}
