import React, { useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { UploadCloud, Loader2, Check, X as XIcon, AlertTriangle, Download, Mail, Users, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import api, { formatApiError } from "../../lib/api";

/**
 * Wave 98 — Admin "Bulk add dealers" feature.
 *
 * Admin uploads a CSV or .xlsx file with columns:
 *   Business Name | Email | Phone | City | GSTIN
 *
 * Frontend parses → preview table → confirm → POST /api/admin/dealers/bulk-create.
 * Server creates one Phase-1 dealer per row, generates a 7-day Supabase
 * magic-link, and sends a branded "Go to Dashboard" welcome email via Resend.
 * Duplicate emails are skipped — existing dealers are NEVER overwritten.
 */

const COLS = [
    { key: "business_name", label: "Business Name", required: true,
      aliases: ["business name", "businessname", "business", "company", "company name", "dealer", "dealer name", "name"] },
    { key: "email", label: "Email", required: true,
      aliases: ["email", "e-mail", "email address", "emailid", "mail"] },
    { key: "phone", label: "Phone", required: false,
      aliases: ["phone", "mobile", "phone number", "mobile number", "contact", "contact no", "phone no"] },
    { key: "city", label: "City", required: false,
      aliases: ["city", "town", "location"] },
    { key: "gstin", label: "GSTIN", required: false,
      aliases: ["gstin", "gst", "gst number", "gst no", "gstno"] },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normHeader = (h) => String(h || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");

function mapHeaders(headers) {
    const idx = {};
    headers.forEach((h, i) => {
        const n = normHeader(h);
        for (const c of COLS) {
            if (idx[c.key] != null) continue;
            if (c.aliases.includes(n) || normHeader(c.label) === n) {
                idx[c.key] = i;
                break;
            }
        }
    });
    return idx;
}

function parseRows(rows) {
    if (!rows.length) return { rows: [], headerMissing: COLS.filter((c) => c.required).map((c) => c.label) };
    const headers = rows[0].map((x) => String(x || ""));
    const idx = mapHeaders(headers);
    const headerMissing = COLS.filter((c) => c.required && idx[c.key] == null).map((c) => c.label);
    if (headerMissing.length) return { rows: [], headerMissing };
    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const row = {};
        for (const c of COLS) {
            const cell = idx[c.key] != null ? r[idx[c.key]] : "";
            row[c.key] = String(cell == null ? "" : cell).trim();
        }
        if (!row.business_name && !row.email) continue; // empty row
        out.push(row);
    }
    return { rows: out, headerMissing: [] };
}

function validate(rows) {
    const seen = new Map();
    return rows.map((r, idx) => {
        const errs = [];
        if (!r.business_name) errs.push("Business name missing");
        if (!r.email) errs.push("Email missing");
        else if (!EMAIL_RE.test(r.email)) errs.push("Invalid email");
        if (r.email) {
            const key = r.email.toLowerCase();
            if (seen.has(key)) errs.push(`Duplicate email in file (row ${seen.get(key) + 1})`);
            else seen.set(key, idx);
        }
        return { ...r, _row: idx + 1, _errors: errs };
    });
}

export default function BulkDealerUpload({ open, onClose, onCreated }) {
    const fileRef = useRef(null);
    const [rows, setRows] = useState([]);
    const [filename, setFilename] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [headerError, setHeaderError] = useState("");

    const reset = () => { setRows([]); setFilename(""); setResult(null); setHeaderError(""); if (fileRef.current) fileRef.current.value = ""; };

    const onFile = (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setFilename(f.name); setResult(null); setHeaderError("");
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = new Uint8Array(ev.target.result);
                const wb = XLSX.read(data, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
                const { rows: parsed, headerMissing } = parseRows(raw);
                if (headerMissing.length) {
                    setHeaderError(`Missing required column(s): ${headerMissing.join(", ")}`);
                    setRows([]);
                    return;
                }
                setRows(validate(parsed));
            } catch (err) {
                toast.error(`Couldn't read file: ${err.message || err}`);
            }
        };
        reader.readAsArrayBuffer(f);
    };

    const downloadTemplate = () => {
        const aoa = [COLS.map((c) => c.label), [
            "Big C Technologies Pvt Ltd", "owner@bigctech.com", "9876543210", "Bangalore", "29ABCDE1234F1Z5",
        ]];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Dealers");
        XLSX.writeFile(wb, "tonerscart-bulk-dealers-template.xlsx");
    };

    const validRows = rows.filter((r) => r._errors.length === 0);
    const invalidRows = rows.filter((r) => r._errors.length > 0);

    const submit = async () => {
        if (!validRows.length) return;
        setSubmitting(true);
        try {
            const { data } = await api.post("/admin/dealers/bulk-create", {
                rows: validRows.map((r) => ({
                    business_name: r.business_name,
                    email: r.email.toLowerCase(),
                    phone: r.phone,
                    city: r.city,
                    gstin: r.gstin,
                })),
            });
            setResult(data);
            toast.success(`${data.created} dealer${data.created === 1 ? "" : "s"} created · ${data.emails_sent} email${data.emails_sent === 1 ? "" : "s"} sent`);
            onCreated && onCreated();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) { onClose(); reset(); } }}>
            <DialogContent className="max-w-[820px] max-h-[90vh] overflow-y-auto p-6 rounded-[18px]" data-testid="bulk-dealers-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[20px] flex items-center gap-2" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        <Users size={18} /> Bulk add dealers
                    </DialogTitle>
                </DialogHeader>

                {!result && (
                    <div className="mt-2 space-y-4">
                        <div className="text-[12.5px] text-[#6E6E73]">
                            Upload a CSV or Excel file with the columns: <strong>Business Name, Email, Phone, City, GSTIN</strong>. Each new dealer gets a Phase-1 account and a branded welcome email with a one-time magic-login link (7-day TTL). Existing dealers are <strong>skipped automatically</strong> — no overwrites.
                        </div>

                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={downloadTemplate} className="inline-flex items-center gap-1.5" data-testid="bulk-dealers-template-btn">
                                <Download size={14} /> Download template
                            </Button>
                            <label className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-[#0A0A0B] text-white text-[13px] font-semibold cursor-pointer hover:bg-[#23252B]" data-testid="bulk-dealers-file-label">
                                <UploadCloud size={14} /> Choose CSV / Excel
                                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} className="hidden" data-testid="bulk-dealers-file-input" />
                            </label>
                            {filename && <span className="text-[12px] text-[#6E6E73]"><FileText size={12} className="inline mr-1" />{filename}</span>}
                        </div>

                        {headerError && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[12.5px]" data-testid="bulk-dealers-header-error">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {headerError}
                            </div>
                        )}

                        {rows.length > 0 && (
                            <>
                                <div className="text-[12px] text-[#6E6E73] flex items-center gap-4" data-testid="bulk-dealers-preview-summary">
                                    <span><strong>{validRows.length}</strong> valid · <strong className="text-amber-700">{invalidRows.length}</strong> with errors</span>
                                </div>
                                <div className="border border-black/[0.06] rounded-lg overflow-x-auto max-h-[320px]">
                                    <table className="w-full min-w-[680px] text-[12.5px]">
                                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.14em] uppercase text-[#6E6E73] sticky top-0">
                                            <tr>
                                                <th className="text-left p-2 w-10">#</th>
                                                <th className="text-left p-2">Business</th>
                                                <th className="text-left p-2">Email</th>
                                                <th className="text-left p-2">Phone</th>
                                                <th className="text-left p-2">City</th>
                                                <th className="text-left p-2">GSTIN</th>
                                                <th className="text-left p-2">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((r) => (
                                                <tr key={r._row} className={`border-t border-black/[0.04] ${r._errors.length ? "bg-red-50/40" : ""}`} data-testid={`bulk-dealer-row-${r._row}`}>
                                                    <td className="p-2 text-[#86868B]">{r._row}</td>
                                                    <td className="p-2 font-medium">{r.business_name || <span className="text-red-600">—</span>}</td>
                                                    <td className="p-2 font-mono text-[11.5px]">{r.email || <span className="text-red-600">—</span>}</td>
                                                    <td className="p-2">{r.phone}</td>
                                                    <td className="p-2">{r.city}</td>
                                                    <td className="p-2 font-mono text-[11px]">{r.gstin}</td>
                                                    <td className="p-2 text-[11px]">
                                                        {r._errors.length === 0
                                                            ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={11} /> Ready</span>
                                                            : <span className="text-red-700">{r._errors.join("; ")}</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }} disabled={submitting}>Cancel</Button>
                            <Button type="button" disabled={!validRows.length || submitting} onClick={submit} className="btn-cta inline-flex items-center gap-1.5" data-testid="bulk-dealers-submit-btn">
                                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                                {submitting ? "Creating…" : `Create ${validRows.length} dealer${validRows.length === 1 ? "" : "s"} & send welcome emails`}
                            </Button>
                        </div>
                    </div>
                )}

                {result && (
                    <div className="mt-3 space-y-4" data-testid="bulk-dealers-result">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <SummaryCard label="Created" value={result.created} accent="emerald" testid="bulk-result-created" />
                            <SummaryCard label="Emails sent" value={result.emails_sent} accent="cyan" testid="bulk-result-emails" />
                            <SummaryCard label="Skipped (already exist)" value={result.skipped_existing} accent="amber" testid="bulk-result-skipped" />
                            <SummaryCard label="Failed" value={result.failed} accent={result.failed ? "red" : "neutral"} testid="bulk-result-failed" />
                        </div>
                        {Array.isArray(result.skipped_rows) && result.skipped_rows.length > 0 && (
                            <details className="bg-amber-50/40 border border-amber-200 rounded-lg p-3 text-[12.5px]">
                                <summary className="cursor-pointer font-semibold text-amber-800">Skipped — already exist ({result.skipped_rows.length})</summary>
                                <ul className="mt-2 space-y-1">
                                    {result.skipped_rows.map((r) => <li key={r.email}><span className="font-mono text-[11.5px]">{r.email}</span> — {r.business_name}</li>)}
                                </ul>
                            </details>
                        )}
                        {Array.isArray(result.failed_rows) && result.failed_rows.length > 0 && (
                            <details className="bg-red-50/40 border border-red-200 rounded-lg p-3 text-[12.5px]" open>
                                <summary className="cursor-pointer font-semibold text-red-700">Failed ({result.failed_rows.length})</summary>
                                <ul className="mt-2 space-y-1">
                                    {result.failed_rows.map((r) => <li key={r.email}><span className="font-mono text-[11.5px]">{r.email}</span> — {r.reason}</li>)}
                                </ul>
                            </details>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={reset}>Upload another file</Button>
                            <Button type="button" onClick={() => { onClose(); reset(); }} className="btn-cta">Done</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function SummaryCard({ label, value, accent, testid }) {
    const colors = {
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
        cyan: "bg-cyan-50 text-cyan-700 border-cyan-200",
        amber: "bg-amber-50 text-amber-700 border-amber-200",
        red: "bg-red-50 text-red-700 border-red-200",
        neutral: "bg-[#F4F4F6] text-[#0A0A0B] border-[#E5E5EA]",
    };
    return (
        <div className={`rounded-lg border p-3 ${colors[accent] || colors.neutral}`} data-testid={testid}>
            <div className="text-[10px] tracking-[0.14em] uppercase font-semibold opacity-80">{label}</div>
            <div className="text-[22px] font-bold mt-0.5">{value ?? 0}</div>
        </div>
    );
}
