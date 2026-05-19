import axios from "axios";
import { supabase } from "./supabase";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BASE}/api`;

// Cache the access token to avoid calling supabase.auth.getSession() on every request
// (which can deadlock when many requests are in flight back-to-back).
let cachedToken = null;
supabase.auth.getSession().then(({ data }) => {
    cachedToken = data?.session?.access_token || null;
});
supabase.auth.onAuthStateChange((_event, session) => {
    cachedToken = session?.access_token || null;
});

const api = axios.create({
    baseURL: API_BASE,
});

api.interceptors.request.use((cfg) => {
    if (cachedToken) cfg.headers.Authorization = `Bearer ${cachedToken}`;
    return cfg;
});

export function formatApiError(err) {
    const detail = err?.response?.data?.detail;
    if (!detail) return err.message || "Something went wrong";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail.map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d))).join("; ");
    if (typeof detail?.msg === "string") return detail.msg;
    return String(detail);
}

export default api;
