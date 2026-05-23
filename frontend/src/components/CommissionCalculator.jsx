import React, { useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { commissionFor, COMMISSION_TIERS } from "../lib/commission";

export default function CommissionCalculator() {
    const [price, setPrice] = useState("");
    const result = commissionFor(price);

    return (
        <div className="tc-card-flat p-5 sm:p-6" data-testid="commission-calculator">
            <div className="flex items-center gap-2 mb-3">
                <Calculator size={16} className="text-[#F5C400]" />
                <h3 className="text-[#0A0A0B] text-[15px] font-semibold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    Estimate your payout
                </h3>
            </div>
            <p className="text-[12.5px] text-[#6E6E73] mb-4">
                Enter your listing price to see TonersCart&apos;s commission and your final payout.
            </p>

            <Label htmlFor="calc-price">Your listing price (₹)</Label>
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

            {result ? (
                <div className="mt-5 space-y-3" data-testid="calc-result">
                    <Row
                        label="TonersCart commission"
                        valueClass="text-[#0A0A0B]"
                        value={result.commission === null
                            ? "Contact team for deal-basis pricing"
                            : `−₹${result.commission.toLocaleString("en-IN")} (${result.rateLabel})`}
                    />
                    <Row
                        label="Your payout"
                        valueClass="text-emerald-700 font-bold text-[18px]"
                        value={result.payout === null
                            ? "—"
                            : `₹${result.payout.toLocaleString("en-IN")}`}
                    />
                    <Row
                        label="Effective commission rate"
                        valueClass="text-[#0A0A0B]"
                        value={result.rateLabel}
                    />
                </div>
            ) : (
                <div className="mt-5 text-[12.5px] text-[#86868B]">Enter a price to see your payout.</div>
            )}

            <div className="mt-5 pt-4 border-t border-black/[0.06]">
                <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B] mb-2">Tier table</div>
                <ul className="space-y-1 text-[12px] text-[#3a3a40]" data-testid="calc-tier-list">
                    {COMMISSION_TIERS.map((t) => (
                        <li key={t.id} className="flex items-center justify-between">
                            <span>{t.label}</span>
                            <span className="font-mono font-semibold">{t.rateLabel}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function Row({ label, value, valueClass }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-[#6E6E73]">{label}</span>
            <span className={`text-[13.5px] font-semibold font-mono ${valueClass}`}>{value}</span>
        </div>
    );
}
