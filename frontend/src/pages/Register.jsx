import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

const BRAND_OPTIONS = ["HP", "Canon", "Brother", "Samsung", "Ricoh", "Epson", "Xerox", "Kyocera"];
const VOLUME_OPTIONS = ["< 50 / month", "50 – 200 / month", "200 – 1000 / month", "1000+ / month"];
const CUSTOMER_BASE = ["1 – 10 clients", "10 – 50 clients", "50 – 200 clients", "200+ clients"];

export default function Register() {
    const { register, refresh } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [role, setRole] = useState(params.get("role") === "supplier" ? "supplier" : "customer");
    const [form, setForm] = useState({
        email: "", password: "", name: "", company: "", city: "", phone: "",
        gst_number: "", business_address: "", years_in_business: "",
        brands_carried: [], customer_base_size: "", areas_supplied: "",
        monthly_volume: "", website: "", notes: "",
    });
    const [loading, setLoading] = useState(false);

    const handle = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const toggleBrand = (b) => setForm((f) => ({ ...f, brands_carried: f.brands_carried.includes(b) ? f.brands_carried.filter((x) => x !== b) : [...f.brands_carried, b] }));

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (role === "supplier") {
                const payload = {
                    email: form.email, password: form.password, name: form.name,
                    company: form.company, city: form.city, phone: form.phone,
                    gst_number: form.gst_number, business_address: form.business_address,
                    years_in_business: Number(form.years_in_business) || 0,
                    brands_carried: form.brands_carried,
                    customer_base_size: form.customer_base_size,
                    areas_supplied: form.areas_supplied.split(",").map((s) => s.trim()).filter(Boolean),
                    monthly_volume: form.monthly_volume,
                    website: form.website, notes: form.notes,
                };
                const r = await api.post("/auth/supplier-apply", payload);
                if (r.data?.token) localStorage.setItem("tc_token", r.data.token);
                await refresh();
                toast.success(`Application sent to ${r.data.destination} · awaiting approval`);
                navigate("/supplier");
            } else {
                await register({ email: form.email, password: form.password, name: form.name || form.email.split("@")[0], role: "customer", company: form.company, city: form.city, phone: form.phone });
                toast.success("Welcome to TonersCart");
                navigate("/customer");
            }
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    return (
        <div className="tc-container py-12 max-w-3xl" data-testid="register-page">
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Create account</div>
            <h1 className="text-[#0A0A0B] mt-2" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 500, letterSpacing: "-0.02em" }}>
                Join the TonersCart trade network
            </h1>

            <div className="mt-6 grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg max-w-sm">
                <button type="button" onClick={() => setRole("customer")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "customer" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-slate-500"}`} data-testid="role-customer-tab">I&apos;m a Buyer</button>
                <button type="button" onClick={() => setRole("supplier")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "supplier" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-slate-500"}`} data-testid="role-supplier-tab">I&apos;m a Supplier</button>
            </div>

            <form onSubmit={submit} className="mt-6 tc-card-flat p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {role === "supplier" ? (
                    <>
                        <div className="sm:col-span-2 -mb-2">
                            <div className="text-[12px] font-semibold text-[#0A0A0B] uppercase tracking-wider" style={{ fontFamily: "'Montserrat', sans-serif" }}>1. Account</div>
                        </div>
                        <div><Label>Full name</Label><Input value={form.name} onChange={handle("name")} required data-testid="register-name-input" /></div>
                        <div><Label>Email</Label><Input type="email" value={form.email} onChange={handle("email")} required data-testid="register-email-input" /></div>
                        <div><Label>Password</Label><Input type="password" value={form.password} onChange={handle("password")} required minLength={6} data-testid="register-password-input" /></div>
                        <div><Label>Phone</Label><Input value={form.phone} onChange={handle("phone")} placeholder="+91-..." required data-testid="register-phone-input" /></div>

                        <div className="sm:col-span-2 mt-4 -mb-2">
                            <div className="text-[12px] font-semibold text-[#0A0A0B] uppercase tracking-wider" style={{ fontFamily: "'Montserrat', sans-serif" }}>2. Business</div>
                        </div>
                        <div><Label>Company / Firm</Label><Input value={form.company} onChange={handle("company")} required data-testid="register-company-input" /></div>
                        <div><Label>City</Label><Input value={form.city} onChange={handle("city")} required data-testid="register-city-input" /></div>
                        <div><Label>GST number (optional)</Label><Input value={form.gst_number} onChange={handle("gst_number")} placeholder="e.g. 29ABCDE1234F1Z5" data-testid="register-gst-input" /></div>
                        <div><Label>Years in business</Label><Input type="number" min="0" value={form.years_in_business} onChange={handle("years_in_business")} data-testid="register-years-input" /></div>
                        <div className="sm:col-span-2"><Label>Business address</Label><Textarea rows={2} value={form.business_address} onChange={handle("business_address")} data-testid="register-address-input" /></div>
                        <div><Label>Website (optional)</Label><Input value={form.website} onChange={handle("website")} placeholder="https://..." data-testid="register-website-input" /></div>

                        <div className="sm:col-span-2 mt-4 -mb-2">
                            <div className="text-[12px] font-semibold text-[#0A0A0B] uppercase tracking-wider" style={{ fontFamily: "'Montserrat', sans-serif" }}>3. Operations</div>
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Brands you carry</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {BRAND_OPTIONS.map((b) => {
                                    const on = form.brands_carried.includes(b);
                                    return (
                                        <button type="button" key={b} onClick={() => toggleBrand(b)}
                                            className={`px-3 py-1.5 rounded-full border text-[13px] transition ${on ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#86868B]"}`}
                                            data-testid={`register-brand-${b}`}>
                                            {b}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <Label>Customer base size</Label>
                            <select value={form.customer_base_size} onChange={handle("customer_base_size")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="register-customer-base">
                                <option value="">Select…</option>
                                {CUSTOMER_BASE.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Monthly toner volume</Label>
                            <select value={form.monthly_volume} onChange={handle("monthly_volume")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="register-volume">
                                <option value="">Select…</option>
                                {VOLUME_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Areas / cities you supply</Label>
                            <Input value={form.areas_supplied} onChange={handle("areas_supplied")} placeholder="e.g. Bangalore, Mysore, Hubli" data-testid="register-areas-input" />
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Anything else we should know? (optional)</Label>
                            <Textarea rows={2} value={form.notes} onChange={handle("notes")} placeholder="Special inventory, exclusive distributor for X brand, etc." data-testid="register-notes-input" />
                        </div>

                        <div className="sm:col-span-2 text-[12px] bg-[#FFF8DD] border border-[#F5C400]/40 text-[#5C4A00] rounded-md p-3">
                            Your application will be emailed to <span className="font-mono font-semibold">support@digitaledgeinida.com</span> for review. Once approved, you can list products and start receiving order requests.
                        </div>

                        <div className="sm:col-span-2">
                            <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="register-submit-btn">
                                {loading ? "Submitting application…" : "Submit application"}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="sm:col-span-2"><Label>Full name</Label><Input value={form.name} onChange={handle("name")} required data-testid="register-name-input" /></div>
                        <div><Label>Email</Label><Input type="email" value={form.email} onChange={handle("email")} required data-testid="register-email-input" /></div>
                        <div><Label>Password</Label><Input type="password" value={form.password} onChange={handle("password")} required minLength={6} data-testid="register-password-input" /></div>
                        <div><Label>Company (optional)</Label><Input value={form.company} onChange={handle("company")} data-testid="register-company-input" /></div>
                        <div><Label>City</Label><Input value={form.city} onChange={handle("city")} data-testid="register-city-input" /></div>
                        <div className="sm:col-span-2"><Label>Phone</Label><Input value={form.phone} onChange={handle("phone")} placeholder="+91-..." data-testid="register-phone-input" /></div>
                        <div className="sm:col-span-2">
                            <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="register-submit-btn">
                                {loading ? "Creating account…" : "Create account"}
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
