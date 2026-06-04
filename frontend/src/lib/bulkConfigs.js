// Config objects for the generic bulk-upload dialog (BulkUploadGeneric.jsx).
// One config per product type — columns map 1:1 to the backend create models.

const num = (v) => (v === "" || v == null ? null : Number(v));
const splitList = (v) =>
    String(v || "")
        .split(/[,;|]/)
        .map((x) => x.trim())
        .filter(Boolean);

// ============================ TONERS ============================

const TONER_TYPES = ["Original", "Compatible"];

const TONER_COLUMNS = [
    { key: "brand", label: "Brand", required: true, w: 130 },
    { key: "model_number", label: "Model Number", required: true, w: 160 },
    { key: "color", label: "Color", required: false, w: 110 },
    { key: "price", label: "Price (₹)", required: true, type: "number", w: 110 },
    { key: "gst_rate", label: "GST (%)", required: false, type: "number", w: 90 },
    { key: "stock", label: "Stock", required: true, type: "number", w: 90 },
    { key: "compatible_models", label: "Compatible Models", required: false, w: 200 },
    { key: "page_yield", label: "Page Yield", required: false, type: "number", w: 110 },
    { key: "oem_part_number", label: "OEM Part Number", required: false, w: 150 },
    { key: "toner_type", label: "Toner Type", required: true, type: "select", w: 130 },
    { key: "intercity_delivery_charge", label: "Intercity Delivery (₹)", required: false, type: "number", w: 140 },
];

const tonerEmptyRow = () => ({
    brand: "", model_number: "", color: "Black", price: "", gst_rate: "18",
    stock: "", compatible_models: "", page_yield: "", oem_part_number: "",
    toner_type: "Original", intercity_delivery_charge: "0",
});

const tonerIsRowEmpty = (r) =>
    !["brand", "model_number", "price", "stock", "compatible_models", "page_yield", "oem_part_number"]
        .some((k) => String(r[k] ?? "").trim() !== "");

const tonerRowErrors = (r) => {
    const errs = new Set();
    if (tonerIsRowEmpty(r)) return errs;
    for (const k of ["brand", "model_number", "price", "stock", "toner_type"]) {
        if (String(r[k] ?? "").trim() === "") errs.add(k);
    }
    if (r.price !== "" && Number(r.price) <= 0) errs.add("price");
    if (r.stock !== "" && Number(r.stock) < 0) errs.add("stock");
    if (r.toner_type && !TONER_TYPES.includes(r.toner_type)) errs.add("toner_type");
    return errs;
};

export const tonerBulkConfig = {
    title: "Bulk upload toners",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Brand, Model, Price, Stock, Toner Type.",
    sheetName: "Toners",
    templateFilename: "tonerscart_bulk_toners_template.xlsx",
    currentFilename: "tonerscart_bulk_toners.xlsx",
    unitLabel: "toner",
    endpoint: "/supplier/listings/bulk",
    columns: TONER_COLUMNS,
    selectOptions: { toner_type: TONER_TYPES },
    emptyRow: tonerEmptyRow,
    templateExample: {
        brand: "HP", model_number: "88A", color: "Black", price: "1850",
        gst_rate: "18", stock: "10", compatible_models: "P1007, P1008, P1106, P1108",
        page_yield: "1500", oem_part_number: "CC388A", toner_type: "Original",
        intercity_delivery_charge: "150",
    },
    requiredKeys: ["brand", "model_number", "price", "stock", "toner_type"],
    isRowEmpty: tonerIsRowEmpty,
    rowErrors: tonerRowErrors,
    toPayload: (r) => ({
        brand: r.brand.trim(),
        model_number: r.model_number.trim(),
        color: r.color || "Black",
        price: Number(r.price),
        stock: Number(r.stock),
        toner_type: r.toner_type || "Original",
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        compatible_models: r.compatible_models?.trim() || null,
        page_yield: r.page_yield !== "" ? Number(r.page_yield) : null,
        oem_part_number: r.oem_part_number?.trim() || null,
        intercity_delivery_charge: r.intercity_delivery_charge !== "" ? Number(r.intercity_delivery_charge) : 0,
        image_url: "",
        image_urls: [],
        variants: [{ color: r.color || "Black", price: Number(r.price), stock: Number(r.stock) }],
    }),
};

// ============================ PRINTERS ============================

const PRINTER_CATEGORIES = [
    { value: "laser", label: "Laser" },
    { value: "inkjet", label: "Inkjet" },
    { value: "tank", label: "Tank" },
    { value: "thermal", label: "Thermal" },
    { value: "production", label: "Production" },
    { value: "digital_press", label: "Digital Press" },
    { value: "label_barcode", label: "Label / Barcode" },
    { value: "ink", label: "Ink" },
    { value: "other", label: "Other" },
];
const PRINTER_USAGES = [
    { value: "home", label: "Home" },
    { value: "corporate", label: "Corporate" },
    { value: "commercial", label: "Commercial" },
    { value: "print_shop", label: "Print Shop" },
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
    { key: "brand", label: "Brand", required: true, w: 130 },
    { key: "model_number", label: "Model", required: true, w: 150 },
    { key: "category", label: "Type", required: true, type: "select", w: 130 },
    { key: "condition", label: "Condition", required: false, type: "select", w: 130 },
    { key: "usage_type", label: "Usage", required: true, type: "select", w: 130 },
    { key: "color", label: "Color", required: false, type: "select", w: 120 },
    { key: "price", label: "Price (₹)", required: true, type: "number", w: 110 },
    { key: "gst_rate", label: "GST (%)", required: false, type: "number", w: 90 },
    { key: "stock", label: "Stock", required: true, type: "number", w: 90 },
    { key: "print_speed_ppm", label: "Speed (ppm)", required: false, type: "number", w: 110 },
    { key: "monthly_volume_min", label: "Vol. Min", required: false, type: "number", w: 100 },
    { key: "monthly_volume_max", label: "Vol. Max", required: false, type: "number", w: 100 },
    { key: "connectivity", label: "Connectivity", required: false, w: 170 },
    { key: "paper_sizes", label: "Paper Sizes", required: false, w: 150 },
    { key: "description", label: "Description", required: false, w: 220 },
];

const printerEmptyRow = () => ({
    brand: "", model_number: "", category: "laser", condition: "new",
    usage_type: "corporate", color: "color", price: "", gst_rate: "18", stock: "",
    print_speed_ppm: "", monthly_volume_min: "", monthly_volume_max: "",
    connectivity: "", paper_sizes: "", description: "",
});

const printerIsRowEmpty = (r) =>
    !["brand", "model_number", "price", "stock", "print_speed_ppm", "monthly_volume_min",
      "monthly_volume_max", "connectivity", "paper_sizes", "description"]
        .some((k) => String(r[k] ?? "").trim() !== "");

const printerRowErrors = (r) => {
    const errs = new Set();
    if (printerIsRowEmpty(r)) return errs;
    for (const k of ["brand", "model_number", "category", "usage_type", "price", "stock"]) {
        if (String(r[k] ?? "").trim() === "") errs.add(k);
    }
    if (r.price !== "" && Number(r.price) <= 0) errs.add("price");
    if (r.stock !== "" && Number(r.stock) < 0) errs.add("stock");
    if (r.category && !PRINTER_CATEGORIES.some((c) => c.value === r.category)) errs.add("category");
    if (r.usage_type && !PRINTER_USAGES.some((u) => u.value === r.usage_type)) errs.add("usage_type");
    return errs;
};

export const printerBulkConfig = {
    title: "Bulk upload printers",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Brand, Model, Type, Usage, Price, Stock.",
    sheetName: "Printers",
    templateFilename: "tonerscart_bulk_printers_template.xlsx",
    currentFilename: "tonerscart_bulk_printers.xlsx",
    unitLabel: "printer",
    endpoint: "/supplier/printers/bulk",
    columns: PRINTER_COLUMNS,
    selectOptions: {
        category: PRINTER_CATEGORIES,
        condition: PRINTER_CONDITIONS,
        usage_type: PRINTER_USAGES,
        color: PRINTER_COLORS,
    },
    emptyRow: printerEmptyRow,
    templateExample: {
        brand: "HP", model_number: "LaserJet M404dn", category: "laser", condition: "new",
        usage_type: "corporate", color: "bw", price: "28000", gst_rate: "18", stock: "5",
        print_speed_ppm: "38", monthly_volume_min: "750", monthly_volume_max: "4000",
        connectivity: "Wi-Fi, Ethernet, USB", paper_sizes: "A4, A5, Legal",
        description: "Compact mono laser printer with auto-duplex.",
    },
    requiredKeys: ["brand", "model_number", "category", "usage_type", "price", "stock"],
    isRowEmpty: printerIsRowEmpty,
    rowErrors: printerRowErrors,
    toPayload: (r) => ({
        brand: r.brand.trim(),
        model_number: r.model_number.trim(),
        category: r.category || "laser",
        condition: r.condition || "new",
        usage_type: r.usage_type || "corporate",
        usage_types: [r.usage_type || "corporate"],
        color: r.color || "color",
        price: Number(r.price),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        print_speed_ppm: num(r.print_speed_ppm),
        monthly_volume_min: r.monthly_volume_min !== "" ? Number(r.monthly_volume_min) : 0,
        monthly_volume_max: r.monthly_volume_max !== "" ? Number(r.monthly_volume_max) : 0,
        connectivity: splitList(r.connectivity),
        paper_sizes: splitList(r.paper_sizes),
        description: (r.description || "").trim(),
        image_url: "",
        image_urls: [],
    }),
};

// ============================ PAPERS ============================

const PAPER_SIZES = ["A4", "A3", "A5", "Letter", "Legal"];
const PAPER_BRANDS_HINT = "JK Paper";

const PAPER_COLUMNS = [
    { key: "brand", label: "Brand", required: true, w: 140 },
    { key: "size", label: "Size", required: true, type: "select", w: 110 },
    { key: "gsm", label: "GSM", required: true, type: "number", w: 90 },
    { key: "reams_per_box", label: "Reams / Box", required: false, type: "number", w: 110 },
    { key: "price_per_ream", label: "Price/Ream (₹)", required: true, type: "number", w: 130 },
    { key: "gst_rate", label: "GST (%)", required: false, type: "number", w: 90 },
    { key: "stock", label: "Stock (boxes)", required: true, type: "number", w: 110 },
    { key: "brightness", label: "Brightness", required: false, type: "number", w: 100 },
    { key: "suitable_for", label: "Suitable For", required: false, w: 160 },
    { key: "description", label: "Description", required: false, w: 220 },
];

const paperEmptyRow = () => ({
    brand: PAPER_BRANDS_HINT, size: "A4", gsm: "75", reams_per_box: "10",
    price_per_ream: "", gst_rate: "18", stock: "", brightness: "",
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
    return errs;
};

export const paperBulkConfig = {
    title: "Bulk upload papers",
    subtitle: "Fill the table or upload a CSV / Excel. Required: Brand, Size, GSM, Price/Ream, Stock.",
    sheetName: "Papers",
    templateFilename: "tonerscart_bulk_papers_template.xlsx",
    currentFilename: "tonerscart_bulk_papers.xlsx",
    unitLabel: "paper",
    endpoint: "/supplier/papers/bulk",
    columns: PAPER_COLUMNS,
    selectOptions: { size: PAPER_SIZES },
    emptyRow: paperEmptyRow,
    templateExample: {
        brand: "JK Paper", size: "A4", gsm: "75", reams_per_box: "10",
        price_per_ream: "260", gst_rate: "12", stock: "40", brightness: "102",
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
        price_per_ream: Number(r.price_per_ream),
        stock: Number(r.stock),
        gst_rate: r.gst_rate !== "" ? Number(r.gst_rate) : 18,
        brightness: num(r.brightness),
        suitable_for: splitList(r.suitable_for),
        description: (r.description || "").trim() || null,
        image_url: null,
        image_urls: [],
    }),
};
