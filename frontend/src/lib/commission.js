// Commission utility — shared by Add Toner, Add Printer, Calculator, Order Detail.
// Tiers per TonersCart commercial policy (2026):
//   Under ₹10,000        → 10%
//   ₹10,000 – ₹25,000    → 8%
//   ₹25,000 – ₹75,000    → 6%
//   ₹75,000 – ₹1,50,000  → 4%
//   Above ₹1,50,000      → deal basis (returns null → caller shows "Contact team")

export const COMMISSION_TIERS = [
    { id: "tier1", upTo: 10000,  rate: 0.10, label: "Under ₹10,000",       rateLabel: "10%" },
    { id: "tier2", upTo: 25000,  rate: 0.08, label: "₹10,000 – ₹25,000",   rateLabel: "8%" },
    { id: "tier3", upTo: 75000,  rate: 0.06, label: "₹25,000 – ₹75,000",   rateLabel: "6%" },
    { id: "tier4", upTo: 150000, rate: 0.04, label: "₹75,000 – ₹1,50,000", rateLabel: "4%" },
    { id: "tier5", upTo: Infinity, rate: null, label: "Above ₹1,50,000",    rateLabel: "Deal basis" },
];

export function commissionFor(price) {
    const p = Number(price) || 0;
    if (p <= 0) return null;
    const tier = COMMISSION_TIERS.find((t) => p <= t.upTo);
    if (!tier) return null;
    if (tier.rate === null) {
        return { price: p, rate: null, rateLabel: tier.rateLabel, commission: null, payout: null, tier };
    }
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
    "TonersCart commission: orders under ₹10K = 10% · ₹10K–₹25K = 8% · ₹25K–₹75K = 6% · ₹75K–₹1.5L = 4% · above ₹1.5L = deal basis. Set your price so your desired margin is after commission.";
