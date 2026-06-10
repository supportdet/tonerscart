import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import api, { formatApiError, getAccessToken } from "../lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Dedupe concurrent /auth/me calls (login's refresh + the onAuthStateChange
    // refresh fire together) — collapse them into a single in-flight request.
    const inflight = useRef(null);

    const refresh = useCallback(async () => {
        if (inflight.current) return inflight.current;
        const p = (async () => {
            try {
                // Guests have no token — skip /auth/me entirely so we never emit a
                // 401 on public pages (keeps the console clean, no false redirects).
                const token = await getAccessToken();
                if (!token) { setUser(null); return null; }
                const { data } = await api.get("/auth/me", { timeout: 8000 });
                setUser(data);
                return data;
            } catch (err) {
                if (err?.response?.status === 401) setUser(null);
                // else: keep previous user state — transient errors shouldn't blank the UI
                return null;
            } finally {
                setLoading(false);
                inflight.current = null;
            }
        })();
        inflight.current = p;
        return p;
    }, []);

    useEffect(() => {
        refresh();
        const { data: listener } = supabase.auth.onAuthStateChange(() => {
            refresh();
        });
        return () => { listener?.subscription?.unsubscribe?.(); };
    }, [refresh]);

    const login = async (email, password) => {
        // Route login through the backend so it can be rate-limited (brute-force
        // protection). On success we hydrate the Supabase client session so the
        // rest of the app keeps working exactly as before.
        let data;
        try {
            const res = await api.post("/auth/login", { email, password });
            data = res.data;
        } catch (err) {
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail;
            if (status === 429) throw new Error(detail || "Too many attempts, try again in 30 minutes.");
            if (status === 401) throw new Error("Incorrect email or password");
            throw new Error(detail || "Sign-in failed");
        }
        if (!data?.access_token || !data?.refresh_token) {
            throw new Error("Sign-in failed");
        }
        const { error } = await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
        });
        if (error) throw new Error(error.message || "Sign-in failed");
        return await refresh();
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
