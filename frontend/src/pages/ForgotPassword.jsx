import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";

const REDIRECT_TO = "https://www.tonerscart.com/reset-password";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!email.trim()) { toast.error("Email is required"); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: REDIRECT_TO });
            if (error) throw new Error(error.message);
            setDone(true);
        } catch (err) {
            toast.error(err.message || "Could not send reset link");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 py-12" data-testid="forgot-page">
            <div className="bg-white border border-black/[0.06] rounded-2xl shadow-lg p-7 max-w-md w-full">
                {done ? (
                    <div className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 grid place-items-center"><CheckCircle2 size={22} className="text-emerald-600" /></div>
                        <h2 className="mt-4 text-[20px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Check your inbox</h2>
                        <p className="text-[#6E6E73] text-[13.5px] mt-2">Password reset link sent to your email. The link is valid for 1 hour.</p>
                        <Link to="/login" className="inline-block mt-5 text-[13px] font-semibold underline">Back to sign in</Link>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-4">
                        <div>
                            <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">Forgot password</div>
                            <h1 className="text-[22px] font-semibold mt-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>Reset your password</h1>
                            <p className="text-[13px] text-[#6E6E73] mt-1">We&apos;ll email you a link to set a new password.</p>
                        </div>
                        <div>
                            <Label>Email</Label>
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="forgot-email-input" autoFocus />
                        </div>
                        <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="forgot-submit-btn">
                            {loading ? (<><Loader2 size={14} className="animate-spin mr-1.5" /> Sending…</>) : "Send reset link"}
                        </Button>
                        <Link to="/login" className="block text-center text-[12.5px] text-[#6E6E73] underline">Back to sign in</Link>
                    </form>
                )}
            </div>
        </div>
    );
}
