import axios from "axios";
import { supabase } from "./supabase";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BASE}/api`;

// Cache the access token to avoid calling supabase.auth.getSession() on every request
// (which can deadlock when many requests are in flight back-to-back).
let cachedToken = null;
// Promise that resolves once the initial session restore from storage completes.
// The request interceptor awaits this before the FIRST authed call so we never
// fire /auth/me without a token (which previously caused a 401 → false redirect
// to /login → auth flicker for logged-in users on reload).
const sessionReady = supabase.auth.getSession().then(({ data }) => {
    cachedToken = data?.session?.access_token || null;
});
supabase.auth.onAuthStateChange((_event, session) => {
    cachedToken = session?.access_token || null;
});

const api = axios.create({
    baseURL: API_BASE,
});

// Resolve the current access token, awaiting the initial session restore once.
// Returns null for guests — callers can use this to skip authed-only requests
// (e.g. /auth/me) and avoid noisy 401s in the console on public pages.
export async function getAccessToken() {
    if (cachedToken == null) {
        try { await sessionReady; } catch { /* ignore */ }
    }
    return cachedToken;
}

api.interceptors.request.use(async (cfg) => {
    // Ensure the initial Supabase session restore has finished before attaching
    // the token. For guests this resolves quickly with a null token (no block).
    if (cachedToken == null) {
        try { await sessionReady; } catch { /* ignore */ }
    }
    if (cachedToken) cfg.headers.Authorization = `Bearer ${cachedToken}`;
    // Wave 77 — admin impersonation. When an admin has flipped into "Act as
    // Dealer" mode (via sessionStorage flag set by DealerProfile.jsx), every
    // subsequent API call carries the dealer's user_id in X-Impersonate-User-Id.
    // The backend's require_user() honours this header only when the caller
    // is an admin and logs each impersonated request to audit_log.
    try {
        const impersonateId = typeof window !== "undefined"
            ? window.sessionStorage.getItem("tc_impersonate_user_id")
            : null;
        if (impersonateId) cfg.headers["X-Impersonate-User-Id"] = impersonateId;
    } catch { /* ignore */ }
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
