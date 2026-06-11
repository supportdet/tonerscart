// Canonical toner/printer brand list — the ONLY brands dealers can pick when
// uploading toners, printers and consumables (single + bulk forms).
export const TONER_BRANDS = [
    "HP", "Canon", "Brother", "Epson", "Ricoh", "Xerox",
    "Kyocera", "Samsung", "Konica Minolta", "Pantum", "Riso", "Sharp",
];

// Extract the canonical brand name from a possibly messy brand string,
// e.g. "CARTRIDGE CANON 071" -> "Canon". Falls back to the raw value.
export const extractBrand = (raw) => {
    const s = String(raw || "");
    const hit = TONER_BRANDS.find((b) =>
        new RegExp(`(^|[^a-zA-Z])${b}([^a-zA-Z]|$)`, "i").test(s)
    );
    return hit || s.trim();
};

// Official-ish brand colors — used for placeholder-image label bands and
// the brand filter chips on category pages.
export const BRAND_BANDS = {
    Canon:   { band: "#CC0000", text: "#FFFFFF" },                       // red
    Xerox:   { band: "#D40000", text: "#FFFFFF" },                       // red
    HP:      { band: "#0096D6", text: "#FFFFFF" },                       // blue
    Brother: { band: "#0053A6", text: "#FFFFFF" },                       // blue
    Epson:   { band: "#003399", text: "#FFFFFF" },                       // dark blue
    Ricoh:   { band: "#E8491D", text: "#FFFFFF" },                       // red/orange
    Kyocera: { band: "#9B111E", text: "#FFFFFF" },                       // dark red
    Samsung: { band: "#1428A0", text: "#FFFFFF" },                       // blue
    "Konica Minolta": { band: "#FFFFFF", text: "#1C1C1E", border: "rgba(0,0,0,0.3)" }, // black on white
    Pantum:  { band: "#009A44", text: "#FFFFFF" },                       // green
    Riso:    { band: "#5F259F", text: "#FFFFFF" },                       // purple
    Sharp:   { band: "#F47920", text: "#FFFFFF" },                       // orange
};

// All other / unknown brands → default red.
export const DEFAULT_BAND = { band: "#C8102E", text: "#FFFFFF" };
