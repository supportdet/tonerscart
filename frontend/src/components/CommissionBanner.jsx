import React from "react";

/**
 * Plain-language base-price clarity box. Wave 58 — replaces the older yellow
 * commission-explainer banner. Rendered DIRECTLY ABOVE the price input on
 * every dealer upload form so dealers stop pricing at cost-price by mistake.
 *
 * Design rules from product owner:
 *   - large simple words, short sentences, no jargon
 *   - one example sentence (₹800 cost) so it's concrete, not abstract
 *   - generous spacing — clarity over brevity
 *   - one-line commission slab reference (plain text, no table)
 */
export default function CommissionBanner({ className = "" }) {
    return (
        <div
            className={`mt-3 mb-4 rounded-xl border border-black/[0.08] bg-[#F5F5F7] p-5 sm:p-6 text-[#0A0A0B] ${className}`}
            data-testid="commission-banner"
        >
            <div className="text-[13.5px] font-semibold mb-2.5">
                This is the price you set — TonersCart commission comes out of it automatically.
            </div>
            <p className="text-[13px] leading-relaxed text-[#0A0A0B]/85 mb-2.5">
                Make sure this price covers your cost + your profit + our commission, all together.
            </p>
            <p className="text-[13px] leading-relaxed text-[#0A0A0B]/85 mb-2.5">
                Example: if you bought it for <strong>₹800</strong>, don&rsquo;t put <strong>₹800</strong> here — you&rsquo;ll lose money.
                Put a price that leaves you a good profit after commission is deducted.
            </p>
            <p className="text-[12px] leading-relaxed text-[#0A0A0B]/65 mt-3" data-testid="commission-slabs-line">
                Commission: under ₹15K = 12% &middot; ₹15K&ndash;₹30K = 10% &middot; ₹30K&ndash;₹75K = 8% &middot; ₹75K&ndash;₹1L = 6% &middot; ₹1L+ = 5%
            </p>
        </div>
    );
}
