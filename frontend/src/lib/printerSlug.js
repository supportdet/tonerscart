/** Slug helper that matches backend `compatibility_db.slugify` for printer names.
 *  Strips marketing filler tokens so "HP LaserJet M1005 MFP" → "hp-laserjet-m1005".
 *  Used to make "Suitable for" chips on product pages link to /compatible/:slug.
 */
const FILLER = new Set(["imageclass", "ecotank", "mfp", "series"]);

export function printerSlug(fullName) {
    const raw = (fullName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const toks = raw.split("-").filter((t) => t && !FILLER.has(t));
    return toks.join("-") || raw;
}

/** Split a `compatible_models` string into individual model names. Dealers
 *  separate with commas, semicolons, slashes, or " · " — handle all. */
export function splitCompatibleModels(s) {
    if (!s) return [];
    return s
        .split(/[,;|·/\n]+/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 2);
}
