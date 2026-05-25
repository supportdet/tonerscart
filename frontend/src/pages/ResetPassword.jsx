import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
    const navigate = useNavigate();
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
        if (pw !== pw2) { toast.error("Passwords don't match"); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: pw });
            if (error) throw new Error(error.message);
            toast.success("Password updated. Please sign in again.");
            await supabase.auth.signOut();
            navigate("/login");
        } catch (err) {
            toast.error(err.message || "Could not update password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 py-12" data-testid="reset-page">
            <form onSubmit={submit} className="bg-white border border-black/[0.06] rounded-2xl shadow-lg p-7 max-w-md w-full space-y-4">
                <div>
                    <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">Set new password</div>
                    <h1 className="text-[22px] font-semibold mt-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>Choose a new password</h1>
                </div>
                <div>
                    <Label>New password</Label>
                    <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} data-testid="reset-pw-input" autoFocus />
                </div>
                <div>
                    <Label>Confirm new password</Label>
                    <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} data-testid="reset-pw2-input" />
                </div>
                <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="reset-submit-btn">
                    {loading ? (<><Loader2 size={14} className="animate-spin mr-1.5" /> Updating…</>) : "Update password"}
                </Button>
            </form>
        </div>
    );
}
