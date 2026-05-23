import React, { useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

/** Collapsible Return & Dispute Policy box — used on order cards. */
export default function ReturnPolicyBox({ className = "" }) {
    const [open, setOpen] = useState(false);
    return (
        <div
            className={`bg-[#F4F4F6] border border-black/[0.05] rounded-[10px] ${className}`}
            style={{ padding: "14px" }}
            data-testid="return-policy-box"
        >
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between text-left"
                data-testid="return-policy-toggle"
            >
                <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#0A0A0B]">
                    <ShieldCheck size={14} className="text-[#00B7C7]" />
                    Return &amp; Dispute Policy
                </span>
                {open ? <ChevronUp size={14} className="text-[#6E6E73]" /> : <ChevronDown size={14} className="text-[#6E6E73]" />}
            </button>
            {open && (
                <ul className="mt-3 space-y-1.5 text-[12.5px] text-[#3a3a40] list-disc pl-5" data-testid="return-policy-list">
                    <li>7 days return for unopened toner cartridges.</li>
                    <li>3 days for dead-on-arrival printers.</li>
                    <li>Raise a dispute within 48 hours of delivery by emailing <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>.</li>
                </ul>
            )}
        </div>
    );
}
