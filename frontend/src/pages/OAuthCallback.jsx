import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";

export default function OAuthCallback() {
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const [params] = useSearchParams();
    const [msg, setMsg] = useState("Signing you in…");

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            // Wait up to ~8s for Supabase to finish hash-token exchange
            let session = null;
            for (let i = 0; i < 32 && !session; i++) {
                if (cancelled) return;
                const { data } = await supabase.auth.getSession();
                session = data?.session;
                if (!session) await new Promise((r) => setTimeout(r, 250));
            }
            if (cancelled) return;
            if (!session) {
                setMsg("Could not complete sign-in");
                toast.error("Could not complete sign-in. Please try again.");
                navigate("/login", { replace: true });
                return;
            }
            // Bootstrap public.users row (idempotent — defaults role=customer/buyer)
            try {
                await api.post("/auth/oauth-bootstrap", {});
            } catch {
                // Non-fatal — /auth/me below will still try
            }
            await refresh();
            const next = params.get("next");
            if (next && next.startsWith("/")) {
                navigate(next, { replace: true });
                return;
            }
            // Default: route by role
            try {
                const { data: meData } = await api.get("/auth/me");
                if (meData.role === "admin") navigate("/admin", { replace: true });
                else if (meData.role === "supplier") navigate("/supplier", { replace: true });
                else navigate("/search", { replace: true });
            } catch {
                navigate("/search", { replace: true });
            }
        };
        run();
        return () => { cancelled = true; };
    }, [navigate, refresh, params]);

    return (
        <div className="tc-container py-20 text-center" data-testid="oauth-callback">
            <div className="text-[14px] text-[#6E6E73]">{msg}</div>
        </div>
    );
}
