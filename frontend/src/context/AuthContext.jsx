import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "../lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
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
    }, [refresh]);

    const login = async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        if (data?.token) localStorage.setItem("tc_token", data.token);
        setUser(data.user);
        return data.user;
    };

    const register = async (payload) => {
        const { data } = await api.post("/auth/register", payload);
        if (data?.token) localStorage.setItem("tc_token", data.token);
        setUser(data.user);
        return data.user;
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch (_) {}
        localStorage.removeItem("tc_token");
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, formatApiError }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
