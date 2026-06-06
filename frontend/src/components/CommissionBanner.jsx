import React from "react";
import { Info } from "lucide-react";
import { COMMISSION_BANNER_TEXT, COMMISSION_PAYOUT_NOTE } from "../lib/commission";

export default function CommissionBanner({ className = "" }) {
    return (
        <div
            className={`mt-2 rounded-[10px] border-l-4 border-[#F5C400] bg-[#FFFBEB] text-[#5C4A00] text-[12.5px] leading-relaxed flex items-start gap-2 ${className}`}
            style={{ padding: "12px 16px" }}
            data-testid="commission-banner"
        >
            <Info size={14} className="mt-0.5 shrink-0 text-[#B07A00]" />
            <span><strong className="font-semibold">{COMMISSION_PAYOUT_NOTE}</strong> {COMMISSION_BANNER_TEXT}</span>
        </div>
    );
}
