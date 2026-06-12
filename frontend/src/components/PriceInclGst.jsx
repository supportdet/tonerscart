import React from "react";
import { inclGstPrice, formatINR } from "../lib/listingConstants";

/**
 * Renders a GST-inclusive price with a small "Price incl. GST" tag underneath.
 * Used by every product card and detail page so the buyer sees the final
 * payable amount upfront (the GST line is no longer added at checkout).
 *
 * Props:
 *   base        — number, the seller's base price (price / price_per_ream / etc.).
 *   gstRate     — number, percent. Falls back to 18% inside `inclGstPrice` if null.
 *   testId      — optional data-testid for the visible amount.
 *   size        — "sm" | "md" | "lg" — controls font size.
 *   tag         — boolean, default true. Set false to omit the tiny "incl. GST" tag.
 */
export default function PriceInclGst({
    base, gstRate, testId, size = "md", tag = true, className = "", align = "left",
}) {
    const value = inclGstPrice(base, gstRate);
    const amountSize = size === "lg"
        ? "text-[20px]"
        : size === "sm"
        ? "text-[14px]"
        : "text-[16px]";
    const alignCls = align === "right" ? "items-end text-right" : "items-start text-left";
    return (
        <div className={`inline-flex flex-col ${alignCls} ${className}`}>
            <div
                className={`font-mono ${amountSize} font-semibold text-[#0A0A0B] leading-none`}
                data-testid={testId}
            >
                {formatINR(value)}
            </div>
            {tag && (
                <div className="text-[9.5px] font-medium tracking-[0.05em] text-[#86868B] mt-1 uppercase">
                    Price incl. GST
                </div>
            )}
        </div>
    );
}
