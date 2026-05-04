import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { CheckCircle2, Users } from "lucide-react";

export default function MPSContact() {
    const location = useLocation();
    const navigate = useNavigate();
    const selections = location.state?.selections || {};
    const count = selections.count || "10+";
    const [form, setForm] = useState({ name: "", email: "", phone: "", description: "" });
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
            toast.error("Name, email and phone are required");
            return;
        }
        setLoading(true);
        try {
            await api.post("/mps/inquiry", {
                ...form,
                estimated_printers: count,
                selections,
            });
            setDone(true);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setLoading(false);
        }
    };

    if (done) {
        return (
            <div className="tc-hero relative pb-20" data-testid="mps-contact-done">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-14 max-w-xl">
                    <div className="bg-white border border-black/[0.06] rounded-2xl p-8 text-center text-[#0A0A0B]">
                        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 grid place-items-center">
                            <CheckCircle2 size={22} className="text-emerald-600" />
                        </div>
                        <h2 className="mt-4 text-[22px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Thanks {form.name.split(" ")[0]}, we&apos;ll be in touch</h2>
                        <p className="text-[#6E6E73] text-[14px] mt-2">Our MPS team has received your enquiry and will reach out within one business day with tailored recommendations.</p>
                        <Button onClick={() => navigate("/")} className="btn-cta mt-6" data-testid="mps-contact-home-btn">Back to home</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="tc-hero relative pb-20" data-testid="mps-contact-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14 max-w-2xl">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Managed Print Services · Enterprise fleet</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Talk to our MPS team
                </h1>
                <p className="text-white/65 mt-3 text-[14px] max-w-xl">
                    For fleets of <strong className="text-white">{count}</strong> printers, we build custom proposals — hardware, consumables, SLAs and remote monitoring bundled under one contract. Drop your details and a specialist will get back to you.
                </p>

                <form onSubmit={submit} className="mt-6 bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-7 space-y-4 text-[#0A0A0B]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><Label>Full name *</Label><Input value={form.name} onChange={upd("name")} required data-testid="mps-contact-name" /></div>
                        <div><Label>Company email *</Label><Input type="email" value={form.email} onChange={upd("email")} required data-testid="mps-contact-email" /></div>
                    </div>
                    <div><Label>Phone *</Label><Input value={form.phone} onChange={upd("phone")} placeholder="+91-..." required data-testid="mps-contact-phone" /></div>
                    <div>
                        <Label>Requirement description</Label>
                        <Textarea rows={4} value={form.description} onChange={upd("description")} placeholder="Fleet size, current pain points, timeline, existing vendors, etc." data-testid="mps-contact-description" />
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-[#F5F5F7] border border-black/[0.06] text-[12.5px] text-[#1D1D1F]">
                        <Users size={14} className="mt-0.5 shrink-0" />
                        <div>Based on your answers so far, our team will tailor the proposal around your volume, paper sizes and connectivity needs.</div>
                    </div>
                    <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="mps-contact-submit">
                        {loading ? "Sending…" : "Send enquiry"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
