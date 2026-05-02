import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";

export default function AuthCallback() {
    const navigate = useNavigate();
    const { refresh } = useAuth();

    useEffect(() => {
        const exchange = async () => {
            const hash = window.location.hash || "";
            const m = hash.match(/session_id=([^&]+)/);
            if (!m) { navigate("/"); return; }
            const session_id = decodeURIComponent(m[1]);
            try {
                const r = await api.post("/auth/google-session", { session_id });
                if (r.data?.token) localStorage.setItem("tc_token", r.data.token);
                await refresh();
                toast.success(`Welcome ${r.data.user.name}`);
                navigate("/");
            } catch (e) {
                toast.error("Google sign-in failed");
                navigate("/login");
            }
        };
        exchange();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="tc-container py-24 text-center" data-testid="auth-callback">
            <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Signing you in</div>
            <div className="font-semibold text-[#0A0A0B] mt-3 text-xl">Completing Google sign-in…</div>
            <div className="text-[#6E6E73] text-sm mt-1">This will only take a moment.</div>
        </div>
    );
}
