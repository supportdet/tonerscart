// Referral-fee utility (Wave 95).
// Replaces the previous tiered commission model with a flat 7%. The fee is
// computed on the BASE PRICE (excluding GST). GST and delivery are passed
// through to the dealer in full — no platform cut on either. The customer
// never pays any platform fee on top.

export const COMMISSION_RATE = 0.07;

/**
 * Calculate referral fee and payout from BASE PRICE (excl GST).
 * Returns same shape the old commissionFor() did, with `rateLabel` always
 * "7%" — kept so existing call sites continue working during the rollout.
 */
export function commissionFor(basePrice) {
    const p = Number(basePrice) || 0;
    if (p <= 0) return null;
    const commission = Math.round(p * COMMISSION_RATE * 100) / 100;
    return {
        price: p,
        rate: COMMISSION_RATE,
        rateLabel: "7%",
        commission,
        payout: p - commission, // legacy field — does NOT include GST/delivery
    };
}

/**
 * Full payout breakdown given dealer's typed price, whether it's inclusive of
 * GST or not, and the GST rate. Returns everything the calculator + upload
 * forms need to display.
 *
 *   basePrice          – GST-exclusive base (used for referral-fee calc)
 *   gstAmount          – Tax on top of base (passed through to dealer in full)
 *   buyerInclPrice     – base + GST (what customer pays at checkout)
 *   commission         – TonersCart referral fee on basePrice only (flat 7%)
 *   dealerPayout       – basePrice − commission + gstAmount (delivery added at order time)
 */
export function payoutBreakdown(typedPrice, priceType, gstRate) {
    const v = Number(typedPrice) || 0;
    const r = Number(gstRate || 0);
    if (v <= 0 || !priceType) return null;
    let basePrice;
    let buyerInclPrice;
    if (priceType === "incl") {
        basePrice = r > 0 ? Math.round((v / (1 + r / 100)) * 100) / 100 : v;
        buyerInclPrice = v;
    } else {
        basePrice = v;
        buyerInclPrice = r > 0 ? Math.round(v * (1 + r / 100) * 100) / 100 : v;
    }
    const c = commissionFor(basePrice);
    if (!c) return null;
    const gstAmount = Math.round((buyerInclPrice - basePrice) * 100) / 100;
    const dealerPayout = Math.round((basePrice - c.commission + gstAmount) * 100) / 100;
    return {
        basePrice,
        buyerInclPrice,
        gstAmount,
        commission: c.commission,
        rate: c.rate,
        rateLabel: c.rateLabel,
        dealerPayout,
    };
}

export const COMMISSION_BANNER_TEXT =
    "TonersCart charges a flat referral fee of 7% of your selling price (excluding GST) per completed order. GST and delivery charges are passed through to you in full. The referral fee is shown in rupee terms on every listing form.";

export const COMMISSION_PAYOUT_NOTE =
    "We deduct a flat 7% referral fee from your base price only — GST and delivery flow through to you in full. Customers never pay any platform fee.";
