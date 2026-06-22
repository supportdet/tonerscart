// Indian states master list + GST rate options used across address forms and listing forms.

export const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
    // Union Territories
    "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
    "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

export const GST_RATES = [
    { value: 5,  label: "5%" },
    { value: 12, label: "12%" },
    { value: 18, label: "18%" },
    { value: 28, label: "28%" },
];

export const DEFAULT_GST_RATE = 18;

// Helpers
export const gstAmount = (basePrice, rate) =>
    Math.round((Number(basePrice || 0) * Number(rate || 0)) / 100);

export const withGst = (basePrice, rate) =>
    Math.round(Number(basePrice || 0) + (Number(basePrice || 0) * Number(rate || 0)) / 100);

// Reverse of withGst — given a GST-inclusive price (what the buyer sees) and
// the GST rate, return the base price that gets stored on the listing.
// Used by dealer upload forms when the dealer toggles "Price includes GST".
export const priceFromInclusive = (inclPrice, rate) => {
    const r = Number(rate ?? DEFAULT_GST_RATE);
    const incl = Number(inclPrice || 0);
    if (incl <= 0) return 0;
    if (r <= 0) return Math.round(incl);
    return Math.round(incl / (1 + r / 100));
};

// Convenience: read a listing row's GST-inclusive price using its gst_rate
// field, falling back to DEFAULT_GST_RATE (18%) when absent.
export const inclGstPrice = (basePrice, gst_rate) =>
    withGst(basePrice, gst_rate ?? DEFAULT_GST_RATE);

export const formatINR = (n) =>
    `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// Master list of toner / consumable colours used by the colour filter chip
// row and bulk-upload dropdowns. Keep in sync with backend listing colour
// values. "Tri-color" represents combo cartridges that contain C+M+Y in one.
export const TONER_COLORS = ["Black", "Cyan", "Magenta", "Yellow", "Tri-color"];

export const PRINTER_SPECIAL_FEATURES = [
    { id: "Duplex Printing",       label: "Duplex Printing" },
    { id: "Auto Document Feeder",  label: "Auto Document Feeder" },
    { id: "Touchscreen",           label: "Touchscreen" },
    { id: "Cloud Printing",        label: "Cloud Printing" },
    { id: "Mobile Printing",       label: "Mobile Printing" },
    { id: "Secure Print",          label: "Secure Print" },
    { id: "High Capacity Tray",    label: "High Capacity Tray" },
    { id: "Fax",                   label: "Fax" },
    { id: "Scanner",               label: "Scanner" },
    { id: "Wireless",              label: "Wireless" },
];

// Master brand lists used by the category Filter/Sort bars. We intentionally
// show the FULL master list (not just brands that currently have listings) so
// buyers can filter by any known brand even before stock is onboarded.
export const PRINTER_TONER_BRANDS = [
    "HP", "Canon", "Brother", "Epson", "Xerox", "Ricoh", "Kyocera", "Samsung",
    "Konica Minolta", "Lexmark", "Sharp", "Toshiba", "Panasonic", "Dell",
    "OKI", "Pantum", "Riso", "TVS Electronics", "Develop", "Olivetti",
];

export const PAPER_BRANDS = [
    "JK Paper", "Century", "BILT", "Trident", "Bindal", "ITC (Classmate)",
    "Double A", "Sinarline", "Ballarpur", "Xerox", "Spectra", "Orient",
];

export const PRINTER_USAGE_TYPES = [
    { id: "home",       label: "Home" },
    { id: "corporate",  label: "Corporate" },
    { id: "commercial", label: "Commercial" },
    { id: "printshop",  label: "Print Shop" },
];
