// System-defined flat delivery-rate fallbacks (Wave 22, updated Wave 96).
// Used ONLY when a listing has no explicit per-row delivery charge set.
// Per-listing values (intracity_delivery_charge / intercity_delivery_charge)
// always take precedence. Mirrors backend server.py DELIVERY_RATES.
export const DELIVERY_RATES = {
    toner: 100,
    printer: 350,
    paper: 100,
    scanner: 100,
    consumable: 100,
};

const CITY_EQUIV = {
    bangalore: "bengaluru", bengaluru: "bengaluru",
    bombay: "mumbai", mumbai: "mumbai",
    calcutta: "kolkata", kolkata: "kolkata",
    madras: "chennai", chennai: "chennai",
    gurgaon: "gurugram", gurugram: "gurugram",
    pondicherry: "puducherry", puducherry: "puducherry",
};

export const cityKey = (c) => {
    const k = (c || "").trim().toLowerCase();
    return CITY_EQUIV[k] || k;
};

// Unknown city on either side → treat as intercity so the charge is shown, never silently dropped.
export const isIntercity = (dealerCity, buyerCity) => {
    const d = cityKey(dealerCity), b = cityKey(buyerCity);
    if (!d || !b) return true;
    return d !== b;
};

export const deliveryRate = (kind) => DELIVERY_RATES[(kind || "toner").toLowerCase()] ?? DELIVERY_RATES.toner;

// A stable key identifying a dealer for "charge once per dealer" grouping.
export const dealerKeyOf = (product) =>
    product?.supplier_id || `${product?.supplier_name || "supplier"}|${cityKey(product?.city)}`;

/**
 * Compute system-defined delivery for a cart.
 * Charged ONCE per dealer (the highest category rate among that dealer's
 * intercity items). Returns:
 *  - perItem: { [itemId]: { sameCity, dealerCity, kind, rate, bears, charge } }
 *      `bears` = this is the single delivery-bearing line for its dealer (send charge_delivery=true).
 *      `charge` = the dealer's delivery amount (only set on the bearing line, else 0).
 *  - perDealer: [{ dealerKey, dealerCity, sameCity, charge }]
 *  - total
 */
export function computeCartDelivery(items, buyerCity) {
    const groups = new Map();
    for (const it of items) {
        const p = it.product || {};
        const key = dealerKeyOf(p);
        const kind = (p.kind || "toner").toLowerCase();
        // Wave 96 — prefer per-listing dealer-set charges. Fall back to the
        // category default for intercity; intracity defaults to 0.
        const sameCity = !isIntercity(p.city, buyerCity);
        const interRow = p.intercity_delivery_charge != null ? Number(p.intercity_delivery_charge) : deliveryRate(kind);
        const intraRow = p.intracity_delivery_charge != null ? Number(p.intracity_delivery_charge) : 0;
        const rate = sameCity ? intraRow : interRow;
        if (!groups.has(key)) groups.set(key, { dealerKey: key, dealerCity: p.city || "", sameCity, items: [] });
        groups.get(key).items.push({ id: it.id, kind, rate });
    }
    const perItem = {};
    const perDealer = [];
    let total = 0;
    for (const g of groups.values()) {
        // bearing item = highest charge in the group (first on tie)
        let bearing = null;
        for (const x of g.items) if (!bearing || x.rate > bearing.rate) bearing = x;
        const charge = bearing ? bearing.rate : 0;
        total += charge;
        perDealer.push({ dealerKey: g.dealerKey, dealerCity: g.dealerCity, sameCity: g.sameCity, charge });
        for (const x of g.items) {
            const bears = bearing && x.id === bearing.id && charge > 0;
            perItem[x.id] = {
                sameCity: g.sameCity,
                dealerCity: g.dealerCity,
                kind: x.kind,
                rate: x.rate,
                bears: !!bears,
                charge: bears ? charge : 0,
            };
        }
    }
    return { perItem, perDealer, total };
}
