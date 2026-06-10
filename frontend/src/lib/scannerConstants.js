// Scanner option lists — shared across the buyer page, dealer form, and bulk
// upload config so they stay in sync with the backend (server.py SCANNER_*).
export const SCANNER_TYPES = ["Flatbed", "ADF", "Sheet-fed", "Drum", "Photo", "All-in-one"];
export const SCANNER_CONDITIONS = ["New", "Refurbished"];
export const SCANNER_RESOLUTIONS = ["600dpi", "1200dpi", "2400dpi", "4800dpi", "9600dpi"];
export const SCANNER_CONNECTIVITY = ["USB", "WiFi", "Ethernet", "Bluetooth"];
export const SCANNER_COLOR_MODES = ["Color", "Mono"];
export const SCANNER_WARRANTIES = ["No warranty", "6 months", "1 year", "2 years", "3 years"];
