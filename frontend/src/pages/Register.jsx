import React, { useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import PhonePrefixInput from "../components/PhonePrefixInput";

const GoogleIcon = (props) => (
    <svg viewBox="0 0 48 48" width="18" height="18" {...props}>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.5-11.3 7.5-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.5-4.7 2.5-7.6 2.5-5.4 0-9.7-3-11.3-7.5l-6.6 5.1C9.6 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 4.9l6.5 5.5C42.5 35.5 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

export default function Register() {
    const { signupCustomer, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = params.get("next") || "/search";
    const [c, setC] = useState({ email: "", password: "", confirm: "", name: "", phone: "", city: "" });
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const upd = (k) => (e) => { setC({ ...c, [k]: e.target.value }); if (errors[k] || errors.form) setErrors((p) => { const n = { ...p }; delete n[k]; delete n.form; return n; }); };

    const submit = async (e) => {
        e.preventDefault();
        // Client-side inline validation
        const next_errors = {};
        if (!c.name.trim()) next_errors.name = "Please enter your name";
        if ((c.password || "").length < 6) next_errors.password = "Password must be at least 6 characters";
        if (c.confirm !== c.password) next_errors.confirm = "Passwords don't match";
        if (Object.keys(next_errors).length > 0) { setErrors(next_errors); return; }
        setErrors({});
        setLoading(true);
        try {
            const { confirm: _omit, ...rest } = c;
            const payload = { ...rest, phone: c.phone ? `+91 ${c.phone}` : "" };
            await signupCustomer(payload);
            toast.success("Welcome to TonersCart!");
            navigate(next);
        } catch (err) {
            const msg = formatApiError(err);
            if ((msg || "").toLowerCase().includes("already")) {
                setErrors({ email: "This email is already registered. Try signing in instead." });
            } else {
                setErrors({ form: msg || "Could not create account" });
            }
        } finally { setLoading(false); }
    };

    const onGoogle = () => {
        setErrors({});
        flushSync(() => setGoogleLoading(true));
        (async () => {
            try { await signInWithGoogle(next); }
            catch (e) { setErrors({ form: e?.message || "Google sign-in unavailable" }); setGoogleLoading(false); }
        })();
    };

    return (
        <div className="tc-hero relative pb-16" data-testid="register-page">
            {googleLoading && (
                <div className="fixed inset-0 z-[3000] bg-[#0A0A0B]/70 backdrop-blur-sm flex items-center justify-center" role="alertdialog" aria-busy="true" data-testid="google-signin-overlay">
                    <div className="bg-white rounded-2xl px-6 py-5 inline-flex items-center gap-3 shadow-2xl">
                        <Loader2 size={18} className="animate-spin text-[#0A0A0B]" />
                        <div className="text-[14px] font-semibold text-[#0A0A0B]">Connecting to Google…</div>
                    </div>
                </div>
            )}
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14 max-w-md">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Create account</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Join TonersCart
                </h1>
                <p className="text-white/65 mt-3 text-[14px]">One account for buying and selling. Want to sell? Sign up first, then click <span className="text-[#00B7C7] font-semibold">Sell</span> in the navbar.</p>

                <div className="mt-6 bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-6 text-[#0A0A0B]">
                    <button onClick={onGoogle} type="button" disabled={googleLoading} className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full border border-[#D2D2D7] bg-white hover:bg-black/[0.03] text-[#0A0A0B] font-semibold text-[13.5px] disabled:opacity-60 disabled:cursor-not-allowed" data-testid="register-google-btn">
                        {googleLoading ? <><Loader2 size={14} className="animate-spin" /> Connecting to Google…</> : <><GoogleIcon /> Continue with Google</>}
                    </button>
                    <div className="my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-black/[0.08]" />
                        <span className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">or with email</span>
                        <div className="h-px flex-1 bg-black/[0.08]" />
                    </div>
                    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" noValidate>
                        <div className="sm:col-span-2"><Label>Full name</Label><Input value={c.name} onChange={upd("name")} data-testid="register-name-input" />{errors.name && <p className="text-red-600 text-[12px] mt-1" data-testid="register-name-error">{errors.name}</p>}</div>
                        <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={c.email} onChange={upd("email")} required data-testid="register-email-input" />{errors.email && <p className="text-red-600 text-[12px] mt-1" data-testid="register-email-error">{errors.email}</p>}</div>
                        <div className="sm:col-span-2"><Label>Password</Label><Input type="password" value={c.password} onChange={upd("password")} required minLength={6} placeholder="6+ characters" data-testid="register-password-input" />{errors.password && <p className="text-red-600 text-[12px] mt-1" data-testid="register-password-error">{errors.password}</p>}</div>
                        <div className="sm:col-span-2"><Label>Confirm password</Label><Input type="password" value={c.confirm} onChange={upd("confirm")} required placeholder="Re-enter password" data-testid="register-confirm-input" />{errors.confirm && <p className="text-red-600 text-[12px] mt-1" data-testid="register-confirm-error">{errors.confirm}</p>}</div>
                        <div><Label>Phone</Label><PhonePrefixInput value={c.phone} onChange={(v) => setC({ ...c, phone: v })} testId="register-phone-input" /></div>
                        <div><Label>City</Label><Input value={c.city} onChange={upd("city")} data-testid="register-city-input" /></div>
                        {errors.form && <div className="sm:col-span-2"><p className="text-red-600 text-[12px]" data-testid="register-form-error">{errors.form}</p></div>}
                        <div className="sm:col-span-2">
                            <Button type="submit" className="btn-cta w-full inline-flex items-center justify-center gap-2" disabled={loading} data-testid="register-submit-btn">
                                {loading ? "Creating account…" : <>Create account <ArrowRight size={14} /></>}
                            </Button>
                        </div>
                    </form>
                </div>

                <div className="text-sm text-white/70 mt-4">
                    Already a member? <Link to="/login" className="text-[#00B7C7] font-semibold hover:underline" data-testid="register-to-login-link">Sign in</Link>
                </div>
            </div>
        </div>
    );
}
