// Commission utility — shared by Add Toner, Add Printer, Calculator, Order Detail.
// Tiers per TonersCart commercial policy (2026):
//   < ₹5,000             → 8%
//   ₹5,000 – ₹25,000     → 5%
//   ₹25,000 – ₹1,50,000  → 3%
//   > ₹1,50,000          → deal basis (returns null → caller shows "Contact team")

export const COMMISSION_TIERS = [
    { id: "tier1", upTo: 5000,   rate: 0.08, label: "Under ₹5,000",        rateLabel: "8%" },
    { id: "tier2", upTo: 25000,  rate: 0.05, label: "₹5,000 – ₹25,000",    rateLabel: "5%" },
    { id: "tier3", upTo: 150000, rate: 0.03, label: "₹25,000 – ₹1,50,000", rateLabel: "3%" },
    { id: "tier4", upTo: Infinity, rate: null, label: "Above ₹1,50,000",    rateLabel: "Deal basis" },
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
    "TonersCart commission: orders under ₹5K = 8% · ₹5K–₹25K = 5% · ₹25K–₹1.5L = 3%. Set your price so your desired margin is after commission.";
