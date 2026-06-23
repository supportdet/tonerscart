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
    if (!roleOk && !pendingOk) return <Navigate to="/" replace />;
    return children;
}
