import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ShoppingBag, Store, X, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const SEEN_KEY = "tc_role_chooser_seen_v1";
const HIDE_ROUTES = ["/login", "/register", "/admin", "/auth/callback"];

/**
 * First-visit popup that asks the user whether they're a Buyer or Seller.
 * - Skipped if already shown on this device.
 * - Skipped while logged in.
 * - Skipped on auth/admin routes.
 * - Backdrop is blurred + dim.
 */
export default function RoleChooserPopup() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, loading } = useAuth();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (loading) return;
        if (user) return;
        if (HIDE_ROUTES.some((r) => location.pathname.startsWith(r))) return;
        try {
            if (localStorage.getItem(SEEN_KEY)) return;
        } catch {}
        const t = setTimeout(() => setOpen(true), 500);
        return () => clearTimeout(t);
    }, [user, loading, location.pathname]);

    const dismiss = () => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
        setOpen(false);
    };

    const choose = (role) => {
        dismiss();
        if (role === "buyer") navigate("/search");
        else navigate("/register?role=supplier");
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            data-testid="role-chooser-backdrop"
            style={{
                backgroundColor: "rgba(10,10,11,0.55)",
                backdropFilter: "blur(14px) saturate(140%)",
                WebkitBackdropFilter: "blur(14px) saturate(140%)",
            }}
            onClick={dismiss}
        >
            <div
                className="relative w-full max-w-lg bg-white rounded-2xl border border-black/[0.08] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                data-testid="role-chooser-card"
            >
                <button
                    onClick={dismiss}
                    className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full hover:bg-black/[0.06] text-[#6E6E73]"
                    aria-label="Close"
                    data-testid="role-chooser-close"
                >
                    <X size={18} />
                </button>

                <div className="px-6 sm:px-8 pt-8 pb-6 text-center">
                    <div className="inline-flex items-center gap-2 mb-3">
                        <span className="w-1.5 h-4 rounded-sm bg-[#00B7C7]" />
                        <span className="w-1.5 h-4 rounded-sm bg-[#E6007E]" />
                        <span className="w-1.5 h-4 rounded-sm bg-[#F5C400]" />
                        <span className="w-1.5 h-4 rounded-sm bg-[#0A0A0B]" />
                    </div>
                    <h2
                        className="text-[#0A0A0B]"
                        style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(22px, 2.6vw, 30px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.2 }}
                    >
                        Welcome to TonersCart
                    </h2>
                    <p className="mt-2 text-[14px] text-[#6E6E73]">
                        India&apos;s focused B2B marketplace for printer toners. Tell us what you&apos;re here for.
                    </p>
                </div>

                <div className="px-4 sm:px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        onClick={() => choose("buyer")}
                        className="group text-left rounded-xl border border-[#E5E5EA] bg-white p-5 hover:border-[#00B7C7] hover:shadow-md transition flex flex-col gap-3"
                        data-testid="role-chooser-buyer"
                    >
                        <div className="w-11 h-11 rounded-full bg-[#E0F7FA] grid place-items-center text-[#00B7C7]">
                            <ShoppingBag size={20} />
                        </div>
                        <div>
                            <div className="text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>I&apos;m a Buyer</div>
                            <div className="text-[12.5px] text-[#6E6E73] mt-1 leading-snug">Search verified suppliers and place direct order requests.</div>
                        </div>
                        <div className="mt-auto inline-flex items-center text-[12.5px] font-semibold text-[#00B7C7] gap-1">
                            Browse toners <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </button>

                    <button
                        onClick={() => choose("seller")}
                        className="group text-left rounded-xl border border-[#E5E5EA] bg-white p-5 hover:border-[#E6007E] hover:shadow-md transition flex flex-col gap-3"
                        data-testid="role-chooser-seller"
                    >
                        <div className="w-11 h-11 rounded-full bg-[#FFE0F0] grid place-items-center text-[#E6007E]">
                            <Store size={20} />
                        </div>
                        <div>
                            <div className="text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>I&apos;m a Seller</div>
                            <div className="text-[12.5px] text-[#6E6E73] mt-1 leading-snug">Apply to list your toner stock — quick admin review.</div>
                        </div>
                        <div className="mt-auto inline-flex items-center text-[12.5px] font-semibold text-[#E6007E] gap-1">
                            Apply now <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </button>
                </div>

                <div className="px-6 pb-5 text-center">
                    <button onClick={dismiss} className="text-[12px] text-[#86868B] hover:text-[#0A0A0B]" data-testid="role-chooser-skip">
                        Skip for now
                    </button>
                </div>
            </div>
        </div>
    );
}
