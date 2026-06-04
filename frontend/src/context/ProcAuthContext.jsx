import React, { createContext, useContext, useEffect, useState } from "react";
import procApi, { procToken } from "../lib/procApi";

const ProcAuthContext = createContext(null);

export const ProcAuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        if (!procToken.get()) { setUser(null); setLoading(false); return; }
        try {
            const { data } = await procApi.get("/procurement/me");
            setUser(data);
        } catch {
            procToken.clear();
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { refresh(); }, []);

    const login = async (email, password) => {
        const { data } = await procApi.post("/procurement/login", { email, password });
        procToken.set(data.token);
        setUser(data.user);
        return data.user;
    };

    const logout = () => { procToken.clear(); setUser(null); };

    return (
        <ProcAuthContext.Provider value={{ user, loading, login, logout, refresh, setUser }}>
            {children}
        </ProcAuthContext.Provider>
    );
};

export const useProcAuth = () => useContext(ProcAuthContext);
