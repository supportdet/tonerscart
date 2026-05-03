import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(email, password);
            const { data: me } = await api.get("/auth/me");
            toast.success(`Welcome back, ${me.name}`);
            const path = me.role === "admin" ? "/admin" : me.role === "supplier" ? "/supplier" : "/customer";
            navigate(path);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    return (
        <div className="tc-container py-12 sm:py-16 max-w-md" data-testid="login-page">
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Sign in</div>
            <h1 className="text-[#0A0A0B] mt-2" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 3.4vw, 44px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                Welcome back
            </h1>
            <p className="text-slate-600 mt-2 text-sm">Buyers, suppliers and admin sign in here.</p>

            <form onSubmit={submit} className="mt-6 space-y-4 tc-card-flat p-5 sm:p-6">
                <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email-input" />
                </div>
                <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password-input" />
                </div>
                <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="login-submit-btn">
                    {loading ? "Signing in…" : "Sign in"}
                </Button>
                <div className="text-sm text-slate-600 text-center pt-1">
                    No account yet? <Link to="/register" className="text-[#00B7C7] font-semibold hover:underline" data-testid="login-to-register-link">Create one</Link>
                </div>
            </form>

            <div className="mt-6 text-xs text-slate-600 bg-white border border-slate-200 rounded-md p-3 font-mono">
                <div className="font-bold text-[#0A0A0B] mb-1">Admin demo</div>
                admin@tonerscart.in / Admin@123
            </div>
        </div>
    );
}
