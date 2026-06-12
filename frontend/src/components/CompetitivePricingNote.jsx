import React from "react";
import { TrendingUp } from "lucide-react";

/**
 * One-liner nudge shown just above the Publish button on every dealer upload
 * form (toners, printers, papers, consumables, scanners). Encourages dealers
 * to set competitive prices so their listings convert better.
 */
export default function CompetitivePricingNote() {
    return (
        <div
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-[#5a4400] mt-2"
            data-testid="competitive-pricing-note"
        >
            <TrendingUp size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <span>
                <strong>Tip:</strong> Setting a competitive price significantly boosts your sales — buyers compare dealer prices side-by-side, and sharper pricing puts you at the top of the results.
            </span>
        </div>
    );
}
