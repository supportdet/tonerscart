import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [role, setRole] = useState(params.get("role") === "supplier" ? "supplier" : "customer");
    const [form, setForm] = useState({ email: "", password: "", name: "", company: "", city: "", phone: "" });
    const [loading, setLoading] = useState(false);

    const handle = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await register({ ...form, role });
            if (role === "supplier") { toast.success("Account created. Awaiting admin approval."); navigate("/supplier"); }
            else { toast.success("Welcome to TonersCart"); navigate("/customer"); }
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    return (
        <div className="tc-container py-16 max-w-xl" data-testid="register-page">
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Create account</div>
            <h1 className="text-3xl font-bold text-[#0E0F12] mt-2">Join the TonersCart trade network</h1>

            <div className="mt-6 grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg max-w-sm">
                <button type="button" onClick={() => setRole("customer")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "customer" ? "bg-white text-[#0E0F12] shadow-sm" : "text-slate-500"}`} data-testid="role-customer-tab">I&apos;m a Buyer</button>
                <button type="button" onClick={() => setRole("supplier")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "supplier" ? "bg-white text-[#0E0F12] shadow-sm" : "text-slate-500"}`} data-testid="role-supplier-tab">I&apos;m a Supplier</button>
            </div>

            <form onSubmit={submit} className="mt-6 tc-card-flat p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><Label>Full name</Label><Input value={form.name} onChange={handle("name")} required data-testid="register-name-input" /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={handle("email")} required data-testid="register-email-input" /></div>
                <div><Label>Password</Label><Input type="password" value={form.password} onChange={handle("password")} required minLength={6} data-testid="register-password-input" /></div>
                <div><Label>{role === "supplier" ? "Company / Firm" : "Company (optional)"}</Label><Input value={form.company} onChange={handle("company")} required={role === "supplier"} data-testid="register-company-input" /></div>
                <div><Label>City</Label><Input value={form.city} onChange={handle("city")} required={role === "supplier"} data-testid="register-city-input" /></div>
                <div className="sm:col-span-2"><Label>Phone</Label><Input value={form.phone} onChange={handle("phone")} placeholder="+91-..." data-testid="register-phone-input" /></div>

                {role === "supplier" && (
                    <div className="sm:col-span-2 text-xs bg-[#FFF8D6] border border-[#F7C600] text-amber-900 rounded-md p-3">
                        Supplier accounts need admin approval before listing products. You&apos;ll be able to log in immediately and view your dashboard while approval is pending.
                    </div>
                )}
                <div className="sm:col-span-2">
                    <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="register-submit-btn">
                        {loading ? "Creating account…" : "Create account"}
                    </Button>
                </div>
            </form>

            <div className="text-sm text-slate-600 mt-4">
                Already a member? <Link to="/login" className="text-[#00B7C7] font-semibold hover:underline" data-testid="register-to-login-link">Sign in</Link>
            </div>
        </div>
    );
}
