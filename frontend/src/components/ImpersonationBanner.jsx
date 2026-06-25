import React, { useEffect, useState } from "react";
import { UserCog, X } from "lucide-react";

/**
 * Wave 77 — persistent "Acting as <dealer>" banner.
 *
 * Shown across every page whenever sessionStorage has the impersonation
 * flags set (by DealerProfile.jsx → actAsDealer). The banner stays sticky
 * at the top of the viewport so the admin always sees it. Clicking "End"
 * clears the flags and reloads the current page.
 *
 * The flags use both session AND local storage so a new browser tab opened
 * from the admin click (which has its own sessionStorage) can copy them
 * across on mount.
 */
export default function ImpersonationBanner() {
    const [name, setName] = useState(null);

    useEffect(() => {
        const read = () => {
            try {
                let n = window.sessionStorage.getItem("tc_impersonate_name");
                if (!n) {
                    // First-tab-load handoff: copy from localStorage that the
                    // originating tab set, then clear local so a future
                    // restart doesn't accidentally resume impersonation.
                    n = window.localStorage.getItem("tc_impersonate_name");
                    const uid = window.localStorage.getItem("tc_impersonate_user_id");
                    const sid = window.localStorage.getItem("tc_impersonate_supplier_id");
                    if (n && uid) {
                        window.sessionStorage.setItem("tc_impersonate_name", n);
                        window.sessionStorage.setItem("tc_impersonate_user_id", uid);
                        if (sid) window.sessionStorage.setItem("tc_impersonate_supplier_id", sid);
                        // clear local so it doesn't leak into other tabs
                        window.localStorage.removeItem("tc_impersonate_name");
                        window.localStorage.removeItem("tc_impersonate_user_id");
                        window.localStorage.removeItem("tc_impersonate_supplier_id");
                    }
                }
                setName(n);
            } catch { setName(null); }
        };
        read();
        const onStorage = () => read();
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const end = () => {
        try {
            window.sessionStorage.removeItem("tc_impersonate_user_id");
            window.sessionStorage.removeItem("tc_impersonate_name");
            window.sessionStorage.removeItem("tc_impersonate_supplier_id");
            window.localStorage.removeItem("tc_impersonate_user_id");
            window.localStorage.removeItem("tc_impersonate_name");
            window.localStorage.removeItem("tc_impersonate_supplier_id");
        } catch { /* ignore */ }
        // Reload to drop any cached dealer-scoped data
        window.location.href = "/admin";
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
                    <X size={12} /> End impersonation
                </button>
            </div>
        </div>
    );
}
