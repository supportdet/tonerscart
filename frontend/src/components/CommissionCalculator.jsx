import React, { useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { payoutBreakdown, COMMISSION_TIERS } from "../lib/commission";
import { GST_RATES } from "../lib/listingConstants";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function CommissionCalculator() {
    const [price, setPrice] = useState("");
    // Default to neither — dealer must pick so the calculator is unambiguous.
    const [priceType, setPriceType] = useState(null);
    const [gstRate, setGstRate] = useState(18);
    const result = payoutBreakdown(price, priceType, gstRate);

    const pillBase = "h-7 px-3 text-[11.5px] font-semibold rounded-full transition focus:outline-none focus:ring-2 focus:ring-[#F5C400]/40";
    const pillSel = "bg-[#0A0A0B] text-white shadow-sm";
    const pillUnsel = "bg-white text-[#6E6E73] border border-black/[0.12] hover:bg-black/[0.04]";

    return (
        <div className="tc-card-flat p-5 sm:p-6" data-testid="commission-calculator" style={{ fontFamily: "'Inter', sans-serif" }}>
            <div className="flex items-center gap-2 mb-3">
                <Calculator size={16} className="text-[#F5C400]" />
                <h3 className="text-[#0A0A0B] text-[17px] font-semibold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, letterSpacing: "-0.01em" }}>
                    Estimate your payout
                </h3>
            </div>
            <p className="text-[13px] text-[#6E6E73] mb-4">
                Commission is calculated on your <strong>base price only</strong>. GST and delivery pass through to you in full.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <Label htmlFor="calc-gst">GST rate</Label>
                    <select
                        id="calc-gst"
                        value={gstRate}
                        onChange={(e) => setGstRate(Number(e.target.value))}
                        className="w-full h-11 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]"
                        data-testid="calc-gst-rate"
                    >
                        {GST_RATES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                </div>
                <div>
                    <Label>Your price is</Label>
                    <div className="inline-flex items-center gap-1.5 h-11">
                        <button type="button" onClick={() => setPriceType("incl")} className={`${pillBase} ${priceType === "incl" ? pillSel : pillUnsel}`} data-testid="calc-price-type-incl">Incl. GST</button>
                        <button type="button" onClick={() => setPriceType("excl")} className={`${pillBase} ${priceType === "excl" ? pillSel : pillUnsel}`} data-testid="calc-price-type-excl">Excl. GST</button>
                    </div>
                </div>
            </div>

            <Label htmlFor="calc-price">Listing price (₹)</Label>
            <Input
                id="calc-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="e.g. 12500"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-11 text-[15px]"
                data-testid="calc-price-input"
            />
            {!priceType && Number(price) > 0 && (
                <div className="mt-2 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" data-testid="calc-price-type-hint">
                    Pick <strong>Incl. GST</strong> or <strong>Excl. GST</strong> above to see your payout.
                </div>
            )}

            {result ? (
                <div className="mt-5 space-y-2.5" data-testid="calc-result">
                    <Row label="Buyer pays (incl. GST)" value={fmt(result.buyerInclPrice)} valueClass="text-[#0A0A0B]" testid="calc-buyer-pays" />
                    <Row label="Base price (commission applied on this)" value={fmt(result.basePrice)} valueClass="text-[#0A0A0B]" testid="calc-base-price" />
                    <Row label={`TonersCart commission (${result.rateLabel})`} value={`−${fmt(result.commission)}`} valueClass="text-red-700" testid="calc-commission" />
                    <Row label="GST passed through to you" value={`+${fmt(result.gstAmount)}`} valueClass="text-emerald-700" testid="calc-gst-passthrough" />
                    <div className="pt-2 mt-2 border-t border-black/[0.08]">
                        <Row label="Your payout (before delivery)" value={fmt(result.dealerPayout)} valueClass="text-emerald-700 font-bold text-[18px]" testid="calc-payout" />
                    </div>
                    <div className="text-[11px] text-[#86868B] mt-2">Delivery charges are passed through to you in full and added to this payout when the order ships.</div>
                </div>
            ) : (
                <div className="mt-5 text-[12.5px] text-[#86868B]">Enter a price and pick Incl/Excl GST to see your payout.</div>
            )}

            <div className="mt-5 pt-4 border-t border-black/[0.06]">
                <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#86868B] mb-2" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>Tier table</div>
                <ul className="space-y-1.5 text-[13px] text-[#1D1D1F]" data-testid="calc-tier-list">
                    {COMMISSION_TIERS.map((t) => (
                        <li key={t.id} className="flex items-center justify-between">
                            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>{t.label}</span>
                            <span className="font-mono text-[14px] text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>{t.rateLabel}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function Row({ label, value, valueClass, testid }) {
    return (
        <div className="flex items-center justify-between gap-3" data-testid={testid}>
            <span className="text-[13px] text-[#6E6E73]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>{label}</span>
            <span className={`text-[14px] font-mono ${valueClass}`} style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>{value}</span>
        </div>
    );
}
