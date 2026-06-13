// Commission utility — shared by Add Toner, Add Printer, Calculator, Order Detail.
// Tiers per TonersCart commercial policy (2026), charged on the order BILL VALUE
// EXCLUDING GST / taxes and EXCLUDING delivery, deducted from the seller's payout:
//   Under ₹15,000        → 12%
//   ₹15,000 – ₹30,000    → 10%
//   ₹30,000 – ₹75,000    → 8%
//   ₹75,000 – ₹1,00,000  → 6%
//   ₹1,00,000 & above    → 5%
//
// GST and delivery are passed through to the dealer in full — TonersCart never
// takes a cut on either. The customer's bill = base + GST + delivery; no
// platform fee is added on the buyer side.

export const COMMISSION_TIERS = [
    { id: "tier1", upTo: 15000,    rate: 0.12, label: "Under ₹15,000",        rateLabel: "12%" },
    { id: "tier2", upTo: 30000,    rate: 0.10, label: "₹15,000 – ₹30,000",    rateLabel: "10%" },
    { id: "tier3", upTo: 75000,    rate: 0.08, label: "₹30,000 – ₹75,000",    rateLabel: "8%" },
    { id: "tier4", upTo: 100000,   rate: 0.06, label: "₹75,000 – ₹1,00,000",  rateLabel: "6%" },
    { id: "tier5", upTo: Infinity, rate: 0.05, label: "₹1,00,000 & above",    rateLabel: "5%" },
];

/**
 * Calculate commission and payout from BASE PRICE (excl GST).
 * Callers should strip GST first using priceFromInclusive when the dealer has
 * entered a GST-inclusive figure.
 */
export function commissionFor(basePrice) {
    const p = Number(basePrice) || 0;
    if (p <= 0) return null;
    const tier = COMMISSION_TIERS.find((t) => p < t.upTo) || COMMISSION_TIERS[COMMISSION_TIERS.length - 1];
    const commission = Math.round(p * tier.rate);
    return {
        price: p,
        rate: tier.rate,
        rateLabel: tier.rateLabel,
        commission,
        payout: p - commission, // legacy field — does NOT include GST/delivery
        tier,
    };
}

/**
 * Full payout breakdown given dealer's typed price, whether it's inclusive of
 * GST or not, and the GST rate. Returns everything the calculator + upload
 * forms need to display.
 *
 *   basePrice          – GST-exclusive base (what TonersCart stores + uses for commission)
 *   gstAmount          – Tax on top of base (passed through to dealer in full)
 *   buyerInclPrice     – base + GST (what the customer pays at checkout, before delivery)
 *   commission         – TonersCart fee on basePrice only
 *   dealerPayout       – basePrice − commission + gstAmount (delivery added separately at order time)
 *   rateLabel          – e.g. "12%"
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
    "TonersCart commission is calculated on your base price (excluding GST) only. GST and delivery charges are passed through to you in full. Commission tiers: under ₹15K = 12% · ₹15K–₹30K = 10% · ₹30K–₹75K = 8% · ₹75K–₹1L = 6% · ₹1L & above = 5%.";

export const COMMISSION_PAYOUT_NOTE =
    "We take our commission only on the base price — GST and delivery flow through to you in full. Customers never pay any extra platform fee.";
