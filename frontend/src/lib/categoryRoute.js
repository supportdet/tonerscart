// Maps a "main category" search term to its dedicated page so that typing
// e.g. "printers" or "papers" in the search bar jumps straight to that
// category page instead of running a toner keyword search.
const CATEGORY_ROUTES = {
    "printer": "/printers",
    "printers": "/printers",
    "paper": "/papers",
    "papers": "/papers",
    "toner": "/search",
    "toners": "/search",
    "scanner": "/scanners",
    "scanners": "/scanners",
    "consumable": "/consumables",
    "consumables": "/consumables",
    "mps": "/mps",
    "mps/rentals": "/mps",
    "rental": "/mps",
    "rentals": "/mps",
    "managed print": "/mps",
    "bulk": "/bulk",
    "bulk order": "/bulk",
    "bulk orders": "/bulk",
    "oem": "/oem",
    "oem marketplace": "/oem",
    "dealer": "/dealer",
    "dealer to dealer": "/dealer",
    "d2d": "/dealer",
};

/** Returns the category page route for an exact category keyword, else null. */
export function categoryRoute(q) {
    const key = (q || "").trim().toLowerCase().replace(/\s+/g, " ");
    return CATEGORY_ROUTES[key] || null;
}
