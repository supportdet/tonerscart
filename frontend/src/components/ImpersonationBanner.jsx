import React, { useEffect, useState } from "react";
import { UserCog, X } from "lucide-react";

/**
 * Wave 79 — sticky "Acting as <dealer>" banner.
 *
 * Mounted globally in App.js. Renders whenever the admin has flipped into
 * impersonation mode via DealerProfile.jsx → actAsDealer (same-tab). The
 * admin's bearer token is preserved; only the X-Impersonate-User-Id
 * header changes (api.js interceptor). "End Session" clears the flag and
 * returns to the originating admin page (or /admin if missing).
 */
export default function ImpersonationBanner() {
    const [name, setName] = useState(null);

    useEffect(() => {
        const read = () => {
            try {
                setName(window.sessionStorage.getItem("tc_impersonate_name"));
            } catch { setName(null); }
        };
        read();
        // Re-read on storage changes (e.g. End Session in another tab) and
        // on every route change in this tab.
        const onStorage = () => read();
        const onFocus = () => read();
        window.addEventListener("storage", onStorage);
        window.addEventListener("focus", onFocus);
        // also re-poll every 1s so same-tab state changes propagate even
        // without an explicit event
        const t = setInterval(read, 1000);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("focus", onFocus);
            clearInterval(t);
        };
    }, []);

    const end = () => {
        let returnTo = "/admin";
        try {
            returnTo = window.sessionStorage.getItem("tc_impersonate_return_to") || "/admin";
            window.sessionStorage.removeItem("tc_impersonate_user_id");
            window.sessionStorage.removeItem("tc_impersonate_name");
            window.sessionStorage.removeItem("tc_impersonate_supplier_id");
            window.sessionStorage.removeItem("tc_impersonate_return_to");
        } catch { /* ignore */ }
        window.location.href = returnTo;
    };

    if (!name) return null;
    return (
        <div
            className="fixed top-0 inset-x-0 z-[80] bg-amber-500 text-[#0A0A0B] border-b border-amber-700/30 shadow-md"
            data-testid="impersonation-banner"
        >
            <div className="tc-container py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <UserCog size={15} />
                    Acting as <span className="font-bold">{name}</span> — Admin Mode
                </div>
                <button
                    onClick={end}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 h-8 rounded-full bg-[#0A0A0B] text-white hover:bg-[#23252B]"
                    data-testid="impersonation-end-btn"
                >
                    <X size={12} /> End Session
                </button>
            </div>
        </div>
    );
}
