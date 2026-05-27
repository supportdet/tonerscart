import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { X, Plus, Trash2, Upload, Download, FileSpreadsheet, Loader2, CheckCircle2 } from "lucide-react";
import api from "../lib/api";

// Wave 11 — Bulk toner upload (spreadsheet-style).
// Columns map 1:1 with the ListingCreate model on the backend.

const COLUMNS = [
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

const TONER_TYPES = ["Original", "Compatible"];
const REQUIRED_KEYS = COLUMNS.filter((c) => c.required).map((c) => c.key);

const EMPTY_ROW = () => ({
    brand: "",
    model_number: "",
    color: "Black",
    price: "",
    gst_rate: "18",
    stock: "",
    compatible_models: "",
    page_yield: "",
    oem_part_number: "",
    toner_type: "Original",
    intercity_delivery_charge: "0",
});

const TEMPLATE_EXAMPLE = {
    brand: "HP",
    model_number: "88A",
    color: "Black",
    price: "1850",
    gst_rate: "18",
    stock: "10",
    compatible_models: "P1007, P1008, P1106, P1108",
    page_yield: "1500",
    oem_part_number: "CC388A",
    toner_type: "Original",
    intercity_delivery_charge: "150",
};

function rowIsEmpty(r) {
    return COLUMNS.every((c) => {
        const v = r[c.key];
        if (c.key === "color") return v === "" || v === "Black";
        if (c.key === "toner_type") return v === "" || v === "Original";
        if (c.key === "gst_rate") return v === "" || v === "18";
        if (c.key === "intercity_delivery_charge") return v === "" || v === "0";
        return v === "" || v == null;
    });
}

function rowErrors(r) {
    const errs = new Set();
    if (rowIsEmpty(r)) return errs; // empty rows are skipped, not flagged
    for (const k of REQUIRED_KEYS) {
        const v = r[k];
        if (v === "" || v == null) errs.add(k);
    }
    if (r.price !== "" && Number(r.price) <= 0) errs.add("price");
    if (r.stock !== "" && Number(r.stock) < 0) errs.add("stock");
    if (r.toner_type && !TONER_TYPES.includes(r.toner_type)) errs.add("toner_type");
    return errs;
}

function toListingPayload(r) {
    return {
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
    };
}

// Minimal CSV parser — handles quoted fields and embedded commas.
function parseCSV(text) {
    const rows = [];
    let cur = [], buf = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { buf += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else buf += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ",") { cur.push(buf); buf = ""; }
            else if (ch === "\n") { cur.push(buf); rows.push(cur); cur = []; buf = ""; }
            else if (ch === "\r") { /* skip */ }
            else buf += ch;
        }
    }
    if (buf.length || cur.length) { cur.push(buf); rows.push(cur); }
    return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim() !== ""));
}

function csvEscape(v) {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
}

function buildTemplate() {
    // Blank template — headers + ONE example row that the dealer can replace.
    const header = COLUMNS.map((c) => c.label).join(",");
    const example = COLUMNS.map((c) => csvEscape(TEMPLATE_EXAMPLE[c.key] ?? "")).join(",");
    return `${header}\n${example}\n`;
}

function buildCurrent(rows) {
    // Snapshot of the table as the dealer sees it (filled OR empty).
    const header = COLUMNS.map((c) => c.label).join(",");
    const body = rows.map((r) => COLUMNS.map((c) => csvEscape(r[c.key] ?? "")).join(","));
    return `${header}\n${body.join("\n")}\n`;
}

export default function BulkUploadDialog({ onClose, onSuccess }) {
    const [rows, setRows] = useState(() => Array.from({ length: 10 }, EMPTY_ROW));
    const [submitting, setSubmitting] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [result, setResult] = useState(null); // { succeeded, failed, errors }
    const [showErrors, setShowErrors] = useState(false);
    const fileRef = useRef(null);

    const updateCell = (idx, key, value) => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
        if (showErrors) setShowErrors(false); // user is fixing
    };

    const addRow = () => setRows((prev) => [...prev, EMPTY_ROW()]);
    const removeRow = (idx) => setRows((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

    const downloadXLSX = (data, filename) => {
        // data is an array-of-arrays: [headerRow, ...dataRows]
        const ws = XLSX.utils.aoa_to_sheet(data);
        // Set sensible column widths from our COLUMNS definition
        ws["!cols"] = COLUMNS.map((c) => ({ wch: Math.max(c.label.length + 2, Math.round((c.w || 100) / 7)) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Toners");
        XLSX.writeFile(wb, filename);
    };

    const downloadTemplate = () => {
        const header = COLUMNS.map((c) => c.label);
        const example = COLUMNS.map((c) => TEMPLATE_EXAMPLE[c.key] ?? "");
        downloadXLSX([header, example], "tonerscart_bulk_toners_template.xlsx");
    };

    const downloadCurrent = () => {
        // Snapshot the table as-is (10 empty rows if untouched, or whatever
        // the dealer has filled in so far).
        const header = COLUMNS.map((c) => c.label);
        const body = rows.map((r) => COLUMNS.map((c) => r[c.key] ?? ""));
        downloadXLSX([header, ...body], "tonerscart_bulk_toners.xlsx");
    };

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const name = file.name.toLowerCase();
            let parsed; // matrix of cells (array of arrays of strings)
            if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                // Excel branch — parse via SheetJS, take the first sheet, flatten to strings.
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
                parsed = matrix.map((r) => r.map((c) => (c == null ? "" : String(c))));
            } else {
                const text = await file.text();
                parsed = parseCSV(text);
            }
            if (parsed.length < 2) {
                toast.error("File is empty or has no data rows");
                return;
            }
            // Header → key map. Match by label OR key (case-insensitive, whitespace-tolerant).
            // Any unrecognised column is silently ignored (per Wave 13 spec).
            const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
            const header = parsed[0].map(norm);
            const keyByIdx = header.map((h) => {
                const col = COLUMNS.find((c) => norm(c.label) === h || c.key.toLowerCase() === h);
                return col?.key || null;
            });
            const recognised = keyByIdx.filter(Boolean).length;
            if (recognised === 0) {
                toast.error("No recognised columns found. Download the template for the correct headers.");
                return;
            }
            const dataRows = parsed.slice(1).map((cells) => {
                const r = EMPTY_ROW();
                keyByIdx.forEach((k, i) => {
                    if (!k) return; // skip unknown columns
                    const v = (cells[i] ?? "").trim();
                    if (v !== "") r[k] = v;
                });
                return r;
            }).filter((r) => !rowIsEmpty(r));
            if (dataRows.length === 0) {
                toast.error("No data rows detected after parsing");
                return;
            }
            // Pad with extra blank rows so the dealer can keep editing
            const padded = [...dataRows];
            while (padded.length < 10) padded.push(EMPTY_ROW());
            padded.push(EMPTY_ROW());
            setRows(padded);
            setShowErrors(false);
            const skipped = header.length - recognised;
            toast.success(`Loaded ${dataRows.length} row${dataRows.length === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} extra column${skipped === 1 ? "" : "s"} ignored` : ""}`);
        } catch (err) {
            toast.error("Could not parse file. Use the template format (CSV or Excel).");
        } finally {
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const submit = async () => {
        const nonEmpty = rows.filter((r) => !rowIsEmpty(r));
        if (nonEmpty.length === 0) {
            toast.error("Add at least one row");
            return;
        }
        // Validate
        const bad = nonEmpty.filter((r) => rowErrors(r).size > 0);
        if (bad.length > 0) {
            setShowErrors(true);
            toast.error(`${bad.length} row${bad.length === 1 ? "" : "s"} have missing required fields`);
            return;
        }

        setSubmitting(true);
        setProgress({ done: 0, total: nonEmpty.length });
        // Show a soft "uploading X of Y" pulse — we still send all rows in one
        // request because the backend creates them server-side, but we tick
        // the counter to give the dealer feedback during the network call.
        const ticker = setInterval(() => {
            setProgress((p) => p.done < p.total - 1 ? { ...p, done: p.done + 1 } : p);
        }, 220);
        try {
            const payload = nonEmpty.map(toListingPayload);
            const res = await api.post("/supplier/listings/bulk", payload);
            clearInterval(ticker);
            setProgress({ done: nonEmpty.length, total: nonEmpty.length });
            const data = res.data || {};
            setResult(data);
            if (data.succeeded > 0) {
                toast.success(`${data.succeeded} toner${data.succeeded === 1 ? "" : "s"} added successfully`);
            }
            if (data.failed === 0) {
                // Auto-close after a beat so the success state is visible
                setTimeout(() => { onSuccess?.(); onClose?.(); }, 1200);
            }
        } catch (e) {
            clearInterval(ticker);
            const msg = e?.response?.data?.detail || e?.message || "Upload failed";
            toast.error(typeof msg === "string" ? msg : "Upload failed");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4" data-testid="bulk-upload-dialog">
            <div className="bg-white text-[#0A0A0B] w-full max-w-[1200px] max-h-screen sm:max-h-[92vh] sm:rounded-[20px] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-black/[0.06]">
                    <div>
                        <h2 className="text-[18px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Bulk upload toners</h2>
                        <p className="text-[12.5px] text-[#6E6E73] mt-0.5">Fill the table or upload a CSV. Required: Brand, Model, Price, Stock, Toner Type.</p>
                    </div>
                    <button onClick={onClose} disabled={submitting} className="p-2 rounded-lg hover:bg-black/[0.04] disabled:opacity-50" data-testid="bulk-close-btn" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Action bar */}
                <div className="px-6 py-3 border-b border-black/[0.06] flex flex-wrap items-center gap-2 bg-[#FAFAFB]">
                    <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04]" data-testid="bulk-download-template">
                        <Download size={14} /> Template
                    </button>
                    <button onClick={downloadCurrent} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04]" data-testid="bulk-download-current" title="Download the current table (empty or filled)">
                        <Download size={14} /> Download table
                    </button>
                    <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04] cursor-pointer" data-testid="bulk-upload-csv-label">
                        <FileSpreadsheet size={14} /> Upload CSV / Excel
                        <input ref={fileRef} type="file" accept=".csv,.tsv,.xls,.xlsx,text/csv" onChange={onFile} className="hidden" data-testid="bulk-upload-csv-input" />
                    </label>
                    <div className="flex-1" />
                    <button onClick={addRow} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04]" data-testid="bulk-add-row">
                        <Plus size={14} /> Add row
                    </button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-[12.5px] border-separate border-spacing-0" data-testid="bulk-table">
                        <thead className="sticky top-0 bg-white z-10">
                            <tr>
                                <th className="px-2 py-2 border-b border-black/[0.08] text-left text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#6E6E73] w-10">#</th>
                                {COLUMNS.map((c) => (
                                    <th key={c.key} className="px-2 py-2 border-b border-black/[0.08] text-left text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#6E6E73]" style={{ minWidth: c.w }}>
                                        {c.label} {c.required && <span className="text-red-500">*</span>}
                                    </th>
                                ))}
                                <th className="px-2 py-2 border-b border-black/[0.08] w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, idx) => {
                                const errs = showErrors ? rowErrors(r) : new Set();
                                const isEmpty = rowIsEmpty(r);
                                return (
                                    <tr key={idx} className={errs.size ? "bg-red-50" : ""} data-testid={`bulk-row-${idx}`}>
                                        <td className="px-2 py-1 border-b border-black/[0.04] text-[11px] text-[#86868B] tabular-nums">{idx + 1}</td>
                                        {COLUMNS.map((c) => {
                                            const val = r[c.key] ?? "";
                                            const hasErr = errs.has(c.key);
                                            const base = `w-full h-8 px-2 text-[12.5px] rounded border ${hasErr ? "border-red-400 bg-red-50" : "border-transparent hover:border-[#E8E8EC] focus:border-[#0A0A0B]"} bg-white focus:outline-none`;
                                            if (c.type === "select") {
                                                return (
                                                    <td key={c.key} className="px-1 py-1 border-b border-black/[0.04]">
                                                        <select
                                                            value={val}
                                                            onChange={(e) => updateCell(idx, c.key, e.target.value)}
                                                            className={base}
                                                            data-testid={`bulk-cell-${idx}-${c.key}`}
                                                        >
                                                            {TONER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </td>
                                                );
                                            }
                                            return (
                                                <td key={c.key} className="px-1 py-1 border-b border-black/[0.04]">
                                                    <input
                                                        type={c.type === "number" ? "number" : "text"}
                                                        value={val}
                                                        onChange={(e) => updateCell(idx, c.key, e.target.value)}
                                                        min={c.type === "number" ? "0" : undefined}
                                                        className={base + (c.type === "number" ? " font-mono" : "")}
                                                        data-testid={`bulk-cell-${idx}-${c.key}`}
                                                        placeholder={isEmpty && c.key === "brand" ? "HP" : ""}
                                                    />
                                                </td>
                                            );
                                        })}
                                        <td className="px-1 py-1 border-b border-black/[0.04] text-center">
                                            <button
                                                onClick={() => removeRow(idx)}
                                                disabled={rows.length === 1}
                                                className="p-1.5 text-[#86868B] hover:text-red-600 disabled:opacity-30 rounded"
                                                data-testid={`bulk-row-remove-${idx}`}
                                                aria-label="Remove row"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Results / progress */}
                {result && (
                    <div className="px-6 py-3 border-t border-black/[0.06] text-[12.5px]" data-testid="bulk-result">
                        {result.succeeded > 0 && (
                            <div className="text-emerald-700 inline-flex items-center gap-2 font-semibold">
                                <CheckCircle2 size={14} /> {result.succeeded} added successfully
                            </div>
                        )}
                        {result.failed > 0 && (
                            <div className="text-red-600 mt-1">
                                {result.failed} failed — {result.errors?.slice(0, 3).map((e) => `row ${e.row + 1}: ${e.message}`).join("; ")}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-4 border-t border-black/[0.06] flex items-center justify-between gap-3 bg-white">
                    <div className="text-[12.5px] text-[#6E6E73]">
                        {submitting ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                                Uploading {progress.done} of {progress.total}…
                            </span>
                        ) : (
                            <>{rows.filter((r) => !rowIsEmpty(r)).length} row(s) ready</>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} disabled={submitting} className="h-10 px-4 rounded-lg border border-[#D2D2D7] text-[13px] font-semibold hover:bg-black/[0.04] disabled:opacity-50" data-testid="bulk-cancel-btn">
                            Cancel
                        </button>
                        <button
                            onClick={submit}
                            disabled={submitting}
                            className="h-10 px-5 rounded-lg text-[13px] font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60"
                            style={{ background: "#0A0A0B" }}
                            data-testid="bulk-submit-btn"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                            {submitting ? "Uploading…" : "Upload all"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
