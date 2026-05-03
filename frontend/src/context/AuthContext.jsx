import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import api, { formatApiError } from "../lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const { data: sess } = await supabase.auth.getSession();
            if (!sess?.session) {
                setUser(null);
                return;
            }
            const { data } = await api.get("/auth/me");
            setUser(data);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const { data: listener } = supabase.auth.onAuthStateChange(() => {
            refresh();
        });
        return () => { listener?.subscription?.unsubscribe?.(); };
    }, [refresh]);

    const login = async (email, password) => {
        let result;
        try {
            result = await supabase.auth.signInWithPassword({ email, password });
        } catch {
            throw new Error("Incorrect email or password");
        }
        if (result?.error) {
            const m = (result.error.message || "").toLowerCase();
            if (m.includes("invalid login") || m.includes("invalid_credentials") || m.includes("invalid email") || m.includes("invalid password") || m.includes("body stream")) {
                throw new Error("Incorrect email or password");
            }
            throw new Error(result.error.message || "Sign-in failed");
        }
        await refresh();
    };

    const signInWithGoogle = async (next) => {
        const redirect = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: redirect },
        });
        if (error) throw new Error(error.message || "Google sign-in unavailable");
    };

    const signupCustomer = async (payload) => {
        await api.post("/auth/signup-customer", payload);
        await login(payload.email, payload.password);
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, signInWithGoogle, signupCustomer, logout, refresh, formatApiError }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
