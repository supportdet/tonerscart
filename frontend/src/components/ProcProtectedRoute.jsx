import React from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useProcAuth } from "../context/ProcAuthContext";

export default function ProcProtectedRoute({ children }) {
    const { user, loading } = useProcAuth();
    if (loading) {
        return (
            <div className="min-h-[60vh] grid place-items-center text-[#6E6E73]" data-testid="proc-route-loading">
                <Loader2 className="animate-spin" size={20} />
            </div>
        );
    }
    if (!user) return <Navigate to="/procurement/login" replace />;
    return children;
}
