import axios from "axios";
import { formatApiError } from "./api";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const PROC_API = `${BASE}/api/procurement`;
const TOKEN_KEY = "tc_proc_token";

export const procToken = {
    get: () => { try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; } },
    set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
    clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

// Dedicated axios instance — attaches the procurement JWT (separate from the
// Supabase session used by the regular customer/dealer/admin api client).
const procApi = axios.create({ baseURL: `${BASE}/api` });
procApi.interceptors.request.use((cfg) => {
    const t = procToken.get();
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
});

export { formatApiError };
export default procApi;
