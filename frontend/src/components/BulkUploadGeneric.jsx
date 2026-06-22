import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { X, Plus, Trash2, Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import { commissionFor } from "../lib/commission";
import { formatINR } from "../lib/listingConstants";

/**
 * Generic spreadsheet-style bulk upload dialog.
 * Driven entirely by a `config` object so it can power printers, papers, etc.
 * with identical UX to the toner bulk upload — PLUS a "download failed rows"
 * Excel for correction and re-upload.
 *
 * config = {
 *   title, subtitle, sheetName, templateFilename, currentFilename, unitLabel,
 *   endpoint,                         // POST endpoint, receives an array of payloads
 *   columns: [{ key, label, required, type?: 'number'|'select', w }],
 *   selectOptions: { key: [{value,label}] | string[] },
 *   emptyRow: () => ({...}),
 *   templateExample: {...},
 *   requiredKeys: string[],
 *   isRowEmpty: (r) => bool,
 *   rowErrors: (r) => Set<string>,
 *   toPayload: (r) => ({...}),
 * }
 */
const normOpts = (opts) =>
    (opts || []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));

/**
 * Searchable compatibility-DB model cell for bulk tables.
 * Typing 2+ characters searches printer models; the selected row brand's
 * models are shown first, then other brands below.
 *  - single=false (toners/consumables): multi-select, comma-joined string
 *  - single=true  (printers): picks one model into the cell
 */
function ModelSearchCell({ value, brand, single, hasErr, onChange, onPick, testid }) {
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState([]);
    const boxRef = useRef(null);
    const term = (single ? String(value || "") : (String(value || "").split(",").pop() || "")).trim();

    useEffect(() => {
        if (!open || term.length < 2) { setResults([]); return; }
        let active = true;
        const t = setTimeout(async () => {
            try {
                const { data } = await api.get("/compat/printers", { params: { q: term, limit: 12, brand: brand || "" } });
                if (active) setResults(Array.isArray(data) ? data : []);
            } catch { if (active) setResults([]); }
        }, 200);
        return () => { active = false; clearTimeout(t); };
    }, [term, brand, open]);

    useEffect(() => {
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const pickModel = (p) => {
        if (single) {
            onChange(p.model);
        } else {
            const parts = String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
            if (term) parts.pop(); // replace the partial term being typed
            if (!parts.some((x) => x.toLowerCase() === p.full_name.toLowerCase())) parts.push(p.full_name);
            onChange(parts.join(", ") + ", ");
        }
        onPick && onPick(p);
        setResults([]);
        setOpen(false);
    };

    const sameBrand = brand ? results.filter((p) => p.brand.toLowerCase() === brand.toLowerCase()) : results;
    const otherBrand = brand ? results.filter((p) => p.brand.toLowerCase() !== brand.toLowerCase()) : [];
    const optBtn = (p) => (
        <button type="button" key={p.slug} onClick={() => pickModel(p)}
            className="block w-full text-left px-2.5 py-1.5 text-[12.5px] text-[#0A0A0B] hover:bg-[#F2FBFC]"
            data-testid={`${testid}-option`}>
            {p.full_name}
        </button>
    );

    return (
        <div ref={boxRef} className="relative">
            <input
                value={value}
                onChange={(e) => { onChange(e.target.value); if (!open) setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="Type 2+ letters…"
                className={`w-full h-8 px-2 text-[12.5px] rounded border ${hasErr ? "border-red-400 bg-red-50" : "border-[#D2D2D7] hover:border-[#86868B] focus:border-[#0A0A0B]"} bg-white focus:outline-none`}
                data-testid={testid}
                autoComplete="off"
            />
            {open && results.length > 0 && (
                <div className="absolute z-50 mt-1 w-[320px] bg-white border border-[#E5E5EA] rounded-lg shadow-xl max-h-52 overflow-y-auto" data-testid={`${testid}-dropdown`}>
                    {brand && sameBrand.length > 0 && (
                        <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] tracking-[0.12em] uppercase font-bold text-[#86868B]">{brand} models</div>
                    )}
                    {sameBrand.map(optBtn)}
                    {otherBrand.length > 0 && (
                        <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] tracking-[0.12em] uppercase font-bold text-[#86868B] border-t border-black/[0.05]">Other brands</div>
                    )}
                    {otherBrand.map(optBtn)}
                </div>
            )}
        </div>
    );
}

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

export default function BulkUploadGeneric({ config, onClose, onSuccess, editMode = false, initialRows = null }) {
    const COLUMNS = config.columns;
    const PRICE_KEY = config.priceColumnKey || "price";
    const [rows, setRows] = useState(() =>
        (initialRows && initialRows.length)
            ? [...initialRows, config.emptyRow()]
            : Array.from({ length: 10 }, config.emptyRow)
    );
    // Wave 61 — single top-of-modal Incl/Excl GST toggle. Applies to every row.
    // Per-row `price_type` column was removed from each config; we copy this
    // value onto each row at submit time so basePriceFromRow keeps working.
    const [priceType, setPriceType] = useState("incl");
    const [submitting, setSubmitting] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [result, setResult] = useState(null); // { succeeded, failed, errors }
    const [failedRows, setFailedRows] = useState(null); // [{...row, _error}]
    const [showErrors, setShowErrors] = useState(false);
    const fileRef = useRef(null);

    const updateCell = (idx, key, value) => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
        if (showErrors) setShowErrors(false);
    };
    const addRow = () => setRows((prev) => [...prev, config.emptyRow()]);
    const removeRow = (idx) => setRows((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

    const writeXLSX = (data, filename) => {
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws["!cols"] = COLUMNS.map((c) => ({ wch: Math.max(c.label.length + 2, Math.round((c.w || 100) / 7)) })).concat([{ wch: 40 }]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
        XLSX.writeFile(wb, filename);
    };

    const downloadTemplate = () => {
        const header = COLUMNS.map((c) => c.label);
        const example = COLUMNS.map((c) => config.templateExample[c.key] ?? "");
        writeXLSX([header, example], config.templateFilename);
    };
    const downloadCurrent = () => {
        const header = COLUMNS.map((c) => c.label);
        const body = rows.map((r) => COLUMNS.map((c) => r[c.key] ?? ""));
        writeXLSX([header, ...body], config.currentFilename);
    };
    const downloadFailed = () => {
        if (!failedRows || failedRows.length === 0) return;
        const header = [...COLUMNS.map((c) => c.label), "Error reason"];
        const body = failedRows.map((r) => [...COLUMNS.map((c) => r[c.key] ?? ""), r._error || ""]);
        writeXLSX([header, ...body], config.currentFilename.replace(/\.xlsx$/, "_failed.xlsx"));
    };

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const name = file.name.toLowerCase();
            let parsed;
            if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
                parsed = matrix.map((r) => r.map((c) => (c == null ? "" : String(c))));
            } else {
                const text = await file.text();
                parsed = parseCSV(text);
            }
            if (parsed.length < 2) { toast.error("File is empty or has no data rows"); return; }
            const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
            const header = parsed[0].map(norm);
            const keyByIdx = header.map((h) => {
                const col = COLUMNS.find((c) => norm(c.label) === h || c.key.toLowerCase() === h);
                return col?.key || null;
            });
            const recognised = keyByIdx.filter(Boolean).length;
            if (recognised === 0) { toast.error("No recognised columns found. Download the template for the correct headers."); return; }
            const dataRows = parsed.slice(1).map((cells) => {
                const r = config.emptyRow();
                keyByIdx.forEach((k, i) => {
                    if (!k) return;
                    const v = (cells[i] ?? "").trim();
                    if (v !== "") r[k] = v;
                });
                return r;
            }).filter((r) => !config.isRowEmpty(r));
            if (dataRows.length === 0) { toast.error("No data rows detected after parsing"); return; }
            const padded = [...dataRows];
            while (padded.length < 10) padded.push(config.emptyRow());
            padded.push(config.emptyRow());
            setRows(padded);
            setShowErrors(false);
            const skipped = header.length - recognised;
            toast.success(`Loaded ${dataRows.length} row${dataRows.length === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} extra column${skipped === 1 ? "" : "s"} ignored` : ""}`);
        } catch {
            toast.error("Could not parse file. Use the template format (CSV or Excel).");
        } finally {
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const submit = async () => {
        // Wave 61 — stamp the modal-level Incl/Excl choice onto every row
        // before validation + payload generation so basePriceFromRow has the
        // correct conversion direction.
        const nonEmpty = rows
            .filter((r) => !config.isRowEmpty(r))
            .map((r) => ({ ...r, price_type: priceType }));
        if (nonEmpty.length === 0) { toast.error("Add at least one row"); return; }

        // Partition by client-side validation. Valid rows are submitted; invalid
        // rows are reported (and downloadable) so the dealer can fix only those.
        const clientValid = [];
        const clientFailed = []; // { data, message }
        nonEmpty.forEach((r) => {
            const errs = config.rowErrors(r);
            if (errs.size === 0) clientValid.push(r);
            else clientFailed.push({ data: r, message: `Missing / invalid: ${[...errs].join(", ")}` });
        });
        setShowErrors(clientFailed.length > 0);

        // Nothing valid to send — just surface the failures.
        if (clientValid.length === 0) {
            const failed = clientFailed.map((c) => ({ ...c.data, _error: c.message }));
            setResult({ succeeded: 0, failed: failed.length, errors: failed.map((f, i) => ({ row: i, message: f._error })) });
            setFailedRows(failed);
            toast.error(`${failed.length} row${failed.length === 1 ? "" : "s"} need fixing`);
            return;
        }

        // ---- Edit mode: update existing rows (PUT) + create new ones (POST), one by one.
        if (editMode) {
            setResult(null);
            setFailedRows(null);
            setSubmitting(true);
            setProgress({ done: 0, total: clientValid.length });
            const failures = clientFailed.map((c) => ({ ...c.data, _error: c.message }));
            let succeeded = 0;
            for (let i = 0; i < clientValid.length; i++) {
                const r = clientValid[i];
                try {
                    if (r._id) await api.put(`${config.itemPath}/${r._id}`, config.toUpdatePayload(r));
                    else await api.post(config.itemPath, config.toPayload(r));
                    succeeded += 1;
                } catch (e) {
                    const msg = e?.response?.data?.detail || e?.message || "Save failed";
                    failures.push({ ...r, _error: typeof msg === "string" ? msg : "Save failed" });
                }
                setProgress({ done: i + 1, total: clientValid.length });
            }
            setSubmitting(false);
            setResult({ succeeded, failed: failures.length, errors: failures.map((f, i) => ({ row: i, message: f._error })) });
            setFailedRows(failures.length > 0 ? failures : null);
            if (succeeded > 0) {
                toast.success(`${succeeded} ${config.unitLabel}${succeeded === 1 ? "" : "s"} saved${failures.length ? `, ${failures.length} failed` : ""}`);
            }
            if (failures.length === 0) {
                setTimeout(() => { onSuccess?.(); onClose?.(); }, 1000);
            } else {
                onSuccess?.();
            }
            return;
        }

        setResult(null);
        setFailedRows(null);
        setSubmitting(true);
        setProgress({ done: 0, total: clientValid.length });
        const ticker = setInterval(() => {
            setProgress((p) => p.done < p.total - 1 ? { ...p, done: p.done + 1 } : p);
        }, 220);
        try {
            const payload = clientValid.map(config.toPayload);
            const res = await api.post(config.endpoint, payload);
            clearInterval(ticker);
            setProgress({ done: clientValid.length, total: clientValid.length });
            const data = res.data || {};
            // Map backend per-row errors back onto the submitted (clientValid) rows,
            // then merge with the client-side failures into one downloadable set.
            const backendFailed = (Array.isArray(data.errors) ? data.errors : [])
                .map((er) => ({ ...(clientValid[er.row] || {}), _error: er.message }));
            const allFailed = [
                ...backendFailed,
                ...clientFailed.map((c) => ({ ...c.data, _error: c.message })),
            ];
            const succeeded = data.succeeded || 0;
            setResult({ succeeded, failed: allFailed.length, errors: allFailed.map((f, i) => ({ row: i, message: f._error })) });
            setFailedRows(allFailed.length > 0 ? allFailed : null);
            if (succeeded > 0) {
                toast.success(`${succeeded} ${config.unitLabel}${succeeded === 1 ? "" : "s"} uploaded successfully${allFailed.length ? `, ${allFailed.length} failed` : ""}`);
            }
            if (allFailed.length === 0) {
                setTimeout(() => { onSuccess?.(); onClose?.(); }, 1200);
            } else {
                onSuccess?.(); // refresh list to show the rows that did succeed
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
                <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-black/[0.06]">
                    <div>
                        <h2 className="text-[18px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>{editMode ? (config.editTitle || config.title) : config.title}</h2>
                        <p className="text-[12.5px] text-[#6E6E73] mt-0.5">{editMode ? (config.editSubtitle || config.subtitle) : config.subtitle}</p>
                    </div>
                    <button onClick={onClose} disabled={submitting} className="p-2 rounded-lg hover:bg-black/[0.04] disabled:opacity-50" data-testid="bulk-close-btn" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-3 border-b border-black/[0.06] flex flex-wrap items-center gap-2 bg-[#FAFAFB]">
                    <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04]" data-testid="bulk-download-template">
                        <Download size={14} /> Template
                    </button>
                    <button onClick={downloadCurrent} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04]" data-testid="bulk-download-current" title="Download the current table">
                        <Download size={14} /> Download table
                    </button>
                    <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04] cursor-pointer" data-testid="bulk-upload-csv-label">
                        <FileSpreadsheet size={14} /> Upload CSV / Excel
                        <input ref={fileRef} type="file" accept=".csv,.tsv,.xls,.xlsx,text/csv" onChange={onFile} className="hidden" data-testid="bulk-upload-csv-input" />
                    </label>

                    {/* Wave 61 — single Incl/Excl GST toggle for the whole table. */}
                    <div className="inline-flex items-center gap-2 ml-1 pl-3 border-l border-black/[0.08]" data-testid="bulk-price-type-toggle">
                        <span className="text-[11px] font-semibold text-[#3a3a40] uppercase tracking-wide">Prices are:</span>
                        <div className="inline-flex items-center gap-1.5" role="radiogroup" aria-label="Price type">
                            {[
                                { id: "incl", label: "Incl. GST" },
                                { id: "excl", label: "Excl. GST" },
                            ].map((opt) => {
                                const sel = priceType === opt.id;
                                return (
                                    <button
                                        type="button"
                                        key={opt.id}
                                        role="radio"
                                        aria-checked={sel}
                                        onClick={() => setPriceType(opt.id)}
                                        className={`h-7 px-3 text-[11.5px] font-semibold rounded-full transition ${sel ? "bg-[#0A0A0B] text-white shadow-sm" : "bg-white text-[#6E6E73] border border-black/[0.12] hover:bg-black/[0.04]"}`}
                                        data-testid={`bulk-price-type-${opt.id}`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex-1" />
                    <button onClick={addRow} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 rounded-lg border border-[#D2D2D7] bg-white hover:bg-black/[0.04]" data-testid="bulk-add-row">
                        <Plus size={14} /> Add row
                    </button>
                </div>

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
                                const errs = showErrors ? config.rowErrors(r) : new Set();
                                return (
                                    <tr key={idx} className={errs.size ? "bg-red-50" : ""} data-testid={`bulk-row-${idx}`}>
                                        <td className="px-2 py-1 border-b border-black/[0.04] text-[11px] text-[#86868B] tabular-nums">{idx + 1}</td>
                                        {COLUMNS.map((c) => {
                                            const val = r[c.key] ?? "";
                                            const hasErr = errs.has(c.key);
                                            // Visible border on every cell so empty inputs don't look like blank space.
                                            const base = `w-full h-8 px-2 text-[12.5px] rounded border ${hasErr ? "border-red-400 bg-red-50" : "border-[#D2D2D7] hover:border-[#86868B] focus:border-[#0A0A0B]"} bg-white focus:outline-none`;
                                            if (c.type === "select") {
                                                const opts = normOpts(config.selectOptions?.[c.key]);
                                                return (
                                                    <td key={c.key} className="px-1 py-1 border-b border-black/[0.04]">
                                                        <select value={val} onChange={(e) => updateCell(idx, c.key, e.target.value)} className={base} data-testid={`bulk-cell-${idx}-${c.key}`}>
                                                            {c.placeholder !== undefined && <option value="">{c.placeholder}</option>}
                                                            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    </td>
                                                );
                                            }
                                            if (c.type === "models") {
                                                return (
                                                    <td key={c.key} className="px-1 py-1 border-b border-black/[0.04]">
                                                        <ModelSearchCell
                                                            value={val}
                                                            brand={r[c.brandKey || "brand"] || ""}
                                                            single={!!c.single}
                                                            hasErr={hasErr}
                                                            onChange={(v) => updateCell(idx, c.key, v)}
                                                            onPick={c.autofillBrand ? (p) => {
                                                                const brandOpts = normOpts(config.selectOptions?.brand);
                                                                if (brandOpts.some((o) => o.value === p.brand)) updateCell(idx, "brand", p.brand);
                                                            } : undefined}
                                                            testid={`bulk-cell-${idx}-${c.key}`}
                                                        />
                                                    </td>
                                                );
                                            }
                                            return (
                                                <td key={c.key} className="px-1 py-1 border-b border-black/[0.04] align-top">
                                                    <input
                                                        type={c.type === "number" ? "number" : "text"}
                                                        value={val}
                                                        onChange={(e) => updateCell(idx, c.key, e.target.value)}
                                                        min={c.type === "number" ? "0" : undefined}
                                                        className={base + (c.type === "number" ? " font-mono" : "")}
                                                        data-testid={`bulk-cell-${idx}-${c.key}`}
                                                    />
                                                    {c.key === PRICE_KEY && Number(val) > 0 && (() => {
                                                        // Wave 61 — live per-row payout breakdown.
                                                        const typed = Number(val);
                                                        const gst = r.gst_rate !== "" && r.gst_rate != null ? Number(r.gst_rate) : 18;
                                                        const basePrice = priceType === "incl"
                                                            ? Math.round((typed / (1 + gst / 100)) * 100) / 100
                                                            : typed;
                                                        const c2 = commissionFor(basePrice);
                                                        if (!c2) return null;
                                                        const gstAmt = Math.round(basePrice * gst / 100);
                                                        const payout = Math.max(0, Math.round(basePrice - c2.commission));
                                                        return (
                                                            <div className="mt-1.5 text-[10.5px] leading-[1.45] space-y-[1px] font-mono" data-testid={`bulk-breakdown-${idx}`}>
                                                                <div className="flex justify-between text-emerald-700 font-semibold">
                                                                    <span>You&rsquo;ll receive:</span>
                                                                    <span>{formatINR(payout)}</span>
                                                                </div>
                                                                <div className="flex justify-between text-red-600">
                                                                    <span>Commission ({c2.rateLabel}):</span>
                                                                    <span>− {formatINR(c2.commission)}</span>
                                                                </div>
                                                                <div className="flex justify-between text-[#6E6E73]">
                                                                    <span>GST ({gst}%):</span>
                                                                    <span>{formatINR(gstAmt)}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                            );
                                        })}
                                        <td className="px-1 py-1 border-b border-black/[0.04] text-center">
                                            <button onClick={() => removeRow(idx)} disabled={rows.length === 1} className="p-1.5 text-[#86868B] hover:text-red-600 disabled:opacity-30 rounded" data-testid={`bulk-row-remove-${idx}`} aria-label="Remove row">
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {result && (
                    <div className="px-6 py-3 border-t border-black/[0.06] text-[12.5px]" data-testid="bulk-result">
                        {result.succeeded > 0 && (
                            <div className="text-emerald-700 inline-flex items-center gap-2 font-semibold" data-testid="bulk-result-success">
                                <CheckCircle2 size={14} /> {result.succeeded} {config.unitLabel}{result.succeeded === 1 ? "" : "s"} uploaded successfully{result.failed > 0 ? `, ${result.failed} failed` : ""}
                            </div>
                        )}
                        {result.succeeded === 0 && result.failed > 0 && (
                            <div className="text-red-600 inline-flex items-center gap-2 font-semibold" data-testid="bulk-result-allfailed">
                                <AlertTriangle size={14} /> 0 uploaded, {result.failed} failed
                            </div>
                        )}
                        {result.failed > 0 && (
                            <div className="mt-2 space-y-1.5" data-testid="bulk-failed-list">
                                {result.errors?.slice(0, 5).map((e, i) => (
                                    <div key={i} className="text-red-600">Row {e.row + 1}: {e.message}</div>
                                ))}
                                {result.errors?.length > 5 && <div className="text-[#86868B]">+{result.errors.length - 5} more…</div>}
                                <button onClick={downloadFailed} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 h-9 mt-1 rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100" data-testid="bulk-download-failed">
                                    <Download size={14} /> Download failed rows
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="px-6 py-4 border-t border-black/[0.06] flex items-center justify-between gap-3 bg-white">
                    <div className="text-[12.5px] text-[#6E6E73]">
                        {submitting ? (
                            <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Uploading {progress.done} of {progress.total}…</span>
                        ) : (
                            <>{rows.filter((r) => !config.isRowEmpty(r)).length} row(s) ready</>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} disabled={submitting} className="h-10 px-4 rounded-lg border border-[#D2D2D7] text-[13px] font-semibold hover:bg-black/[0.04] disabled:opacity-50" data-testid="bulk-cancel-btn">Cancel</button>
                        <button onClick={submit} disabled={submitting} className="h-10 px-5 rounded-lg text-[13px] font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60" style={{ background: "#0A0A0B" }} data-testid="bulk-submit-btn">
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                            {submitting ? (editMode ? "Saving…" : "Uploading…") : (editMode ? "Save changes" : "Upload all")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
