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
        } catch (e) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const { data: listener } = supabase.auth.onAuthStateChange((_event, _session) => {
            refresh();
        });
        return () => { listener?.subscription?.unsubscribe?.(); };
    }, [refresh]);

    const login = async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        await refresh();
    };

    const signupCustomer = async (payload) => {
        await api.post("/auth/signup-customer", payload);
        await login(payload.email, payload.password);
    };

    const signupSupplier = async (payload) => {
        await api.post("/auth/signup-supplier", payload);
        await login(payload.email, payload.password);
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, signupCustomer, signupSupplier, logout, refresh, formatApiError }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
