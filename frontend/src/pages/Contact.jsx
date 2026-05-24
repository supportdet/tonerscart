import React, { useState } from "react";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { CheckCircle2, Phone, Mail, MessageCircle, Clock } from "lucide-react";
import PhonePrefixInput from "../components/PhonePrefixInput";

export default function Contact() {
    const [form, setForm] = useState({
        name: "", company: "", email: "", phone: "", pincode: "", description: "",
    });
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.email.trim() || !form.company.trim() || !form.phone || !form.pincode) {
            toast.error("Name, company, email, phone and pincode are required"); return;
        }
        if (form.phone.length !== 10) { toast.error("Enter a valid 10-digit phone"); return; }
        if (!/^[1-9][0-9]{5}$/.test(form.pincode)) { toast.error("Enter a valid 6-digit pincode"); return; }
        setLoading(true);
        try {
            await api.post("/mps/inquiry", {
                name: form.name.trim(),
                email: form.email.trim(),
                phone: `+91 ${form.phone}`,
                description: form.description.trim(),
                estimated_printers: "—",
                selections: {
                    source: "contact_page",
                    company: form.company.trim(),
                    pincode: form.pincode,
                },
            });
            setDone(true);
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };

    return (
        <div className="bg-white" data-testid="contact-page">
            <div className="tc-container py-12 sm:py-16 max-w-5xl">
                <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Contact</div>
                <h1 className="mt-3 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                    Get in touch
                </h1>
                <p className="mt-1.5 text-[12.5px] tracking-[0.04em] text-[#86868B]" data-testid="contact-attribution">
                    TonersCart — A brand of <strong className="text-[#0A0A0B]">Digital Edge Technologies</strong> | Bangalore
                </p>
                <p className="mt-3 text-[14.5px] text-[#6E6E73] max-w-xl">
                    For dealer onboarding, bulk orders, or support — our team is one message away.
                </p>

                <div className="grid lg:grid-cols-5 gap-8 mt-10">
                    {/* Left — channels */}
                    <div className="lg:col-span-2 space-y-4">
                        <a href="tel:+919742270585" className="block bg-white border border-black/[0.06] rounded-2xl p-5 hover:border-[#00B7C7] transition" data-testid="contact-phone-1">
                            <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]"><Phone size={12} className="text-[#00B7C7]" /> Phone</div>
                            <div className="mt-1 font-mono text-[18px] font-semibold text-[#0A0A0B]">+91 97422 70585</div>
                        </a>
                        <a href="tel:+918971768796" className="block bg-white border border-black/[0.06] rounded-2xl p-5 hover:border-[#00B7C7] transition" data-testid="contact-phone-2">
                            <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]"><Phone size={12} className="text-[#00B7C7]" /> Alternate</div>
                            <div className="mt-1 font-mono text-[18px] font-semibold text-[#0A0A0B]">+91 89717 68796</div>
                        </a>
                        <a href="mailto:support@tonerscart.com" className="block bg-white border border-black/[0.06] rounded-2xl p-5 hover:border-[#00B7C7] transition" data-testid="contact-email">
                            <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]"><Mail size={12} className="text-[#00B7C7]" /> Email</div>
                            <div className="mt-1 text-[15.5px] font-semibold text-[#0A0A0B]">support@tonerscart.com</div>
                        </a>
                        <div className="bg-[#F4F4F6] rounded-2xl p-5 inline-flex items-center gap-2 text-[12.5px] text-[#3a3a40]" data-testid="contact-hours">
                            <Clock size={14} className="text-[#6E6E73]" />
                            <span><strong>Mon&ndash;Sat</strong> · 9 AM &ndash; 7 PM IST</span>
                        </div>
                        <a
                            href="https://wa.me/919742270585"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#1FB855] text-white font-semibold text-[14.5px] transition"
                            data-testid="contact-whatsapp"
                        >
                            <MessageCircle size={16} /> Chat on WhatsApp
                        </a>
                    </div>

                    {/* Right — enquiry form */}
                    <div className="lg:col-span-3">
                        {done ? (
                            <div className="bg-white border border-black/[0.06] rounded-2xl p-8 text-center" data-testid="contact-form-done">
                                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 grid place-items-center">
                                    <CheckCircle2 size={22} className="text-emerald-600" />
                                </div>
                                <h2 className="mt-4 text-[20px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Thanks, we&apos;ll be in touch</h2>
                                <p className="text-[#6E6E73] text-[14px] mt-2">Our team responds within one business day.</p>
                            </div>
                        ) : (
                            <form onSubmit={submit} className="bg-white border border-black/[0.06] rounded-2xl shadow-sm p-5 sm:p-7 space-y-4" data-testid="contact-form">
                                <div className="text-[12px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">Send us a message</div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <div><Label>Name *</Label><Input value={form.name} onChange={upd("name")} required data-testid="contact-name" /></div>
                                    <div><Label>Company *</Label><Input value={form.company} onChange={upd("company")} required data-testid="contact-company" /></div>
                                    <div><Label>Email *</Label><Input type="email" value={form.email} onChange={upd("email")} required data-testid="contact-email-input" /></div>
                                    <div>
                                        <Label>Phone *</Label>
                                        <PhonePrefixInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required testId="contact-phone-input" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <Label>Pincode *</Label>
                                        <Input
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={form.pincode}
                                            onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                                            required
                                            placeholder="6-digit pincode"
                                            data-testid="contact-pincode"
                                        />
                                    </div>
                                </div>
                                <div><Label>Message *</Label><Textarea rows={5} value={form.description} onChange={upd("description")} required placeholder="Tell us what you need — dealer onboarding, bulk order, support…" data-testid="contact-message" /></div>
                                <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="contact-submit">
                                    {loading ? "Sending…" : "Send"}
                                </Button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
