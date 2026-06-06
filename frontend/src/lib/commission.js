// Commission utility — shared by Add Toner, Add Printer, Calculator, Order Detail.
// Tiers per TonersCart commercial policy (2026), charged on the order BILL VALUE
// EXCLUDING GST / taxes, and deducted from the seller's payout:
//   Under ₹15,000        → 12%
//   ₹15,000 – ₹30,000    → 10%
//   ₹30,000 – ₹75,000    → 8%
//   ₹75,000 – ₹1,00,000  → 6%
//   ₹1,00,000 & above    → 5%

export const COMMISSION_TIERS = [
    { id: "tier1", upTo: 15000,    rate: 0.12, label: "Under ₹15,000",        rateLabel: "12%" },
    { id: "tier2", upTo: 30000,    rate: 0.10, label: "₹15,000 – ₹30,000",    rateLabel: "10%" },
    { id: "tier3", upTo: 75000,    rate: 0.08, label: "₹30,000 – ₹75,000",    rateLabel: "8%" },
    { id: "tier4", upTo: 100000,   rate: 0.06, label: "₹75,000 – ₹1,00,000",  rateLabel: "6%" },
    { id: "tier5", upTo: Infinity, rate: 0.05, label: "₹1,00,000 & above",     rateLabel: "5%" },
];

export function commissionFor(price) {
    const p = Number(price) || 0;
    if (p <= 0) return null;
    const tier = COMMISSION_TIERS.find((t) => p < t.upTo) || COMMISSION_TIERS[COMMISSION_TIERS.length - 1];
    const commission = Math.round(p * tier.rate);
    return {
        price: p,
        rate: tier.rate,
        rateLabel: tier.rateLabel,
        commission,
        payout: p - commission,
        tier,
    };
}

export const COMMISSION_BANNER_TEXT =
    "TonersCart commission (on bill value, excluding GST): under ₹15K = 12% · ₹15K–₹30K = 10% · ₹30K–₹75K = 8% · ₹75K–₹1L = 6% · ₹1L & above = 5%.";

export const COMMISSION_PAYOUT_NOTE =
    "The price you set is the final price buyers pay. Our commission is deducted from your payout based on the order value — you keep the rest.";
