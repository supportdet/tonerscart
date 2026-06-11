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
