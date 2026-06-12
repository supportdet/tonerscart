import React from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
    formatINR,
    priceFromInclusive,
    withGst,
    GST_RATES,
} from "../lib/listingConstants";

/**
 * Reusable price input that lets the dealer choose whether the figure they
 * type already includes GST or not. The component is fully controlled — the
 * parent owns `value`, `priceType`, and `gstRate`. On submit, the parent
 * converts the typed `value` into the stored base price using the helpers
 * exported from `listingConstants` (or the convenience `getBasePrice` below).
 *
 * Layout (top-to-bottom, per user spec):
 *   1. GST rate dropdown  (rendered FIRST so the toggle calculation is accurate)
 *   2. Toggle: "Price includes GST" | "Price excludes GST"  (default: incl)
 *   3. Price input
 *   4. Helper line: "Buyer will see: ₹XXX (incl. GST)" — shown live
 *
 * Props
 *   priceLabel        string  e.g. "Price (₹)" or "Price per ream (₹)"
 *   value             string  controlled — what the dealer is typing
 *   onChange(value)   fn      called as dealer types
 *   priceType         "incl" | "excl"
 *   onPriceTypeChange(next) fn
 *   gstRate           number  current GST rate
 *   onGstRateChange(next) fn
 *   required          bool
 *   testIdPrefix      string  e.g. "paper" → produces `paper-price-input`,
 *                     `paper-gst-rate`, `paper-price-type-incl`, etc.
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
    required = false,
    testIdPrefix = "price",
    step = "0.01",
    min = "0",
    showGstSelect = true,
}) {
    const isIncl = priceType === "incl";
    const typed = Number(value || 0);
    const base = isIncl ? priceFromInclusive(typed, gstRate) : typed;
    const buyerSees = isIncl ? Math.round(typed) : withGst(base, gstRate);

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
                    <div className="text-[11px] text-[#86868B] mt-1">
                        Select the correct GST rate first — the inclusive ↔ exclusive conversion uses it.
                    </div>
                </div>
            )}

            <div className="inline-flex w-full rounded-lg border border-black/[0.08] overflow-hidden bg-white" role="radiogroup" aria-label="Price type">
                {[
                    { id: "incl", label: "Price includes GST" },
                    { id: "excl", label: "Price excludes GST" },
                ].map((opt) => {
                    const sel = priceType === opt.id;
                    return (
                        <button
                            type="button"
                            key={opt.id}
                            role="radio"
                            aria-checked={sel}
                            onClick={() => onPriceTypeChange(opt.id)}
                            className={`flex-1 px-3 h-9 text-[12.5px] font-semibold transition ${
                                sel
                                    ? "bg-[#0A0A0B] text-white"
                                    : "bg-white text-[#3a3a40] hover:bg-black/[0.03]"
                            }`}
                            data-testid={`${testIdPrefix}-price-type-${opt.id}`}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            <div>
                <Label>
                    {priceLabel} <span className="text-[#86868B] font-normal">— {isIncl ? "incl. GST" : "excl. GST"}</span>
                    {required && <span className="text-red-500"> *</span>}
                </Label>
                <Input
                    type="number"
                    min={min}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    required={required}
                    className="tc-input-lg"
                    data-testid={`${testIdPrefix}-price-input`}
                    placeholder={isIncl ? "Final price you want the buyer to pay" : "Base price before GST"}
                />
                {typed > 0 ? (
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
                ) : (
                    <div className="text-[11px] text-[#86868B] mt-1">
                        Buyer always sees the GST-inclusive price on the live listing card.
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Convenience used by parent forms on submit to derive the base price that
 * must be stored. Mirrors the math used inside the component.
 */
export const getBasePrice = (value, priceType, gstRate) => {
    const v = Number(value || 0);
    if (v <= 0) return 0;
    return priceType === "incl" ? priceFromInclusive(v, gstRate) : v;
};
