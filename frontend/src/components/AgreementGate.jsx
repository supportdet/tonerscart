import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { AGREEMENTS } from "../lib/agreements";

// Render an intro paragraph with "Terms of Service" and "Privacy Policy"
// turned into real <a> tags. Used by the seller agreement intro.
function IntroWithLinks({ text }) {
    const parts = text
        .split(/(Terms of Service|Privacy Policy)/g)
        .map((seg, i) => {
            if (seg === "Terms of Service")
                return <a key={i} href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#00B7C7] font-semibold hover:underline">Terms of Service</a>;
            if (seg === "Privacy Policy")
                return <a key={i} href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#00B7C7] font-semibold hover:underline">Privacy Policy</a>;
            return <React.Fragment key={i}>{seg}</React.Fragment>;
        });
    return <p className="text-[13.5px] text-[#3a3a40] mt-2 leading-relaxed">{parts}</p>;
}

/**
 * Blocking, one-time (versioned) agreement acceptance modal.
 *
 * Generic across both auth systems via props:
 *   statusFn()  -> Promise<{required, agreement_type, version, accepted}>
 *   acceptFn()  -> Promise<void>
 *   ready       -> only check when the user/session is ready
 *
 * While an agreement is required and unaccepted, it renders a full-screen
 * overlay that cannot be dismissed without accepting.
 */
export default function AgreementGate({ ready, statusFn, acceptFn }) {
    const [type, setType] = useState(null);   // agreement type to show, or null
    const [checked, setChecked] = useState(false);
    const [accepting, setAccepting] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let active = true;
        if (!ready) { setType(null); setLoaded(false); return; }
        statusFn()
            .then((s) => {
                if (!active) return;
                if (s && s.required && !s.accepted) setType(s.agreement_type);
                else setType(null);
            })
            .catch(() => { if (active) setType(null); })
            .finally(() => { if (active) setLoaded(true); });
        return () => { active = false; };
    }, [ready, statusFn]);

    if (!ready || !loaded || !type) return null;
    const cfg = AGREEMENTS[type];
    if (!cfg) return null;

    const accept = async () => {
        if (!checked) return;
        setAccepting(true);
        try {
            await acceptFn();
            setType(null);
            setChecked(false);
        } finally {
            setAccepting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" data-testid="agreement-gate">
            <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 sm:p-8">
                    <div className="flex items-center gap-2 text-[#00B7C7] mb-3"><ShieldCheck size={18} /><span className="text-[11px] tracking-[0.18em] uppercase font-semibold">Required agreement</span></div>
                    <h2 className="text-[22px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }} data-testid="agreement-title">{cfg.title}</h2>
                    {cfg.introHasLinks ? (
                        <IntroWithLinks text={cfg.intro} />
                    ) : (
                        <p className="text-[13.5px] text-[#6E6E73] mt-2">{cfg.intro}</p>
                    )}

                    {cfg.simple ? (
                        <p className="text-[13.5px] text-[#3a3a40] mt-4">
                            Please read our{" "}
                            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#00B7C7] font-semibold hover:underline">Terms of Service</a>{" "}and{" "}
                            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#00B7C7] font-semibold hover:underline">Privacy Policy</a>.
                        </p>
                    ) : (
                        <ul className="mt-4 space-y-2.5">
                            {cfg.points.map((p) => (
                                <li key={p} className="flex gap-2 text-[13.5px] text-[#3a3a40] leading-relaxed">
                                    <CheckCircle2 size={16} className="text-[#00B7C7] shrink-0 mt-0.5" /> {p}
                                </li>
                            ))}
                        </ul>
                    )}

                    <label className="flex items-start gap-2.5 mt-6 cursor-pointer select-none" data-testid="agreement-checkbox">
                        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00B7C7]" />
                        <span className="text-[13px] text-[#0A0A0B] font-medium">{cfg.checkbox}</span>
                    </label>

                    <button
                        onClick={accept}
                        disabled={!checked || accepting}
                        className="mt-6 w-full h-12 rounded-xl font-semibold text-[14px] inline-flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "#FFC107", color: "#0A0A0B" }}
                        data-testid="agreement-accept-btn"
                    >
                        {accepting ? <Loader2 size={16} className="animate-spin" /> : null}
                        {accepting ? "Saving…" : (cfg.buttonText || "Accept & continue")}
                    </button>
                </div>
            </div>
        </div>
    );
}
