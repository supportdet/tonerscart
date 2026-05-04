import React, { useState } from "react";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { CheckCircle2, Phone, Mail, Headphones } from "lucide-react";

export default function MPS() {
    const [form, setForm] = useState({ name: "", email: "", phone: "", description: "" });
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
            toast.error("Name, email and phone are required"); return;
        }
        setLoading(true);
        try {
            await api.post("/mps/inquiry", {
                ...form,
                estimated_printers: "—",
                selections: {},
            });
            setDone(true);
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };

    return (
        <div className="tc-hero relative pb-20" data-testid="mps-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14 max-w-5xl">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Managed Print Services</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Talk to our MPS team
                </h1>
                <p className="text-white/65 mt-3 text-[14.5px] max-w-2xl">
                    Tell us what you&apos;re looking for and our team will get back to you within one business day with tailored recommendations.
                </p>

                <div className="mt-8 grid lg:grid-cols-3 gap-6">
                    {/* Form */}
                    <div className="lg:col-span-2">
                        {done ? (
                            <div className="bg-white border border-black/[0.06] rounded-2xl p-8 text-center text-[#0A0A0B]" data-testid="mps-done">
                                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 grid place-items-center">
                                    <CheckCircle2 size={22} className="text-emerald-600" />
                                </div>
                                <h2 className="mt-4 text-[22px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Thanks {form.name.split(" ")[0]}, we&apos;ll be in touch</h2>
                                <p className="text-[#6E6E73] text-[14px] mt-2">Your enquiry is in our inbox. A specialist will reach out shortly.</p>
                            </div>
                        ) : (
                            <form onSubmit={submit} className="bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-7 space-y-4 text-[#0A0A0B]" data-testid="mps-form">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Label>Full name *</Label><Input value={form.name} onChange={upd("name")} required data-testid="mps-name" /></div>
                                    <div><Label>Email *</Label><Input type="email" value={form.email} onChange={upd("email")} required data-testid="mps-email" /></div>
                                </div>
                                <div><Label>Phone *</Label><Input value={form.phone} onChange={upd("phone")} placeholder="+91-..." required data-testid="mps-phone" /></div>
                                <div>
                                    <Label>What are you looking for?</Label>
                                    <Textarea rows={5} value={form.description} onChange={upd("description")} placeholder="Tell us about your fleet size, current pain points, timeline…" data-testid="mps-description" />
                                </div>
                                <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="mps-submit">
                                    {loading ? "Sending…" : "Send"}
                                </Button>
                            </form>
                        )}
                    </div>

                    {/* Contact sidebar */}
                    <aside className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-2xl p-5 text-white h-fit" data-testid="mps-contact-info">
                        <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-semibold text-white/70 mb-4">
                            <Headphones size={13} /> Need help right now?
                        </div>
                        <p className="text-[13px] text-white/65 leading-relaxed mb-5">For further assistance, contact:</p>
                        <a href="tel:+919742270585" className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition mb-2" data-testid="mps-phone-link">
                            <Phone size={16} className="text-[#00B7C7]" />
                            <div>
                                <div className="text-[10px] tracking-[0.12em] uppercase text-white/50">Phone</div>
                                <div className="text-[14px] font-semibold">+91 97422 70585</div>
                            </div>
                        </a>
                        <a href="mailto:support@tonerscart.com" className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition" data-testid="mps-email-link">
                            <Mail size={16} className="text-[#00B7C7]" />
                            <div>
                                <div className="text-[10px] tracking-[0.12em] uppercase text-white/50">Email</div>
                                <div className="text-[14px] font-semibold">support@tonerscart.com</div>
                            </div>
                        </a>
                    </aside>
                </div>
            </div>
        </div>
    );
}
