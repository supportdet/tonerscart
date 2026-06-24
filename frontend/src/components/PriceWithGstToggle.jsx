import React from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
    formatINR,
    priceFromInclusive,
    withGst,
    GST_RATES,
} from "../lib/listingConstants";
import { payoutBreakdown } from "../lib/commission";

/**
 * Reusable price input with a small inline incl/excl GST pill toggle.
 *
 * UX requirements (2026-06-12):
 *   • Compact pill toggle ("Incl. GST" / "Excl. GST") sitting INLINE next to
 *     the price label — must NOT dominate the form.
 *   • Both options start UNSELECTED — dealer MUST choose one explicitly so
 *     we never assume incl/excl on their behalf.
 *   • When `error` is true (parent forces this on submit attempts without a
 *     priceType selection) the pills + price input border turn red and an
 *     inline message appears.
 *
 * Layout (top-to-bottom):
 *   1. GST rate dropdown  (rendered FIRST so the toggle calculation is accurate)
 *   2. Price label + the small Incl/Excl pill toggle on the same line
 *   3. Price input
 *   4. Helper line: "Buyer will see: ₹XXX (incl. GST)" — only shown once
 *      the dealer has both picked a price type and typed an amount.
 *
 * Props
 *   priceLabel        string  e.g. "Price (₹)" or "Price per ream (₹)"
 *   value             string  controlled — what the dealer is typing
 *   onChange(value)   fn      called as dealer types
 *   priceType         null | "incl" | "excl"
 *   onPriceTypeChange(next) fn
 *   gstRate           number  current GST rate
 *   onGstRateChange(next) fn
 *   error             bool    parent sets true when validation fails so the
 *                             toggle and input render in red
 *   required          bool
 *   testIdPrefix      string  e.g. "paper"
 *   step, min         optional Input attrs
 *   showGstSelect     bool, default true. Set false if the parent renders its
 *                     own GST dropdown elsewhere (e.g. toner multi-variant form).
 */
export default function PriceWithGstToggle({
    priceLabel = "Price (₹)",
    value,
    onChange,
    priceType,
    onPriceTypeChange,
    gstRate,
    onGstRateChange,
    error = false,
    required = false,
    testIdPrefix = "price",
    step = "0.01",
    min = "0",
    showGstSelect = true,
}) {
    const isIncl = priceType === "incl";
    const isExcl = priceType === "excl";
    const typed = Number(value || 0);
    const base = isIncl ? priceFromInclusive(typed, gstRate) : typed;
    const buyerSees = isIncl ? Math.round(typed) : withGst(base, gstRate);

    const pillBase = "h-7 px-3 text-[11.5px] font-semibold rounded-full transition focus:outline-none focus:ring-2 focus:ring-[#00B7C7]/40";
    const pillSel = "bg-[#0A0A0B] text-white shadow-sm";
    const pillUnsel = error
        ? "bg-white text-red-600 border border-red-400 hover:bg-red-50"
        : "bg-white text-[#6E6E73] border border-black/[0.12] hover:bg-black/[0.04]";

    return (
        <div className="space-y-2.5" data-testid={`${testIdPrefix}-price-block`}>
            {showGstSelect && (
                <div>
                    <Label>GST rate (%) <span className="text-red-500">*</span></Label>
                    <select
                        value={gstRate}
                        onChange={(e) => onGstRateChange(Number(e.target.value))}
                        className="tc-input-lg w-full"
                        data-testid={`${testIdPrefix}-gst-rate`}
                    >
                        {GST_RATES.map((g) => (
                            <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Label className="!mb-0">
                    {priceLabel}
                    {required && <span className="text-red-500"> *</span>}
                </Label>
                <div className="inline-flex items-center gap-1.5" role="radiogroup" aria-label="Price type" data-testid={`${testIdPrefix}-price-type-group`}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={isIncl}
                        onClick={() => onPriceTypeChange("incl")}
                        className={`${pillBase} ${isIncl ? pillSel : pillUnsel}`}
                        data-testid={`${testIdPrefix}-price-type-incl`}
                    >
                        Incl. GST
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={isExcl}
                        onClick={() => onPriceTypeChange("excl")}
                        className={`${pillBase} ${isExcl ? pillSel : pillUnsel}`}
                        data-testid={`${testIdPrefix}-price-type-excl`}
                    >
                        Excl. GST
                    </button>
                </div>
            </div>

            <div>
                <Input
                    type="number"
                    min={min}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    required={required}
                    className={`tc-input-lg ${error ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                    data-testid={`${testIdPrefix}-price-input`}
                    placeholder={isIncl ? "Final price the buyer pays" : isExcl ? "Base price before GST" : "Type the price, then pick Incl. or Excl. GST"}
                />
                {error && (
                    <div className="text-[12px] text-red-600 mt-1.5" data-testid={`${testIdPrefix}-price-type-error`}>
                        Pick whether this price <strong>includes</strong> or <strong>excludes</strong> GST before publishing.
                    </div>
                )}
                {typed > 0 && priceType ? (
                    <>
                        <div
                            className="text-[12px] text-[#0A0A0B] bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                            data-testid={`${testIdPrefix}-price-preview`}
                        >
                            <span>
                                Buyer will see: <strong data-testid={`${testIdPrefix}-buyer-sees`}>{formatINR(buyerSees)} (incl. GST)</strong>
                            </span>
                            <span className="text-[#6E6E73]">·</span>
                            <span className="text-[#6E6E73]">
                                Base: {formatINR(base)} + GST {gstRate}%: {formatINR(buyerSees - base)}
                            </span>
                        </div>
                        {(() => {
                            // Wave 60 — live, plain-language payout breakdown rendered
                            // directly under the price input. Updates as dealer types.
                            // Wording chosen so a first-time dealer understands at a glance
                            // what TonersCart takes and what lands in their bank.
                            const pb = payoutBreakdown(typed, priceType, gstRate);
                            if (!pb) return null;
                            return (
                                <div
                                    className="mt-2 rounded-lg border border-black/[0.08] bg-white px-3.5 py-3 text-[12.5px] text-[#0A0A0B] leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                                    data-testid={`${testIdPrefix}-payout-breakdown`}
                                >
                                    <div className="text-[11px] font-semibold tracking-wide text-[#6E6E73] uppercase mb-2">
                                        What you&rsquo;ll earn on this listing
                                    </div>
                                    <div className="flex justify-between font-bold text-[#065F46]" data-testid={`${testIdPrefix}-payout-net`}>
                                        <span>You&rsquo;ll receive (per unit):</span>
                                        <span className="font-mono">{formatINR(pb.basePrice - pb.commission)}</span>
                                    </div>
                                    <div className="text-[11px] text-[#6E6E73] mt-2 leading-snug">
                                        GST of {formatINR(pb.gstAmount)} ({gstRate}%) and delivery charges pass through to you in full.
                                    </div>
                                </div>
                            );
                        })()}
                    </>
                ) : typed > 0 && !priceType && !error ? (
                    <div className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2" data-testid={`${testIdPrefix}-price-type-hint`}>
                        Now pick <strong>Incl. GST</strong> or <strong>Excl. GST</strong> above so we know whether the figure you typed is the final price or the base price.
                    </div>
                ) : (!error && (
                    <div className="text-[11px] text-[#86868B] mt-1">
                        Buyer always sees the GST-inclusive price on the live listing card. We store the base price.
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Convenience used by parent forms on submit to derive the base price that
 * must be stored. Returns 0 when priceType is unset — parent should validate
 * priceType separately (the helper itself does not throw).
 */
export const getBasePrice = (value, priceType, gstRate) => {
    const v = Number(value || 0);
    if (v <= 0 || !priceType) return 0;
    return priceType === "incl" ? priceFromInclusive(v, gstRate) : v;
};
