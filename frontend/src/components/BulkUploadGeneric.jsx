import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { X, Plus, Trash2, Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import api from "../lib/api";

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

export default function BulkUploadGeneric({ config, onClose, onSuccess }) {
    const COLUMNS = config.columns;
    const [rows, setRows] = useState(() => Array.from({ length: 10 }, config.emptyRow));
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
        const nonEmpty = rows.filter((r) => !config.isRowEmpty(r));
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
                        <h2 className="text-[18px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>{config.title}</h2>
                        <p className="text-[12.5px] text-[#6E6E73] mt-0.5">{config.subtitle}</p>
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
                                            const base = `w-full h-8 px-2 text-[12.5px] rounded border ${hasErr ? "border-red-400 bg-red-50" : "border-transparent hover:border-[#E8E8EC] focus:border-[#0A0A0B]"} bg-white focus:outline-none`;
                                            if (c.type === "select") {
                                                const opts = normOpts(config.selectOptions?.[c.key]);
                                                return (
                                                    <td key={c.key} className="px-1 py-1 border-b border-black/[0.04]">
                                                        <select value={val} onChange={(e) => updateCell(idx, c.key, e.target.value)} className={base} data-testid={`bulk-cell-${idx}-${c.key}`}>
                                                            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                                                    />
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
                            {submitting ? "Uploading…" : "Upload all"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
