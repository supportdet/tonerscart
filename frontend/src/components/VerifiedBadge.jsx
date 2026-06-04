import React from "react";
import { BadgeCheck } from "lucide-react";

/**
 * Small, clean "Verified" badge shown next to every dealer / listing.
 * All listed dealers are verified-by-definition (admin approved), so this is
 * a pure presentational component — no backend call.
 *
 * - Desktop: green seal-check icon + "Verified" text.
 * - Mobile (<640px): just the green tick (text hidden) for compactness.
 * - Hover / focus / tap: tooltip explaining the verification.
 *
 * Pass `compact` to always hide the text (e.g. tight card rows).
 */
export default function VerifiedBadge({ compact = false, className = "" }) {
    const tip = "This dealer has been verified by TonersCart — documents reviewed and approved.";
    return (
        <span
            className={`tc-verified group relative inline-flex items-center gap-1 align-middle ${className}`}
            tabIndex={0}
            aria-label={`Verified dealer. ${tip}`}
            data-testid="verified-badge"
        >
            <BadgeCheck size={compact ? 14 : 15} className="text-emerald-600 shrink-0" strokeWidth={2.4} />
            {!compact && (
                <span className="hidden sm:inline text-[11px] font-semibold text-emerald-700 leading-none">Verified</span>
            )}
            <span className="tc-verified-tip" role="tooltip">{tip}</span>
        </span>
    );
}
