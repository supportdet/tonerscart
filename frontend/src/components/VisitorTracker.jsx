import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Anonymous, non-blocking pageview tracker. Fires `POST /api/analytics/pageview`
 * via navigator.sendBeacon when available (so it never blocks navigation).
 * Skips admins.
 */
function deviceType() {
    if (typeof window === "undefined") return "desktop";
    const w = window.innerWidth || 1200;
    if (w < 640) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
}

function tzNow() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

export default function VisitorTracker() {
    const location = useLocation();
    const { user } = useAuth();

    useEffect(() => {
        if (user?.role === "admin") return;
        // Skip noisy paths
        const path = location.pathname || "/";
        if (path.startsWith("/auth/") || path.startsWith("/admin")) return;

        const payload = {
            page: path + (location.search || ""),
            timezone: tzNow(),
            device_type: deviceType(),
            referrer: document.referrer || "",
        };
        const url = `${process.env.REACT_APP_BACKEND_URL || ""}/api/analytics/pageview`;
        try {
            const data = new Blob([JSON.stringify(payload)], { type: "application/json" });
            if (navigator.sendBeacon && navigator.sendBeacon(url, data)) return;
        } catch { /* fall through */ }
        // Fire-and-forget fetch fallback
        try {
            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                keepalive: true,
            }).catch(() => { /* ignore */ });
        } catch { /* ignore */ }
    }, [location.pathname, location.search, user?.role]);

    return null;
}
