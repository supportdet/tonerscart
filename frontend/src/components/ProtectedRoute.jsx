import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, roles, allowApplicationStatus }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="tc-container py-24 text-slate-500" data-testid="loading-state">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    // Wave 65 — let pending applicants (still role=customer until admin approval)
    // through to the dealer dashboard so they see the banner + locked layout
    // instead of a hard block / redirect.
    const roleOk = !roles || roles.includes(user.role);
    const pendingOk =
        Array.isArray(allowApplicationStatus)
        && allowApplicationStatus.includes(user.application_status);
    // Wave 79 — admin impersonation: when an admin has flipped into "Act as
    // Dealer" mode (sessionStorage flag set by DealerProfile.jsx), allow them
    // to view supplier-only routes WITHOUT a real role swap. Their bearer
    // token still says admin; the X-Impersonate-User-Id header (api.js)
    // makes every backend call execute as the target dealer.
    let impersonateOk = false;
    try {
        if (user.role === "admin" && typeof window !== "undefined"
            && window.sessionStorage.getItem("tc_impersonate_user_id")) {
            impersonateOk = true;
        }
    } catch { /* ignore */ }
    if (!roleOk && !pendingOk && !impersonateOk) return <Navigate to="/" replace />;
    return children;
}
