// Common color → hex map for toner variant swatches. Free-text names that
// don't match here fall back to a neutral grey.
const MAP = {
    black: "#1A1A1A",
    cyan: "#00B7C7",
    magenta: "#E6007E",
    "light magenta": "#FF8AD8",
    "light cyan": "#9FE7EE",
    yellow: "#F5C400",
    red: "#FF0000",
    blue: "#003087",
    green: "#00A651",
    orange: "#FF6B00",
    white: "#F5F5F5",
    gold: "#FFD700",
    silver: "#C0C0C0",
    "tri-color": "linear-gradient(120deg,#00B7C7 0%,#E6007E 50%,#F5C400 100%)",
    "tri color": "linear-gradient(120deg,#00B7C7 0%,#E6007E 50%,#F5C400 100%)",
    multicolor: "linear-gradient(120deg,#00B7C7 0%,#E6007E 50%,#F5C400 100%)",
};

export function colorSwatch(name) {
    const k = (name || "").toString().trim().toLowerCase();
    return MAP[k] || "#C8C8CD";
}

export function isLightSwatch(name) {
    const k = (name || "").toString().trim().toLowerCase();
    return k === "white" || k === "yellow" || k === "silver";
}
