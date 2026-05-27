import React, { useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import PageMeta from "../components/PageMeta";
import { Loader2, Building2, ShieldCheck, Sparkles, Mail } from "lucide-react";

const ACCENT = "#6d4c41";

const PARTNER_SLOTS = [
    { label: "Partner slot available", tagline: "Premium OEM showcase" },
    { label: "Partner slot available", tagline: "Verified manufacturer" },
    { label: "Partner slot available", tagline: "Exclusive dealer pricing" },
];

export default function OEM() {
    const [open, setOpen] = useState(false);
    const [company, setCompany] = useState("");
    const [brand, setBrand] = useState("");
    const [contact, setContact] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [products, setProducts] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!company.trim() || !brand.trim() || !contact.trim() || !products.trim()) {
            toast.error("Please fill all required fields");
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error("Please enter a valid email"); return; }
        const cleanedPhone = phone.replace(/\D/g, "").slice(-10);
        if (cleanedPhone.length !== 10) { toast.error("Please enter a valid 10-digit mobile number"); return; }

        setSubmitting(true);
        try {
            await api.post("/mps/inquiry", {
                name: contact.trim(),
                email: email.trim(),
                phone: `+91${cleanedPhone}`,
                description: products.trim(),
                estimated_printers: "—",
                selections: {
                    type: "oem_application",
                    company: company.trim(),
                    brand: brand.trim(),
                    products: products.trim(),
                },
            });
            setDone(true);
            toast.success("OEM application received");
        } catch {
            toast.error("Could not submit. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <PageMeta title="OEM Marketplace · TonersCart" description="Discover new products directly from manufacturers. Exclusive dealer pricing, verified authenticity." />
            <div className="min-h-[80vh]" style={{ background: "#0A0A0B", color: "#F5F5F7" }} data-testid="oem-page">
                {/* Hero */}
                <div className="tc-container max-w-[1100px] py-16 sm:py-24 text-center">
                    <div
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-[0.18em] uppercase font-semibold mb-6"
                        style={{ background: `${ACCENT}26`, color: "#D7C2B8" }}
                    >
                        <Sparkles size={11} /> OEM Marketplace
                    </div>
                    <h1
                        className="mb-5"
                        style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(34px, 6vw, 64px)", fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1.05 }}
                        data-testid="oem-heading"
                    >
                        OEM Partner Showcase
                    </h1>
                    <p className="text-[16px] sm:text-[17px] text-white/70 max-w-[640px] mx-auto leading-relaxed mb-10" data-testid="oem-subheading">
                        Discover new products directly from manufacturers. Exclusive dealer pricing, verified authenticity.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
                        {PARTNER_SLOTS.map((p, i) => (
                            <div
                                key={i}
                                className="rounded-[20px] p-8 text-left flex flex-col"
                                style={{
                                    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
                                    border: "1px dashed rgba(255,255,255,0.18)",
                                    minHeight: 220,
                                }}
                                data-testid={`oem-partner-slot-${i}`}
                            >
                                <div
                                    className="w-10 h-10 rounded-xl grid place-items-center mb-4"
                                    style={{ background: `${ACCENT}33`, color: "#D7C2B8" }}
                                >
                                    <Building2 size={16} />
                                </div>
                                <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold mb-2" style={{ color: "#D7C2B8" }}>
                                    {p.tagline}
                                </div>
                                <div className="text-[18px] font-semibold text-white mb-3">{p.label}</div>
                                <div className="flex-1" />
                                <div className="text-[12px] text-white/55 leading-relaxed">
                                    Reserve this slot to showcase your products directly to verified dealers across India.
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                        <button
                            onClick={() => setOpen(true)}
                            className="h-12 px-7 rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2"
                            style={{ background: "#FFC107", color: "#0A0A0B" }}
                            data-testid="oem-apply-btn"
                        >
                            Apply to showcase
                        </button>
                        <a
                            href="mailto:support@tonerscart.com"
                            className="h-12 px-6 rounded-xl text-[13.5px] font-medium inline-flex items-center justify-center gap-2 text-white/85 hover:text-white"
                            style={{ border: "1px solid rgba(255,255,255,0.18)" }}
                            data-testid="oem-contact-mail"
                        >
                            <Mail size={14} /> Contact support@tonerscart.com
                        </a>
                    </div>

                    <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12.5px] text-white/55 max-w-[760px] mx-auto">
                        <div className="flex items-center gap-2 justify-center"><ShieldCheck size={14} /> Verified manufacturers only</div>
                        <div className="flex items-center gap-2 justify-center"><Building2 size={14} /> Direct dealer reach</div>
                        <div className="flex items-center gap-2 justify-center"><Sparkles size={14} /> Featured placement</div>
                    </div>
                </div>

                {/* Application form modal */}
                {open && (
                    <div
                        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                        onClick={() => !submitting && setOpen(false)}
                        data-testid="oem-modal"
                    >
                        <div
                            className="bg-white text-[#0A0A0B] rounded-[20px] w-full max-w-[560px] max-h-[92vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 sm:p-8">
                                {done ? (
                                    <div className="text-center py-6" data-testid="oem-success">
                                        <div className="text-[40px] mb-3" style={{ color: ACCENT }}>✓</div>
                                        <h2 className="text-[20px] font-semibold mb-2">Application received</h2>
                                        <p className="text-[14px] text-[#6E6E73] mb-6">Our team will reach out within 2 business days.</p>
                                        <button
                                            onClick={() => { setOpen(false); setDone(false); }}
                                            className="text-[13px] font-semibold underline hover:text-[#00B7C7]"
                                            data-testid="oem-close"
                                        >
                                            Close
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={submit} className="space-y-3.5" data-testid="oem-form">
                                        <h2 className="text-[20px] font-semibold mb-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>OEM Partner Application</h2>
                                        <p className="text-[13px] text-[#6E6E73] mb-4">Share a few details. We'll get back within 48 hours.</p>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Company name *</label>
                                                <input value={company} onChange={(e) => setCompany(e.target.value)} required
                                                    className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                                    data-testid="oem-company" />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Brand *</label>
                                                <input value={brand} onChange={(e) => setBrand(e.target.value)} required
                                                    className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                                    data-testid="oem-brand" />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Contact person *</label>
                                                <input value={contact} onChange={(e) => setContact(e.target.value)} required
                                                    className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                                    data-testid="oem-contact" />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Phone *</label>
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex h-11 items-center px-3 rounded-xl border border-[#D2D2D7] bg-[#F5F5F7] text-[14px] font-medium text-[#6E6E73]">+91</span>
                                                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={10}
                                                        className="flex-1 h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                                        data-testid="oem-phone" />
                                                </div>
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-[12px] font-medium mb-1">Email *</label>
                                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                                    className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                                    data-testid="oem-email" />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-[12px] font-medium mb-1">Products you offer *</label>
                                                <textarea rows={3} value={products} onChange={(e) => setProducts(e.target.value)} required
                                                    placeholder="e.g. Compatible toner cartridges for HP, Canon, Brother. MOQ 100 pcs."
                                                    className="w-full px-3 py-2.5 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B] resize-none"
                                                    data-testid="oem-products" />
                                            </div>
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <button type="button" onClick={() => setOpen(false)}
                                                className="flex-1 h-11 rounded-xl text-[13px] font-semibold border border-[#D2D2D7] hover:bg-black/[0.04]"
                                                data-testid="oem-cancel">Cancel</button>
                                            <button type="submit" disabled={submitting}
                                                className="flex-1 h-11 rounded-xl text-[13px] font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                                                style={{ background: ACCENT }}
                                                data-testid="oem-submit">
                                                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                                                {submitting ? "Submitting…" : "Submit application"}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
