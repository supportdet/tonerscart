import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Mail, Lock } from "lucide-react";

const GoogleIcon = (props) => (
    <svg viewBox="0 0 48 48" width="18" height="18" {...props}>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.5-11.3 7.5-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.5-4.7 2.5-7.6 2.5-5.4 0-9.7-3-11.3-7.5l-6.6 5.1C9.6 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 4.9l6.5 5.5C42.5 35.5 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

export default function Login() {
    const { login, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = params.get("next");
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
            if (next && next.startsWith("/")) {
                navigate(next);
                return;
            }
            const path = me.role === "admin" ? "/admin" : me.role === "supplier" ? "/supplier" : "/customer";
            navigate(path);
        } catch (e) { toast.error(e.message || formatApiError(e)); }
        finally { setLoading(false); }
    };

    const onGoogle = async () => {
        try { await signInWithGoogle(next || undefined); }
        catch (e) { toast.error(e.message || "Google sign-in unavailable"); }
    };

    return (
        <div className="tc-hero relative pb-16" data-testid="login-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-12 sm:pt-16">
                <div className="grid lg:grid-cols-12 gap-8 lg:gap-14 items-start">
                    {/* Left: pitch */}
                    <div className="lg:col-span-6 hidden lg:block">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="tc-strip" />
                            <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Sign in</span>
                        </div>
                        <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(36px, 4.4vw, 60px)", lineHeight: 1.05, letterSpacing: "-0.03em", fontWeight: 300 }}>
                            Direct trade for printer toners — <span className="text-[#00B7C7]" style={{ fontWeight: 500 }}>verified</span> &amp; <span className="text-[#F5C400]" style={{ fontWeight: 500 }}>fast</span>.
                        </h1>
                        <p className="text-white/65 mt-5 max-w-md text-[14.5px]">
                            Buyers — search every supplier in your city in one place. Suppliers — list verified stock and respond to order requests in seconds.
                        </p>
                        <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
                            {[
                                ["152", "Toner SKUs"],
                                ["8", "Brands"],
                                ["25+", "Cities"],
                            ].map(([v, k]) => (
                                <div key={k}>
                                    <div className="font-mono text-2xl text-white font-semibold">{v}</div>
                                    <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-white/55 mt-1">{k}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: card */}
                    <div className="lg:col-span-6 max-w-md w-full ml-auto">
                        <div className="bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-6 sm:p-8 text-[#0A0A0B]">
                            <h2 className="text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "26px", fontWeight: 300, letterSpacing: "-0.02em" }}>
                                Welcome back
                            </h2>
                            <p className="text-[13px] text-[#6E6E73] mt-1">Buyers, suppliers and admin sign in here.</p>

                            <button onClick={onGoogle} type="button" className="mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full border border-[#D2D2D7] bg-white hover:bg-black/[0.03] text-[#0A0A0B] font-semibold text-[13.5px]" data-testid="login-google-btn">
                                <GoogleIcon /> Continue with Google
                            </button>

                            <div className="my-5 flex items-center gap-3">
                                <div className="h-px flex-1 bg-black/[0.08]" />
                                <span className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">or with email</span>
                                <div className="h-px flex-1 bg-black/[0.08]" />
                            </div>

                            <form onSubmit={submit} className="space-y-3.5">
                                <div>
                                    <Label htmlFor="email">Email</Label>
                                    <div className="relative">
                                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-9" data-testid="login-email-input" />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="password">Password</Label>
                                    <div className="relative">
                                        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-9" data-testid="login-password-input" />
                                    </div>
                                </div>
                                <Button type="submit" className="btn-cta w-full inline-flex items-center justify-center gap-2" disabled={loading} data-testid="login-submit-btn">
                                    {loading ? "Signing in…" : <>Sign in <ArrowRight size={14} /></>}
                                </Button>
                            </form>

                            <div className="text-[13px] text-[#6E6E73] text-center mt-5">
                                No account yet? <Link to="/register" className="text-[#00B7C7] font-semibold hover:underline" data-testid="login-to-register-link">Create one</Link>
                            </div>
                        </div>

                        <div className="mt-4 text-[11px] text-white/55 bg-white/[0.06] border border-white/[0.08] rounded-md p-2.5 font-mono backdrop-blur" data-testid="login-admin-hint">
                            <span className="text-white/80">Admin demo:</span> admin@tonerscart.in / Admin@123
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
