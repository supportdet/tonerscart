// Config objects for the generic bulk-upload dialog (BulkUploadGeneric.jsx).
// One config per product type — columns map 1:1 to the backend create models.

import { TONER_BRANDS } from "./brands";
import { PAPER_BRANDS } from "./listingConstants";

const num = (v) => (v === "" || v == null ? null : Number(v));
const splitList = (v) =>
    String(v || "")
        .split(/[,;|]/)
        .map((x) => x.trim())
        .filter(Boolean);

// Convert a row's typed price into the stored base price. price_type is set
// at the modal level (Incl./Excl. GST toggle) and copied onto each row before
// submit by BulkUploadGeneric. We default to "incl" to match the toggle.
const PRICE_TYPES = [
    { value: "incl", label: "Incl GST" },
    { value: "excl", label: "Excl GST" },
];
const GST_RATE_OPTIONS = [
    { value: "5", label: "5%" },
    { value: "12", label: "12%" },
    { value: "18", label: "18%" },
    { value: "28", label: "28%" },
];
const basePriceFromRow = (typed, row) => {
    const t = Number(typed || 0);
    if (t <= 0) return 0;
    const pt = (row.price_type || "incl").toLowerCase();
    const rate = row.gst_rate !== "" && row.gst_rate != null ? Number(row.gst_rate) : 18;
    return pt === "excl" ? Math.round(t) : Math.round(t / (1 + rate / 100));
};

// Wave 73 — single source of truth for the printer/toner/consumable
// Warranty dropdown. Default is "1 Year" so bulk uploads never fail on a
// missing Warranty column.
const WARRANTY_OPTIONS = [
    { value: "1 Year", label: "1 Year" },
    { value: "2 Years", label: "2 Years" },
    { value: "3 Years", label: "3 Years" },
    { value: "On-site", label: "On-site" },
    { value: "Carry-in", label: "Carry-in" },
    { value: "No Warranty", label: "No Warranty" },
];

// ============================ TONERS ============================

const TONER_TYPES = ["Original", "Compatible"];

const TONER_COLUMNS = [
    { key: "brand", label: "Brand", required: true, type: "select", placeholder: "Select brand…", w: 140 },
    { key: "model_number", label: "Toner Model Number", required: false, w: 170 },
    { key: "compatible_models", label: "Suitable For", required: true, type: "models", w: 240 },
    { key: "color", label: "Color", required: false, w: 110 },
    { key: "gst_rate", label: "GST", required: true, type: "select", w: 90 },
    { key: "price", label: "Price (₹)", required: true, type: "number", w: 110 },
    { key: "stock", label: "Stock", required: true, type: "number", w: 90 },
    { key: "page_yield", label: "Page Yield", required: true, type: "number", w: 110 },
    { key: "oem_part_number", label: "OEM Part Number", required: false, w: 150 },
    { key: "toner_type", label: "Toner Type", required: true, type: "select", w: 130 },
    { key: "warranty", label: "Warranty", required: false, type: "select", w: 130 },
];

const tonerEmptyRow = () => ({
    brand: "", model_number: "", compatible_models: "", color: "", price: "", gst_rate: "", price_type: "incl",
    stock: "", page_yield: "", oem_part_number: "",
    toner_type: "", warranty: "1 Year", intercity_delivery_charge: "0",
});

const tonerIsRowEmpty = (r) =>
    !["brand", "model_number", "compatible_models", "price", "stock", "page_yield", "oem_part_number"]
        .some((k) => String(r[k] ?? "").trim() !== "");

const tonerRowErrors = (r) => {
    const errs = new Set();
    if (tonerIsRowEmpty(r)) return errs;
    for (const k of ["brand", "compatible_models", "price", "stock", "toner_type", "page_yield"]) {
        if (String(r[k] ?? "").trim() === "") errs.add(k);
    }
    if (r.price !== "" && Number(r.price) <= 0) errs.add("price");
    if (r.stock !== "" && Number(r.stock) < 0) errs.add("stock");
    if (r.page_yield !== "" && Number(r.page_yield) <= 0) errs.add("page_yield");
    if (r.toner_type && !TONER_TYPES.includes(r.toner_type)) errs.add("toner_type");
    if (r.brand && !TONER_BRANDS.includes(r.brand)) errs.add("brand");
    return errs;
};

// Stable identifier for the toner listing. Prefer the dealer-entered cartridge
// model number (e.g. "Q2612A"); fall back to the first compatible printer
// model, then the brand, so legacy rows without a model_number still save.
const deriveTonerModel = (r) => {
    const direct = String(r.model_number || "").trim();
    if (direct) return direct.slice(0, 50);
    const src = String(r.compatible_models || r.brand || "").trim();
    const first = src.split(/[,;|]/)[0].trim();
    return (first || src || "—").slice(0, 50);
};

const tonerScalarPayload = (r) => ({
    brand: r.brand.trim(),
    model_number: deriveTonerModel(r),
    color: r.color || "Black",
    price: basePriceFromRow(r.price, r),
    stock: Number(r.stock),
    toner_type: r.toner_type || "Original",
    gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
    compatible_models: splitList(r.compatible_models).join(", ") || null,
    page_yield: r.page_yield !== "" ? Number(r.page_yield) : null,
    oem_part_number: r.oem_part_number?.trim() || null,
    warranty: r.warranty || "1 Year",
    intercity_delivery_charge: r.intercity_delivery_charge !== "" ? Number(r.intercity_delivery_charge) : 0,
});

export const tonerBulkConfig = {
    title: "Bulk upload toners",
    priceColumnKey: "price",
    editTitle: "Edit toners",
    editSubtitle: "Edit your existing toners inline, then save. Add new rows to publish more. Required: Brand, Suitable For, Price, Stock, Toner Type, Page Yield.",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Brand, Suitable For, Price, Stock, Toner Type, Page Yield. Toner Model Number is optional — when supplied, buyers can find your listing by cartridge code (e.g. Q2612A).",
    sheetName: "Toners",
    templateFilename: "tonerscart_bulk_toners_template.xlsx",
    currentFilename: "tonerscart_bulk_toners.xlsx",
    unitLabel: "toner",
    endpoint: "/supplier/listings/bulk",
    itemPath: "/supplier/listings",
    columns: TONER_COLUMNS,
    selectOptions: { toner_type: TONER_TYPES, brand: TONER_BRANDS, gst_rate: GST_RATE_OPTIONS, warranty: WARRANTY_OPTIONS },
    emptyRow: tonerEmptyRow,
    templateExample: {
        brand: "HP", model_number: "CC388A", compatible_models: "P1007, P1008, P1106, P1108", color: "Black", price: "2183",
        gst_rate: "18", price_type: "incl", stock: "10",
        page_yield: "1500", oem_part_number: "CC388A", toner_type: "Original",
        warranty: "1 Year",
        intercity_delivery_charge: "150",
    },
    requiredKeys: ["brand", "compatible_models", "price", "stock", "toner_type", "page_yield"],
    isRowEmpty: tonerIsRowEmpty,
    rowErrors: tonerRowErrors,
    // Edit mode — map an existing listing into an editable row.
    fromListing: (l) => {
        const gst = l.gst_rate != null ? Number(l.gst_rate) : 18;
        const incl = l.price != null ? Math.round(Number(l.price) * (1 + gst / 100)) : "";
        return {
            _id: l.id,
            brand: l.brand || "",
            model_number: l.model_number || "",
            compatible_models: l.compatible_models || "",
            color: l.color || "Black",
            price: incl !== "" ? String(incl) : "",
            gst_rate: String(gst),
            price_type: "incl",
            stock: String(l.stock ?? ""),
            page_yield: l.page_yield ? String(l.page_yield) : "",
            oem_part_number: l.oem_part_number || "",
            toner_type: l.toner_type || "Original",
            warranty: l.warranty || "1 Year",
            intercity_delivery_charge: String(l.intercity_delivery_charge ?? 0),
        };
    },
    // PUT payload for an existing listing — never touches images or variants.
    toUpdatePayload: tonerScalarPayload,
    toPayload: (r) => ({
        ...tonerScalarPayload(r),
        image_url: "",
        image_urls: [],
        variants: [{ color: r.color || "Black", price: basePriceFromRow(r.price, r), stock: Number(r.stock) }],
    }),
};

const joinList = (a) => (Array.isArray(a) ? a.filter(Boolean).join(", ") : (a || ""));

// ============================ PRINTERS ============================

const PRINTER_CATEGORIES = [
    { value: "laser", label: "Laser" },
    { value: "inkjet", label: "Inkjet" },
    { value: "ink-tank", label: "Ink Tank" },
    { value: "thermal", label: "Thermal" },
    { value: "dot-matrix", label: "Dot Matrix" },
    { value: "led", label: "LED" },
    { value: "other", label: "Other" },
];
// Wave 76 — canonical usage values match backend tokens; labels are the
// dealer-facing strings: Home / Corporate · Office / Commercial · Industrial
// / Print Shop · Copy Center. `usage_type` cells store the backend tokens
// (home, corporate, commercial, print_shop) so the bulk submit payload
// passes the backend validator without further transformation.
const PRINTER_USAGES = [
    { value: "home", label: "Home" },
    { value: "corporate", label: "Corporate / Office" },
    { value: "commercial", label: "Commercial / Industrial" },
    { value: "print_shop", label: "Print Shop / Copy Center" },
];
const PRINTER_CONNECTIVITY = [
    { value: "USB", label: "USB" },
    { value: "Wi-Fi", label: "Wi-Fi" },
    { value: "Ethernet", label: "Ethernet" },
    { value: "Bluetooth", label: "Bluetooth" },
    { value: "Wi-Fi Direct", label: "Wi-Fi Direct" },
    { value: "NFC", label: "NFC" },
    { value: "AirPrint", label: "AirPrint" },
];
const PRINTER_PAPER_SIZES = [
    { value: "A4", label: "A4" },
    { value: "A3", label: "A3" },
    { value: "A5", label: "A5" },
    { value: "Letter", label: "Letter" },
    { value: "Legal", label: "Legal" },
    { value: "Custom", label: "Custom" },
];
// Wave 77 — three new optional spec columns surfaced on the printer bulk
// upload table (already exist on the single-add form / product detail page).
const PRINTER_RESOLUTIONS = [
    { value: "600x600", label: "600x600 dpi" },
    { value: "1200x600", label: "1200x600 dpi" },
    { value: "1200x1200", label: "1200x1200 dpi" },
    { value: "2400x600", label: "2400x600 dpi" },
    { value: "1200x2400", label: "1200x2400 dpi" },
    { value: "4800x1200", label: "4800x1200 dpi" },
    { value: "4800x2400", label: "4800x2400 dpi" },
    { value: "9600x2400", label: "9600x2400 dpi" },
];
const PRINTER_MOBILE = [
    { value: "AirPrint", label: "AirPrint" },
    { value: "Mopria", label: "Mopria" },
    { value: "Wi-Fi Direct", label: "Wi-Fi Direct" },
    { value: "None", label: "None" },
];
const PRINTER_SPECIAL_FEATURES = [
    { value: "Duplex Printing", label: "Duplex Printing" },
    { value: "Auto Document Feeder", label: "Auto Document Feeder" },
    { value: "Touchscreen", label: "Touchscreen" },
    { value: "Cloud Printing", label: "Cloud Printing" },
    { value: "Mobile Printing", label: "Mobile Printing" },
    { value: "Secure Print", label: "Secure Print" },
    { value: "High Capacity Tray", label: "High Capacity Tray" },
    { value: "Fax", label: "Fax" },
    { value: "Scanner", label: "Scanner" },
    { value: "Wireless", label: "Wireless" },
];
const PRINTER_CONDITIONS = [
    { value: "new", label: "Brand New" },
    { value: "refurbished", label: "Refurbished" },
];
const PRINTER_COLORS = [
    { value: "color", label: "Color" },
    { value: "bw", label: "B&W" },
    { value: "both", label: "Color + B&W" },
];

const PRINTER_COLUMNS = [
    { key: "brand", label: "Brand", required: true, type: "select", placeholder: "Select brand…", w: 140 },
    { key: "model_number", label: "Model", required: true, type: "models", single: true, autofillBrand: true, w: 180 },
    { key: "category", label: "Type", required: true, type: "select", w: 130 },
    { key: "condition", label: "Condition", required: false, type: "select", w: 130 },
    { key: "usage_type", label: "Usage", required: true, type: "select", multi: true, maxSelect: 2, w: 200 },
    { key: "color", label: "Color", required: true, type: "select", w: 120 },
    { key: "gst_rate", label: "GST", required: false, type: "select", w: 90 },
    { key: "price", label: "Price (₹)", required: true, type: "number", w: 110 },
    { key: "stock", label: "Stock", required: false, type: "number", w: 90 },
    { key: "print_speed_ppm", label: "Speed (ppm)", required: true, type: "number", w: 110 },
    { key: "monthly_volume_min", label: "Vol. Min", required: false, type: "number", w: 100 },
    { key: "monthly_volume_max", label: "Vol. Max", required: false, type: "number", w: 100 },
    { key: "connectivity", label: "Connectivity", required: false, type: "select", multi: true, w: 240 },
    { key: "paper_sizes", label: "Paper Sizes", required: true, type: "select", multi: true, w: 200 },
    { key: "max_resolution", label: "Max Resolution", required: false, type: "select", multi: true, w: 200 },
    { key: "mobile_printing", label: "Mobile Printing", required: false, type: "select", multi: true, w: 200 },
    { key: "special_features", label: "Special Features", required: false, type: "select", multi: true, w: 240 },
    { key: "printer_warranty", label: "Warranty", required: false, type: "select", w: 130 },
    { key: "description", label: "Description", required: false, w: 220 },
];

const printerEmptyRow = () => ({
    brand: "", model_number: "", category: "", condition: "new",
    usage_type: "", color: "", price: "", gst_rate: "", price_type: "incl", stock: "",
    print_speed_ppm: "", monthly_volume_min: "", monthly_volume_max: "",
    connectivity: "", paper_sizes: "",
    max_resolution: "", mobile_printing: "", special_features: "",
    printer_warranty: "1 Year", description: "",
});

const printerIsRowEmpty = (r) =>
    !["brand", "model_number", "price", "stock", "print_speed_ppm", "monthly_volume_min",
      "monthly_volume_max", "connectivity", "paper_sizes", "description"]
        .some((k) => String(r[k] ?? "").trim() !== "");

const printerRowErrors = (r) => {
    const errs = new Set();
    if (printerIsRowEmpty(r)) return errs;
    // Wave 71 — required per-row fields: Brand, Model, Type, Usage, Color,
    // Price, PPM, Paper Sizes. Condition / GST / Stock / Vol Min/Max /
    // Connectivity / Description are optional.
    for (const k of ["brand", "model_number", "category", "usage_type", "color", "price", "print_speed_ppm", "paper_sizes"]) {
        if (String(r[k] ?? "").trim() === "") errs.add(k);
    }
    if (r.price !== "" && Number(r.price) <= 0) errs.add("price");
    if (r.stock !== "" && r.stock !== null && Number(r.stock) < 0) errs.add("stock");
    if (r.category && !PRINTER_CATEGORIES.some((c) => c.value === r.category)) errs.add("category");
    // usage_type can be a comma-joined multi-value cell; validate each token.
    if (r.usage_type) {
        const tokens = String(r.usage_type).split(",").map((s) => s.trim()).filter(Boolean);
        if (tokens.some((t) => !PRINTER_USAGES.some((u) => u.value === t))) errs.add("usage_type");
    }
    return errs;
};

export const printerBulkConfig = {
    title: "Bulk upload printers",
    priceColumnKey: "price",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Brand, Model, Type, Usage, Color, Price, PPM, Paper Sizes.",
    sheetName: "Printers",
    templateFilename: "tonerscart_bulk_printers_template.xlsx",
    currentFilename: "tonerscart_bulk_printers.xlsx",
    unitLabel: "printer",
    endpoint: "/supplier/printers/bulk",
    columns: PRINTER_COLUMNS,
    selectOptions: {
        brand: TONER_BRANDS,
        category: PRINTER_CATEGORIES,
        condition: PRINTER_CONDITIONS,
        usage_type: PRINTER_USAGES,
        color: PRINTER_COLORS,
        connectivity: PRINTER_CONNECTIVITY,
        paper_sizes: PRINTER_PAPER_SIZES,
        max_resolution: PRINTER_RESOLUTIONS,
        mobile_printing: PRINTER_MOBILE,
        special_features: PRINTER_SPECIAL_FEATURES,
        printer_warranty: WARRANTY_OPTIONS,
        gst_rate: GST_RATE_OPTIONS,
    },
    emptyRow: printerEmptyRow,
    templateExample: {
        brand: "HP", model_number: "LaserJet M404dn", category: "laser", condition: "new",
        usage_type: "corporate", color: "bw", price: "33040", gst_rate: "18", price_type: "incl", stock: "5",
        print_speed_ppm: "38", monthly_volume_min: "750", monthly_volume_max: "4000",
        connectivity: "Wi-Fi, Ethernet, USB", paper_sizes: "A4, A5, Legal",
        max_resolution: "1200x1200", mobile_printing: "AirPrint, Mopria",
        special_features: "Duplex Printing, Auto Document Feeder, Cloud Printing",
        printer_warranty: "1 Year",
        description: "Compact mono laser printer with auto-duplex.",
    },
    requiredKeys: ["brand", "model_number", "category", "usage_type", "color", "price", "print_speed_ppm", "paper_sizes"],
    isRowEmpty: printerIsRowEmpty,
    rowErrors: printerRowErrors,
    toPayload: (r) => ({
        brand: r.brand.trim(),
        model_number: r.model_number.trim(),
        category: r.category || "",
        condition: r.condition || "new",
        usage_type: (r.usage_type || "").split(",")[0] || "",
        usage_types: (r.usage_type || "").split(",").filter(Boolean),
        color: r.color || "",
        price: basePriceFromRow(r.price, r),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        print_speed_ppm: num(r.print_speed_ppm),
        monthly_volume_min: r.monthly_volume_min !== "" ? Number(r.monthly_volume_min) : 0,
        monthly_volume_max: r.monthly_volume_max !== "" ? Number(r.monthly_volume_max) : 0,
        connectivity: splitList(r.connectivity),
        paper_sizes: splitList(r.paper_sizes),
        max_resolution: (r.max_resolution || "").split(",").map((s) => s.trim()).filter(Boolean).join(", ") || null,
        mobile_printing: splitList(r.mobile_printing),
        special_features: splitList(r.special_features),
        printer_warranty: r.printer_warranty || "1 Year",
        description: (r.description || "").trim(),
        image_url: "",
        image_urls: [],
    }),
    // Edit mode
    itemPath: "/supplier/printers",
    fromListing: (l) => {
        const gst = l.gst_rate != null ? Number(l.gst_rate) : 18;
        const incl = l.price != null ? Math.round(Number(l.price) * (1 + gst / 100)) : "";
        return {
            _id: l.id,
            brand: l.brand || "",
            model_number: l.model_number || "",
            category: l.category || "laser",
            condition: l.condition || "new",
            usage_type: (Array.isArray(l.usage_types) && l.usage_types[0]) || l.usage_type || "corporate",
            color: l.color || "color",
            price: incl !== "" ? String(incl) : "",
            gst_rate: String(gst),
            price_type: "incl",
            stock: String(l.stock ?? ""),
            print_speed_ppm: l.print_speed_ppm ? String(l.print_speed_ppm) : "",
            monthly_volume_min: l.monthly_volume_min ? String(l.monthly_volume_min) : "",
            monthly_volume_max: l.monthly_volume_max ? String(l.monthly_volume_max) : "",
            connectivity: joinList(l.connectivity),
            paper_sizes: joinList(l.paper_sizes),
            max_resolution: l.max_resolution || "",
            mobile_printing: joinList(l.mobile_printing),
            special_features: joinList(l.special_features),
            printer_warranty: l.printer_warranty || "1 Year",
            description: l.description || "",
        };
    },
    toUpdatePayload: (r) => ({
        brand: r.brand.trim(),
        model_number: r.model_number.trim(),
        category: r.category || "laser",
        condition: r.condition || "new",
        usage_type: r.usage_type || "corporate",
        usage_types: [r.usage_type || "corporate"],
        color: r.color || "color",
        price: basePriceFromRow(r.price, r),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        print_speed_ppm: num(r.print_speed_ppm),
        monthly_volume_min: r.monthly_volume_min !== "" ? Number(r.monthly_volume_min) : 0,
        monthly_volume_max: r.monthly_volume_max !== "" ? Number(r.monthly_volume_max) : 0,
        connectivity: splitList(r.connectivity),
        paper_sizes: splitList(r.paper_sizes),
        max_resolution: (r.max_resolution || "").split(",").map((s) => s.trim()).filter(Boolean).join(", ") || null,
        mobile_printing: splitList(r.mobile_printing),
        special_features: splitList(r.special_features),
        printer_warranty: r.printer_warranty || "1 Year",
        description: (r.description || "").trim(),
    }),
};

// ============================ CONSUMABLES ============================

const CONSUMABLE_SUBS = [
    "Ink Cartridges", "Drums", "Fusers", "Maintenance Kits",
    "Staple Cartridges", "Transfer Belts", "Other",
];
const CONSUMABLE_CONDITIONS = ["New", "Refurbished", "Compatible"];

const CONSUMABLE_COLUMNS = [
    { key: "subcategory", label: "Subcategory", required: true, type: "select", w: 150 },
    { key: "subcategory_other", label: "If Other, specify", required: false, w: 150 },
    { key: "brand", label: "Brand", required: true, type: "select", placeholder: "Select brand…", w: 140 },
    { key: "model_number", label: "Model Number", required: true, w: 160 },
    { key: "compatible_models", label: "Suitable For", required: false, type: "models", w: 220 },
    { key: "condition", label: "Condition", required: false, type: "select", w: 130 },
    { key: "gst_rate", label: "GST", required: true, type: "select", w: 90 },
    { key: "price", label: "Price (₹)", required: true, type: "number", w: 110 },
    { key: "stock", label: "Stock", required: true, type: "number", w: 90 },
    { key: "warranty", label: "Warranty", required: false, type: "select", w: 130 },
    { key: "description", label: "Description", required: false, w: 220 },
];

const consumableEmptyRow = () => ({
    subcategory: "", subcategory_other: "", brand: "", model_number: "",
    compatible_models: "", condition: "", price: "", gst_rate: "", price_type: "incl", stock: "",
    warranty: "1 Year", intercity_delivery_charge: "0", description: "",
});

const consumableIsRowEmpty = (r) =>
    !["brand", "model_number", "price", "stock", "compatible_models", "description"]
        .some((k) => String(r[k] ?? "").trim() !== "");

const consumableRowErrors = (r) => {
    const errs = new Set();
    if (consumableIsRowEmpty(r)) return errs;
    for (const k of ["subcategory", "brand", "model_number", "price", "stock"]) {
        if (String(r[k] ?? "").trim() === "") errs.add(k);
    }
    if (r.price !== "" && Number(r.price) <= 0) errs.add("price");
    if (r.stock !== "" && Number(r.stock) < 0) errs.add("stock");
    if (r.subcategory && !CONSUMABLE_SUBS.includes(r.subcategory)) errs.add("subcategory");
    if (r.brand && !TONER_BRANDS.includes(r.brand)) errs.add("brand");
    return errs;
};

export const consumableBulkConfig = {
    title: "Bulk upload consumables",
    priceColumnKey: "price",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Subcategory, Brand, Model, Price, Stock.",
    sheetName: "Consumables",
    templateFilename: "tonerscart_bulk_consumables_template.xlsx",
    currentFilename: "tonerscart_bulk_consumables.xlsx",
    unitLabel: "consumable",
    endpoint: "/supplier/consumables/bulk",
    columns: CONSUMABLE_COLUMNS,
    selectOptions: { subcategory: CONSUMABLE_SUBS, condition: CONSUMABLE_CONDITIONS, brand: TONER_BRANDS, gst_rate: GST_RATE_OPTIONS, warranty: WARRANTY_OPTIONS },
    emptyRow: consumableEmptyRow,
    templateExample: {
        subcategory: "Drums", subcategory_other: "", brand: "Brother", model_number: "DR-2305",
        compatible_models: "HL-L2321D, DCP-L2541DW", condition: "New", price: "2596",
        gst_rate: "18", price_type: "incl", stock: "12",
        warranty: "1 Year", intercity_delivery_charge: "150",
        description: "Genuine drum unit, 12000-page yield.",
    },
    requiredKeys: ["subcategory", "brand", "model_number", "price", "stock"],
    isRowEmpty: consumableIsRowEmpty,
    rowErrors: consumableRowErrors,
    toPayload: (r) => ({
        subcategory: r.subcategory || "Other",
        subcategory_other: r.subcategory_other?.trim() || null,
        brand: r.brand.trim(),
        model_number: r.model_number.trim(),
        compatible_models: splitList(r.compatible_models).join(", ") || null,
        condition: r.condition || "New",
        price: basePriceFromRow(r.price, r),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        warranty: r.warranty || "1 Year",
        intercity_delivery_charge: r.intercity_delivery_charge !== "" ? Number(r.intercity_delivery_charge) : 0,
        description: (r.description || "").trim() || null,
        image_url: "",
        image_urls: [],
    }),
    // Edit mode
    itemPath: "/supplier/consumables",
    fromListing: (l) => {
        const gst = l.gst_rate != null ? Number(l.gst_rate) : 18;
        const incl = l.price != null ? Math.round(Number(l.price) * (1 + gst / 100)) : "";
        return {
            _id: l.id,
            subcategory: l.subcategory || "Other",
            subcategory_other: l.subcategory_other || "",
            brand: l.brand || "",
            model_number: l.model_number || "",
            compatible_models: l.compatible_models || "",
            condition: l.condition || "New",
            price: incl !== "" ? String(incl) : "",
            gst_rate: String(gst),
            price_type: "incl",
            stock: String(l.stock ?? ""),
            warranty: l.warranty || "1 Year",
            intercity_delivery_charge: String(l.intercity_delivery_charge ?? 0),
            description: l.description || "",
        };
    },
    toUpdatePayload: (r) => ({
        subcategory: r.subcategory || "Other",
        subcategory_other: r.subcategory_other?.trim() || null,
        brand: r.brand.trim(),
        model_number: r.model_number.trim(),
        compatible_models: splitList(r.compatible_models).join(", ") || null,
        condition: r.condition || "New",
        price: basePriceFromRow(r.price, r),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        warranty: r.warranty || "1 Year",
        intercity_delivery_charge: r.intercity_delivery_charge !== "" ? Number(r.intercity_delivery_charge) : 0,
        description: (r.description || "").trim() || null,
    }),
};

// ============================ SCANNERS ============================

const SCANNER_TYPES = ["Flatbed", "ADF", "Sheet-fed", "Drum", "Photo", "All-in-one"];
const SCANNER_CONDITIONS = ["New", "Refurbished"];
const SCANNER_RESOLUTIONS = ["600dpi", "1200dpi", "2400dpi", "4800dpi", "9600dpi"];
const SCANNER_COLOR_MODES = ["Color", "Mono"];
const SCANNER_WARRANTIES = ["No warranty", "6 months", "1 year", "2 years", "3 years"];

const SCANNER_COLUMNS = [
    { key: "brand", label: "Brand", required: true, w: 130 },
    { key: "model_number", label: "Model Number", required: true, w: 160 },
    { key: "scanner_type", label: "Scanner Type", required: true, type: "select", w: 140 },
    { key: "condition", label: "Condition", required: false, type: "select", w: 130 },
    { key: "scan_resolution", label: "Resolution", required: false, type: "select", w: 120 },
    { key: "connectivity", label: "Connectivity", required: false, w: 170 },
    { key: "scan_speed_ppm", label: "Speed (ppm)", required: false, type: "number", w: 110 },
    { key: "color_mode", label: "Color/Mono", required: false, type: "select", w: 120 },
    { key: "warranty", label: "Warranty", required: false, type: "select", w: 130 },
    { key: "gst_rate", label: "GST", required: true, type: "select", w: 90 },
    { key: "price", label: "Price (₹)", required: true, type: "number", w: 110 },
    { key: "stock", label: "Stock", required: true, type: "number", w: 90 },
    { key: "description", label: "Description", required: false, w: 220 },
];

const scannerEmptyRow = () => ({
    brand: "", model_number: "", scanner_type: "Flatbed", condition: "New",
    scan_resolution: "1200dpi", connectivity: "", scan_speed_ppm: "", color_mode: "Color",
    warranty: "No warranty", price: "", gst_rate: "18", price_type: "incl", stock: "",
    intercity_delivery_charge: "0", description: "",
});

const scannerIsRowEmpty = (r) =>
    !["brand", "model_number", "price", "stock", "scan_speed_ppm", "connectivity", "description"]
        .some((k) => String(r[k] ?? "").trim() !== "");

const scannerRowErrors = (r) => {
    const errs = new Set();
    if (scannerIsRowEmpty(r)) return errs;
    for (const k of ["brand", "model_number", "scanner_type", "price", "stock"]) {
        if (String(r[k] ?? "").trim() === "") errs.add(k);
    }
    if (r.price !== "" && Number(r.price) <= 0) errs.add("price");
    if (r.stock !== "" && Number(r.stock) < 0) errs.add("stock");
    if (r.scanner_type && !SCANNER_TYPES.includes(r.scanner_type)) errs.add("scanner_type");
    return errs;
};

const scannerScalarPayload = (r) => ({
    brand: r.brand.trim(),
    model_number: r.model_number.trim(),
    scanner_type: r.scanner_type || "Flatbed",
    condition: r.condition || "New",
    scan_resolution: r.scan_resolution || null,
    connectivity: splitList(r.connectivity),
    scan_speed_ppm: num(r.scan_speed_ppm),
    color_mode: r.color_mode || "Color",
    warranty: r.warranty || "No warranty",
    price: basePriceFromRow(r.price, r),
    stock: Number(r.stock),
    gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
    intercity_delivery_charge: r.intercity_delivery_charge !== "" ? Number(r.intercity_delivery_charge) : 0,
    description: (r.description || "").trim() || null,
});

export const scannerBulkConfig = {
    title: "Bulk upload scanners",
    priceColumnKey: "price",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Brand, Model, Scanner Type, Price, Stock.",
    sheetName: "Scanners",
    templateFilename: "tonerscart_bulk_scanners_template.xlsx",
    currentFilename: "tonerscart_bulk_scanners.xlsx",
    unitLabel: "scanner",
    endpoint: "/supplier/scanners/bulk",
    columns: SCANNER_COLUMNS,
    selectOptions: {
        scanner_type: SCANNER_TYPES,
        condition: SCANNER_CONDITIONS,
        scan_resolution: SCANNER_RESOLUTIONS,
        color_mode: SCANNER_COLOR_MODES,
        warranty: SCANNER_WARRANTIES,
        gst_rate: GST_RATE_OPTIONS,
    },
    emptyRow: scannerEmptyRow,
    templateExample: {
        brand: "Canon", model_number: "CanoScan LiDE 400", scanner_type: "Flatbed", condition: "New",
        scan_resolution: "4800dpi", connectivity: "USB", scan_speed_ppm: "8", color_mode: "Color",
        warranty: "1 year", price: "10030", gst_rate: "18", price_type: "incl", stock: "10",
        intercity_delivery_charge: "150", description: "Compact flatbed scanner, 4800 dpi optical resolution.",
    },
    requiredKeys: ["brand", "model_number", "scanner_type", "price", "stock"],
    isRowEmpty: scannerIsRowEmpty,
    rowErrors: scannerRowErrors,
    toPayload: (r) => ({
        ...scannerScalarPayload(r),
        image_url: "",
        image_urls: [],
    }),
    itemPath: "/supplier/scanners",
    fromListing: (l) => {
        const gst = l.gst_rate != null ? Number(l.gst_rate) : 18;
        const incl = l.price != null ? Math.round(Number(l.price) * (1 + gst / 100)) : "";
        return {
            _id: l.id,
            brand: l.brand || "",
            model_number: l.model_number || "",
            scanner_type: l.scanner_type || "Flatbed",
            condition: l.condition || "New",
            scan_resolution: l.scan_resolution || "1200dpi",
            connectivity: joinList(l.connectivity),
            scan_speed_ppm: l.scan_speed_ppm ? String(l.scan_speed_ppm) : "",
            color_mode: l.color_mode || "Color",
            warranty: l.warranty || "No warranty",
            price: incl !== "" ? String(incl) : "",
            gst_rate: String(gst),
            price_type: "incl",
            stock: String(l.stock ?? ""),
            intercity_delivery_charge: String(l.intercity_delivery_charge ?? 0),
            description: l.description || "",
        };
    },
    toUpdatePayload: scannerScalarPayload,
};

const PAPER_SIZES = ["A4", "A3", "A5", "Letter", "Legal"];
const PAPER_BRANDS_HINT = "JK Paper";

const PAPER_COLUMNS = [
    { key: "brand", label: "Brand", required: true, type: "select", placeholder: "Select brand…", w: 150 },
    { key: "size", label: "Size", required: true, type: "select", w: 110 },
    { key: "gsm", label: "GSM", required: true, type: "number", w: 90 },
    { key: "reams_per_box", label: "Reams / Box", required: false, type: "number", w: 110 },
    { key: "gst_rate", label: "GST", required: true, type: "select", w: 90 },
    { key: "price_per_ream", label: "Price/Ream (₹)", required: true, type: "number", w: 130 },
    { key: "stock", label: "Stock (boxes)", required: true, type: "number", w: 110 },
    { key: "brightness", label: "Brightness", required: false, type: "number", w: 100 },
    { key: "suitable_for", label: "Suitable For", required: false, w: 160 },
    { key: "description", label: "Description", required: false, w: 220 },
];

const paperEmptyRow = () => ({
    brand: PAPER_BRANDS_HINT, size: "A4", gsm: "75", reams_per_box: "10",
    price_per_ream: "", gst_rate: "18", price_type: "incl", stock: "", brightness: "",
    suitable_for: "", description: "",
});

const paperIsRowEmpty = (r) =>
    String(r.price_per_ream ?? "").trim() === "" &&
    String(r.stock ?? "").trim() === "" &&
    String(r.description ?? "").trim() === "" &&
    String(r.brightness ?? "").trim() === "" &&
    String(r.suitable_for ?? "").trim() === "";

const paperRowErrors = (r) => {
    const errs = new Set();
    if (paperIsRowEmpty(r)) return errs;
    for (const k of ["brand", "size", "gsm", "price_per_ream", "stock"]) {
        if (String(r[k] ?? "").trim() === "") errs.add(k);
    }
    if (r.price_per_ream !== "" && Number(r.price_per_ream) <= 0) errs.add("price_per_ream");
    if (r.stock !== "" && Number(r.stock) < 0) errs.add("stock");
    if (r.gsm !== "" && (Number(r.gsm) < 40 || Number(r.gsm) > 400)) errs.add("gsm");
    if (r.size && !PAPER_SIZES.includes(r.size)) errs.add("size");
    if (r.brand && !PAPER_BRANDS.includes(r.brand)) errs.add("brand");
    return errs;
};

export const paperBulkConfig = {
    title: "Bulk upload papers",
    priceColumnKey: "price_per_ream",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Brand, Size, GSM, Price/Ream, Stock.",
    sheetName: "Papers",
    templateFilename: "tonerscart_bulk_papers_template.xlsx",
    currentFilename: "tonerscart_bulk_papers.xlsx",
    unitLabel: "paper",
    endpoint: "/supplier/papers/bulk",
    columns: PAPER_COLUMNS,
    selectOptions: { size: PAPER_SIZES, brand: PAPER_BRANDS, gst_rate: GST_RATE_OPTIONS },
    emptyRow: paperEmptyRow,
    templateExample: {
        brand: "JK Paper", size: "A4", gsm: "75", reams_per_box: "10",
        price_per_ream: "291", gst_rate: "12", price_type: "incl", stock: "40", brightness: "102",
        suitable_for: "Inkjet, Laser, Copier",
        description: "Premium copier paper, smooth finish.",
    },
    requiredKeys: ["brand", "size", "gsm", "price_per_ream", "stock"],
    isRowEmpty: paperIsRowEmpty,
    rowErrors: paperRowErrors,
    toPayload: (r) => ({
        brand: r.brand.trim(),
        size: r.size || "A4",
        gsm: Number(r.gsm),
        reams_per_box: r.reams_per_box !== "" ? Number(r.reams_per_box) : 10,
        price_per_ream: basePriceFromRow(r.price_per_ream, r),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        brightness: num(r.brightness),
        suitable_for: splitList(r.suitable_for),
        description: (r.description || "").trim() || null,
        image_url: null,
        image_urls: [],
    }),
    // Edit mode
    itemPath: "/supplier/papers",
    fromListing: (l) => {
        const gst = l.gst_rate != null ? Number(l.gst_rate) : 18;
        const incl = l.price_per_ream != null ? Math.round(Number(l.price_per_ream) * (1 + gst / 100)) : "";
        return {
            _id: l.id,
            brand: l.brand || "JK Paper",
            size: l.size || "A4",
            gsm: String(l.gsm ?? 75),
            reams_per_box: String(l.reams_per_box ?? 10),
            price_per_ream: incl !== "" ? String(incl) : "",
            gst_rate: String(gst),
            price_type: "incl",
            stock: String(l.stock ?? ""),
            brightness: l.brightness ? String(l.brightness) : "",
            suitable_for: joinList(l.suitable_for),
            description: l.description || "",
        };
    },
    toUpdatePayload: (r) => ({
        brand: r.brand.trim(),
        size: r.size || "A4",
        gsm: Number(r.gsm),
        reams_per_box: r.reams_per_box !== "" ? Number(r.reams_per_box) : 10,
        price_per_ream: basePriceFromRow(r.price_per_ream, r),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        brightness: num(r.brightness),
        suitable_for: splitList(r.suitable_for),
        description: (r.description || "").trim() || null,
    }),
};
