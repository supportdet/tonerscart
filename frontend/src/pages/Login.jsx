import React, { useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Mail, Lock, Loader2, Landmark } from "lucide-react";

const GoogleIcon = (props) => (
    <svg viewBox="0 0 48 48" width="18" height="18" {...props}>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.5-11.3 7.5-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.5-4.7 2.5-7.6 2.5-5.4 0-9.7-3-11.3-7.5l-6.6 5.1C9.6 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 4.9l6.5 5.5C42.5 35.5 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

export default function Login() {
    const { login, signInWithGoogle, user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = params.get("next");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [slowHint, setSlowHint] = useState(false);
    const [errors, setErrors] = useState({}); // { email, password, form }

    const clearErrors = () => setErrors({});

    // Wave 101 hotfix-6 — auto-redirect when the user is ALREADY authenticated
    // (e.g. they landed here via the Supabase magic-link `redirect_to=/login`
    // for bulk-invited dealers). The supabase-js detectSessionInUrl flag
    // catches the auth hash, /auth/me hydrates, and we route them to the
    // intended `next` path or the default by-role page. Without this, they
    // sat staring at the login form despite being signed in.
    React.useEffect(() => {
        if (authLoading || !user) return;
        if (next && next.startsWith("/")) {
            navigate(next, { replace: true });
            return;
        }
        const role = user?.role;
        const path = role === "admin" ? "/admin"
            : role === "supplier" ? "/supplier"
            : role === "oem" ? "/oem-dashboard"
            : "/customer";
        navigate(path, { replace: true });
    }, [authLoading, user, next, navigate]);

    React.useEffect(() => {
        if (!loading && !googleLoading) { setSlowHint(false); return; }
        const t = setTimeout(() => setSlowHint(true), 5000);
        return () => clearTimeout(t);
    }, [loading, googleLoading]);

    const submit = async (e) => {
        e.preventDefault();
        clearErrors();
        setLoading(true);
        try {
            const me = await login(email, password);
            if (me?.name) toast.success(`Welcome back, ${me.name}`);
            if (next && next.startsWith("/")) {
                navigate(next);
                return;
            }
            const role = me?.role;
            const path = role === "admin" ? "/admin" : role === "supplier" ? "/supplier" : role === "oem" ? "/oem-dashboard" : "/customer";
            navigate(path);
        } catch (err) {
            const msg = err?.message || formatApiError(err) || "Sign-in failed";
            // Map to the most relevant field; fall back to a form-level error.
            if (/email/i.test(msg) && /(found|exist|registered)/i.test(msg)) {
                setErrors({ email: msg });
            } else if (/password|credential|incorrect/i.test(msg)) {
                setErrors({ password: msg });
            } else {
                setErrors({ form: msg });
            }
        }
        finally { setLoading(false); }
    };

    const onGoogle = () => {
        clearErrors();
        // Identical UX to logout button — flush state synchronously so the
        // overlay paints before we kick off the network call.
        flushSync(() => setGoogleLoading(true));
        (async () => {
            try { await signInWithGoogle(next || undefined); }
            catch (e) { setErrors({ form: e.message || "Google sign-in unavailable" }); setGoogleLoading(false); }
            // Note: Google OAuth redirects away — no cleanup needed on success path
        })();
    };

    return (
        <div className="tc-hero relative pb-16" data-testid="login-page">
            {/* Full-screen overlay — same UX as the logout flow */}
            {googleLoading && (
                <div className="fixed inset-0 z-[3000] bg-[#0A0A0B]/70 backdrop-blur-sm flex items-center justify-center" role="alertdialog" aria-busy="true" data-testid="google-signin-overlay">
                    <div className="bg-white rounded-2xl px-6 py-5 inline-flex items-center gap-3 shadow-2xl">
                        <Loader2 size={18} className="animate-spin text-[#0A0A0B]" />
                        <div className="text-[14px] font-semibold text-[#0A0A0B]">Connecting to Google…</div>
                    </div>
                </div>
            )}
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

                            <button onClick={onGoogle} type="button" disabled={googleLoading || loading} className="mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full border border-[#D2D2D7] bg-white hover:bg-black/[0.03] text-[#0A0A0B] font-semibold text-[13.5px] disabled:opacity-60 disabled:cursor-not-allowed" data-testid="login-google-btn">
                                {googleLoading ? <><Loader2 size={14} className="animate-spin" /> Connecting to Google…</> : <><GoogleIcon /> Continue with Google</>}
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
                                        <Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email || errors.form) clearErrors(); }} required className="pl-9" data-testid="login-email-input" />
                                    </div>
                                    {errors.email && <p className="text-red-600 text-[12px] mt-1" data-testid="login-email-error">{errors.email}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="password">Password</Label>
                                    <div className="relative">
                                        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                                        <Input id="password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); if (errors.password || errors.form) clearErrors(); }} required className="pl-9" data-testid="login-password-input" />
                                    </div>
                                    {errors.password && <p className="text-red-600 text-[12px] mt-1" data-testid="login-password-error">{errors.password}</p>}
                                </div>
                                {errors.form && <p className="text-red-600 text-[12px]" data-testid="login-form-error">{errors.form}</p>}
                                <Button type="submit" className="btn-cta w-full inline-flex items-center justify-center gap-2" disabled={loading || googleLoading} data-testid="login-submit-btn">
                                    {loading ? <><Loader2 size={14} className="animate-spin" /> Signing in…</> : <>Sign in <ArrowRight size={14} /></>}
                                </Button>
                                {slowHint && (loading || googleLoading) && (
                                    <div className="text-[12px] text-[#8C6A00] bg-[#FFFBEB] border border-[#F5E5A6] rounded-md px-3 py-2 mt-1 text-center" data-testid="login-slow-hint">
                                        This is taking longer than usual…
                                    </div>
                                )}
                            </form>

                            <div className="text-[12.5px] text-center mt-3">
                                <Link to="/forgot-password" className="text-[#6E6E73] hover:text-[#0A0A0B] hover:underline" data-testid="login-forgot-link">Forgot password?</Link>
                            </div>

                            <div className="text-[13px] text-[#6E6E73] text-center mt-5">
                                No account yet? <Link to="/register" className="text-[#00B7C7] font-semibold hover:underline" data-testid="login-to-register-link">Create one</Link>
                            </div>

                            <div className="mt-5 pt-5 border-t border-black/[0.08]">
                                <Link
                                    to="/procurement/login"
                                    className="flex items-center justify-between gap-3 w-full px-4 py-3 rounded-xl bg-[#0B1220] text-white hover:bg-[#111a2e] transition-colors group"
                                    data-testid="procurement-login-link"
                                >
                                    <span className="flex items-center gap-2.5">
                                        <Landmark size={16} className="text-[#F7C600]" />
                                        <span className="text-[13px] font-semibold">Government &amp; Corporate Procurement</span>
                                    </span>
                                    <ArrowRight size={15} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
