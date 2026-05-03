import axios from "axios";
import { supabase } from "./supabase";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BASE}/api`;

const api = axios.create({
    baseURL: API_BASE,
});

api.interceptors.request.use(async (cfg) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
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
