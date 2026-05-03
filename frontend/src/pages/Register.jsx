import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";

const TURNOVER = ["< ₹10 Lakh", "₹10 – 50 Lakh", "₹50 Lakh – 2 Cr", "₹2 – 10 Cr", "₹10 Cr+"];

export default function Register() {
    const { signupCustomer, signupSupplier } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [role, setRole] = useState(params.get("role") === "supplier" ? "supplier" : "customer");
    const [loading, setLoading] = useState(false);

    // Customer
    const [c, setC] = useState({ email: "", password: "", name: "", phone: "", city: "" });
    const updC = (k) => (e) => setC({ ...c, [k]: e.target.value });

    // Supplier
    const [s, setS] = useState({
        email: "", password: "",
        business_name: "", contact_person: "", phone: "", city: "",
        gst_number: "", annual_turnover: "", business_address: "",
    });
    const updS = (k) => (e) => setS({ ...s, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (role === "customer") {
                await signupCustomer(c);
                toast.success("Welcome to TonersCart!");
                navigate("/customer");
            } else {
                await signupSupplier(s);
                toast.success("Application submitted — pending admin approval");
                navigate("/supplier");
            }
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tc-container py-8 sm:py-12 max-w-3xl" data-testid="register-page">
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Create account</div>
            <h1 className="text-[#0A0A0B] mt-2" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 3.4vw, 44px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                Join the TonersCart trade network
            </h1>

            <div className="mt-5 sm:mt-6 grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg w-full sm:max-w-sm">
                <button type="button" onClick={() => setRole("customer")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "customer" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-slate-500"}`} data-testid="role-customer-tab">I&apos;m a Buyer</button>
                <button type="button" onClick={() => setRole("supplier")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "supplier" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-slate-500"}`} data-testid="role-supplier-tab">I&apos;m a Supplier</button>
            </div>

            <form onSubmit={submit} className="mt-5 sm:mt-6 tc-card-flat p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {role === "customer" ? (
                    <>
                        <div className="sm:col-span-2"><Label>Full name</Label><Input value={c.name} onChange={updC("name")} required data-testid="register-name-input" /></div>
                        <div><Label>Email</Label><Input type="email" value={c.email} onChange={updC("email")} required data-testid="register-email-input" /></div>
                        <div><Label>Password</Label><Input type="password" value={c.password} onChange={updC("password")} required minLength={6} data-testid="register-password-input" /></div>
                        <div><Label>Phone</Label><Input value={c.phone} onChange={updC("phone")} placeholder="+91-..." data-testid="register-phone-input" /></div>
                        <div><Label>City</Label><Input value={c.city} onChange={updC("city")} data-testid="register-city-input" /></div>
                        <div className="sm:col-span-2">
                            <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="register-submit-btn">
                                {loading ? "Creating account…" : "Create account"}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="sm:col-span-2 -mb-2">
                            <div className="text-[12px] font-semibold text-[#0A0A0B] uppercase tracking-wider" style={{ fontFamily: "'Montserrat', sans-serif" }}>1. Account</div>
                        </div>
                        <div><Label>Email</Label><Input type="email" value={s.email} onChange={updS("email")} required data-testid="register-email-input" /></div>
                        <div><Label>Password</Label><Input type="password" value={s.password} onChange={updS("password")} required minLength={6} data-testid="register-password-input" /></div>

                        <div className="sm:col-span-2 mt-3 -mb-2">
                            <div className="text-[12px] font-semibold text-[#0A0A0B] uppercase tracking-wider" style={{ fontFamily: "'Montserrat', sans-serif" }}>2. Business details</div>
                        </div>
                        <div className="sm:col-span-2"><Label>Business name</Label><Input value={s.business_name} onChange={updS("business_name")} required data-testid="register-business-name-input" /></div>
                        <div><Label>Contact person</Label><Input value={s.contact_person} onChange={updS("contact_person")} required data-testid="register-contact-person-input" /></div>
                        <div><Label>Phone</Label><Input value={s.phone} onChange={updS("phone")} placeholder="+91-..." required data-testid="register-phone-input" /></div>
                        <div><Label>City</Label><Input value={s.city} onChange={updS("city")} required data-testid="register-city-input" /></div>
                        <div><Label>GST number</Label><Input value={s.gst_number} onChange={updS("gst_number")} placeholder="29ABCDE1234F1Z5" data-testid="register-gst-input" /></div>
                        <div className="sm:col-span-2">
                            <Label>Annual turnover</Label>
                            <select value={s.annual_turnover} onChange={updS("annual_turnover")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="register-turnover-select">
                                <option value="">Select…</option>
                                {TURNOVER.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2"><Label>Business address</Label><Textarea rows={2} value={s.business_address} onChange={updS("business_address")} required data-testid="register-address-input" /></div>

                        <div className="sm:col-span-2 text-[12px] bg-[#FFF8DD] border border-[#F5C400]/40 text-[#5C4A00] rounded-md p-3">
                            Your application will go to TonersCart admin for review. You can sign in immediately and track approval status from your dashboard.
                        </div>

                        <div className="sm:col-span-2">
                            <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="register-submit-btn">
                                {loading ? "Submitting application…" : "Submit application"}
                            </Button>
                        </div>
                    </>
                )}
            </form>

            <div className="text-sm text-slate-600 mt-4">
                Already a member? <Link to="/login" className="text-[#00B7C7] font-semibold hover:underline" data-testid="register-to-login-link">Sign in</Link>
            </div>
        </div>
    );
}
