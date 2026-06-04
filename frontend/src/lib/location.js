// City matching helpers — treat common Indian city aliases as equivalent so
// "Bangalore" and "Bengaluru" (etc.) sort together for location-based features.
const EQUIV = {
    bangalore: "bengaluru", bengaluru: "bengaluru",
    bombay: "mumbai", mumbai: "mumbai",
    calcutta: "kolkata", kolkata: "kolkata",
    madras: "chennai", chennai: "chennai",
    gurgaon: "gurugram", gurugram: "gurugram",
    pondicherry: "puducherry", puducherry: "puducherry",
};

export const cityKey = (c) => {
    const k = (c || "").trim().toLowerCase();
    return EQUIV[k] || k;
};

export const cityMatch = (a, b) => {
    const ka = cityKey(a);
    const kb = cityKey(b);
    return !!ka && !!kb && ka === kb;
};

/**
 * Returns a delivery/location descriptor for a product card given the
 * supplier city and the buyer's selected city.
 *  - same city  → { local: true,  text: "Local supplier", free: true }
 *  - other city → { local: false, text: "Ships from <City>", free: false }
 */
export const deliveryLabel = (supplierCity, userCity) => {
    const sc = (supplierCity || "").trim();
    if (!sc) return { local: false, text: "", free: false };
    if (userCity && cityMatch(sc, userCity)) {
        return { local: true, text: "Local supplier", free: true };
    }
    return { local: false, text: `Ships from ${sc}`, free: false };
};
