import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
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
            const u = await login(email, password);
            toast.success(`Welcome back, ${u.name}`);
            const path = u.role === "admin" ? "/admin" : u.role === "supplier" ? "/supplier" : "/customer";
            navigate(path);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    return (
        <div className="tc-container py-16 max-w-md" data-testid="login-page">
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Sign in</div>
            <h1 className="text-3xl font-bold text-[#0E0F12] mt-2">Welcome back</h1>
            <p className="text-slate-600 mt-1 text-sm">Buyers, suppliers and admin sign in here.</p>

            <form onSubmit={submit} className="mt-8 space-y-4 tc-card-flat p-6">
                <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email-input" />
                </div>
                <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password-input" />
                </div>
                <Button type="submit" className="btn-primary text-white w-full" disabled={loading} data-testid="login-submit-btn">
                    {loading ? "Signing in…" : "Sign in"}
                </Button>
                <div className="text-sm text-slate-600 text-center pt-2">
                    No account yet? <Link to="/register" className="text-[#00B7C7] font-semibold hover:underline" data-testid="login-to-register-link">Create one</Link>
                </div>
            </form>

            <div className="mt-6 text-xs text-slate-600 bg-white border border-slate-200 rounded-md p-3 font-mono">
                <div className="font-bold text-[#0E0F12] mb-1">Demo accounts</div>
                Admin&nbsp;&nbsp;&nbsp;&nbsp;: admin@tonerscart.in / Admin@123<br />
                Supplier&nbsp;: delhi.toners@tonerscart.in / Supplier@123<br />
                Customer&nbsp;: buyer@tonerscart.in / Customer@123
            </div>
        </div>
    );
}
