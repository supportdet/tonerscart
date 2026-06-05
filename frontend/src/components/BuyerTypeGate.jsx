import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Home, Building2, Printer, Landmark, ArrowRight, Loader2, ChevronLeft } from "lucide-react";
import { Input } from "./ui/input";

/**
 * One-time buyer segmentation — shown the first time a customer signs in,
 * before they reach the homepage. Persists `users.user_type` so it never
 * reappears. Renders below the agreement gate (z-900 < z-1000) so the
 * mandatory T&C is answered first.
 */
export default function BuyerTypeGate() {
    const { user, loading, refresh } = useAuth();
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState("menu"); // menu | corporate | govt
    const [gst, setGst] = useState("");

    const eligible = !loading && user && user.role === "customer" && !user.user_type;
    if (!eligible) return null;

    const save = async (userType, extra) => {
        setBusy(true);
        try {
            if (extra?.gst) {
                try { await api.patch("/auth/me", { gst_number: extra.gst }); }
                catch (e) { toast.error(formatApiError(e)); setBusy(false); return; }
            }
            await api.post("/auth/user-type", { user_type: userType });
            await refresh();
            if (extra?.redirect) navigate(extra.redirect);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[900] bg-[#0A0A0B]/75 backdrop-blur-sm flex items-center justify-center p-4" data-testid="buyer-type-gate">
            <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[92vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 sm:p-8">
                    <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#00B7C7] mb-2">Welcome to TonersCart</div>
                    <h2 className="text-[22px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }} data-testid="buyer-type-title">
                        How will you use TonersCart?
                    </h2>
                    <p className="text-[13.5px] text-[#6E6E73] mt-2">This helps us tailor pricing and recommendations. You can change this anytime later.</p>

                    {view === "menu" && (
                        <div className="mt-6 grid grid-cols-1 gap-3" data-testid="buyer-type-options">
                            <Option icon={<Home size={18} />} title="Personal / Home use" desc="Browse and buy for yourself or your home office." disabled={busy} onClick={() => save("personal")} testid="buyer-type-personal" />
                            <Option icon={<Building2 size={18} />} title="Business / Corporate" desc="Add GST for invoicing and unlock bulk pricing visibility." disabled={busy} onClick={() => setView("corporate")} testid="buyer-type-corporate" />
                            <Option icon={<Printer size={18} />} title="I'm a Dealer / Supplier" desc="Sell toners, printers, papers and consumables on TonersCart." disabled={busy} onClick={() => save("dealer", { redirect: "/sell" })} testid="buyer-type-dealer" />
                            <Option icon={<Landmark size={18} />} title="Government Department" desc="Procure through our dedicated government portal." disabled={busy} onClick={() => setView("govt")} testid="buyer-type-govt" />
                        </div>
                    )}

                    {view === "corporate" && (
                        <div className="mt-6" data-testid="buyer-type-corporate-form">
                            <button onClick={() => setView("menu")} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#6E6E73] hover:text-[#0A0A0B] mb-3" data-testid="buyer-type-back">
                                <ChevronLeft size={14} /> Back
                            </button>
                            <label className="text-[13px] font-semibold text-[#0A0A0B]">GST Number <span className="text-[#86868B] font-normal">(optional)</span></label>
                            <Input value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} className="mt-1.5 h-11" data-testid="buyer-type-gst-input" />
                            <p className="text-[11.5px] text-[#86868B] mt-1.5">Adding GST unlocks B2B invoicing and bulk pricing visibility.</p>
                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <button onClick={() => save("corporate")} disabled={busy} className="h-11 rounded-xl border border-[#D2D2D7] text-[13px] font-semibold text-[#0A0A0B] hover:bg-black/[0.03] disabled:opacity-50" data-testid="buyer-type-corporate-skip">Skip for now</button>
                                <button onClick={() => save("corporate", { gst: gst.trim() })} disabled={busy} className="h-11 rounded-xl bg-[#0A0A0B] text-white text-[13px] font-semibold hover:bg-[#1D1D1F] inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="buyer-type-corporate-continue">
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <>Continue <ArrowRight size={14} /></>}
                                </button>
                            </div>
                        </div>
                    )}

                    {view === "govt" && (
                        <div className="mt-6" data-testid="buyer-type-govt-msg">
                            <button onClick={() => setView("menu")} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#6E6E73] hover:text-[#0A0A0B] mb-3" data-testid="buyer-type-back-govt">
                                <ChevronLeft size={14} /> Back
                            </button>
                            <div className="rounded-xl bg-[#EEF2FF] border border-[#C7D2FE] p-4 text-[13.5px] text-[#1E3A8A]">
                                For government procurement, please use our dedicated portal with L1/L2/L3 comparison, sealed quotations and PDF reports.
                            </div>
                            <button
                                onClick={() => save("referred_to_procurement", { redirect: "/procurement/login" })}
                                disabled={busy}
                                className="mt-5 w-full h-11 rounded-xl bg-[#1E3A8A] text-white text-[13px] font-semibold hover:bg-[#1B3478] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                                data-testid="buyer-type-govt-portal-btn"
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <>Go to Government Portal <ArrowRight size={14} /></>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Option({ icon, title, desc, onClick, disabled, testid }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="text-left flex items-start gap-3.5 rounded-xl border border-[#E5E5EA] hover:border-[#0A0A0B] p-4 transition disabled:opacity-50"
            data-testid={testid}
        >
            <span className="shrink-0 w-10 h-10 rounded-full bg-[#F4F4F6] grid place-items-center text-[#0A0A0B]">{icon}</span>
            <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-[#0A0A0B]">{title}</span>
                <span className="block text-[12.5px] text-[#6E6E73] mt-0.5">{desc}</span>
            </span>
        </button>
    );
}
