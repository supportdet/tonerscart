import React, { useEffect, useState } from "react";
import { X, Mail, Phone, Sparkles } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { toast } from "sonner";

const POPUP_DISMISSED_KEY = "tc_popup_dismissed";

export default function LoginPopup() {
    const { user, login, register } = useAuth();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState("intro"); // intro | email-login | email-signup | phone
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user) return;
        let dismissed = false;
        try { dismissed = sessionStorage.getItem(POPUP_DISMISSED_KEY) === "1"; } catch { /* ignore */ }
        if (dismissed) return;
        const t = setTimeout(() => setOpen(true), 3000);
        return () => clearTimeout(t);
    }, [user]);

    const close = () => {
        setOpen(false);
        try { sessionStorage.setItem(POPUP_DISMISSED_KEY, "1"); } catch { /* ignore */ }
    };

    const onGoogle = () => {
        const redirect = `${window.location.origin}/auth/callback`;
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    };

    const submitEmail = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === "email-signup") {
                await register({ email, password, name: name || email.split("@")[0], role: "customer", city: "Bangalore" });
                toast.success("Welcome to TonersCart");
            } else {
                await login(email, password);
                toast.success("Signed in");
            }
            close();
        } catch (err) { toast.error(formatApiError(err)); }
        finally { setLoading(false); }
    };

    const submitPhone = async (e) => {
        e.preventDefault();
        toast.info("Phone OTP coming soon — using email sign-up for now");
        setMode("email-signup");
        if (phone && !email) setEmail(`${phone.replace(/\D/g, '')}@phone.tonerscart.in`);
    };

    if (!open) return null;

    return (
        <div className="tc-popup-backdrop" onClick={close} data-testid="login-popup">
            <div className="tc-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <button onClick={close} className="absolute top-4 right-4 w-8 h-8 rounded-full grid place-items-center text-[#6E6E73] hover:bg-black/[0.05] transition-colors" data-testid="popup-close-btn">
                    <X size={16} />
                </button>

                {/* Hero strip */}
                <div className="tc-popup-hero">
                    <div className="absolute inset-0 tc-cmyk-pattern opacity-50" />
                    <Sparkles size={20} className="text-[#F5C400] relative z-10" />
                    <div className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60 mt-3 relative z-10">Welcome to TonersCart</div>
                    <div className="font-bold text-white text-[22px] tracking-tight mt-2 relative z-10">Find the right toner — <span className="text-[#F5C400]">faster</span>.</div>
                </div>

                <div className="p-6 sm:p-7">
                    {mode === "intro" && (
                        <div className="space-y-3" data-testid="popup-intro">
                            <button onClick={onGoogle} className="tc-popup-btn tc-popup-btn-outline" data-testid="popup-google-btn">
                                <GoogleIcon /> Continue with Google
                            </button>
                            <button onClick={() => setMode("phone")} className="tc-popup-btn tc-popup-btn-outline" data-testid="popup-phone-btn">
                                <Phone size={16} /> Continue with phone
                            </button>
                            <button onClick={() => setMode("email-signup")} className="tc-popup-btn tc-popup-btn-outline" data-testid="popup-email-btn">
                                <Mail size={16} /> Continue with email
                            </button>
                            <div className="text-center pt-1">
                                <button onClick={() => setMode("email-login")} className="text-[12px] text-[#6E6E73] hover:text-[#0A0A0B]" data-testid="popup-existing-btn">
                                    Already have an account? <span className="font-semibold underline">Sign in</span>
                                </button>
                            </div>
                            <button onClick={close} className="block w-full text-center text-[12px] text-[#86868B] hover:text-[#0A0A0B] pt-3" data-testid="popup-skip-btn">
                                Skip for now
                            </button>
                        </div>
                    )}

                    {(mode === "email-login" || mode === "email-signup") && (
                        <form onSubmit={submitEmail} className="space-y-3" data-testid={`popup-${mode}-form`}>
                            <button type="button" onClick={() => setMode("intro")} className="text-[12px] text-[#6E6E73] hover:text-[#0A0A0B]">← Back</button>
                            {mode === "email-signup" && (
                                <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="popup-name-input" /></div>
                            )}
                            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="popup-email-input" /></div>
                            <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="popup-password-input" /></div>
                            <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="popup-submit-btn">
                                {loading ? "Please wait…" : (mode === "email-signup" ? "Create account" : "Sign in")}
                            </Button>
                            <button type="button" onClick={() => setMode(mode === "email-signup" ? "email-login" : "email-signup")} className="block w-full text-center text-[12px] text-[#6E6E73] hover:text-[#0A0A0B]">
                                {mode === "email-signup" ? "Already have an account? Sign in" : "New here? Create account"}
                            </button>
                        </form>
                    )}

                    {mode === "phone" && (
                        <form onSubmit={submitPhone} className="space-y-3" data-testid="popup-phone-form">
                            <button type="button" onClick={() => setMode("intro")} className="text-[12px] text-[#6E6E73] hover:text-[#0A0A0B]">← Back</button>
                            <div><Label>Phone number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91-..." data-testid="popup-phone-input" /></div>
                            <Button type="submit" className="btn-cta w-full">Send OTP</Button>
                            <div className="text-[11px] text-[#86868B] text-center">We&apos;ll switch you to email signup until OTP is enabled.</div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13 4.5 4 13.5 4 24.5s9 20 20 20 20-9 20-20c0-1.4-.1-2.7-.4-4z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 9.1 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44.5c5.4 0 10.3-2 14-5.3l-6.5-5.3c-1.9 1.4-4.4 2.3-7.5 2.3-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.9 16.2 44.5 24 44.5z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 5l6.5 5.3c-.5.4 6.9-5 6.9-13.8 0-1.4-.1-2.7-.4-4z" />
        </svg>
    );
}
