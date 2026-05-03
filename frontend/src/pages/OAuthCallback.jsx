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
        const run = async () => {
            try {
                // Wait for Supabase to finish hash-token exchange
                let session = null;
                for (let i = 0; i < 10 && !session; i++) {
                    const { data } = await supabase.auth.getSession();
                    session = data?.session;
                    if (!session) await new Promise((r) => setTimeout(r, 250));
                }
                if (!session) { setMsg("Could not complete sign-in"); return; }
                // Bootstrap profile row server-side (handles first-time Google sign-in)
                const intendedRole = params.get("role") === "supplier" ? "supplier" : "customer";
                const r = await api.post("/auth/oauth-bootstrap", { role: intendedRole });
                await refresh();
                toast.success("Signed in with Google");
                const role = r.data.role;
                if (role === "supplier") navigate("/supplier");
                else if (role === "admin") navigate("/admin");
                else navigate("/customer");
            } catch (e) {
                setMsg("Sign-in failed");
                toast.error(e?.response?.data?.detail || "Sign-in failed");
                navigate("/login");
            }
        };
        run();
    }, [navigate, refresh, params]);

    return (
        <div className="tc-container py-20 text-center" data-testid="oauth-callback">
            <div className="text-[14px] text-[#6E6E73]">{msg}</div>
        </div>
    );
}
