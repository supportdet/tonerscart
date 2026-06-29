import React, { useState } from "react";
import { Building2, FileText, Upload, ChevronRight, X as XIcon, ShieldCheck, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import api, { formatApiError } from "../lib/api";

/**
 * Wave 98 — "Complete your profile" Phase 2 banner.
 *
 * Shown to APPROVED dealers whose bank details or required KYC documents
 * are missing. Auto-dismisses once both are filled. Phase 2 is required
 * before first payout but does NOT block listing/selling.
 *
 * Props:
 *   supplier  – user.supplier object from /auth/me (includes bank fields +
 *               doc_* paths)
 *   onUpdated – called after a successful save so the parent can refresh()
 */
const REQUIRED_DOCS = [
    { key: "doc_gst", label: "GST certificate" },
    { key: "doc_pan", label: "PAN card" },
    { key: "doc_id_proof", label: "ID proof (Aadhaar / Passport)" },
    { key: "doc_address_proof", label: "Address proof" },
    { key: "doc_bank_proof", label: "Cancelled cheque" },
];

function bankComplete(s) {
    return !!(s?.account_holder_name && s?.account_number && s?.ifsc_code && s?.bank_name && s?.bank_branch);
}
function docsComplete(s) {
    if (!s) return false;
    const allReq = REQUIRED_DOCS.every((d) => !!s[d.key]);
    const isOriginal = Array.isArray(s.seller_types) && s.seller_types.includes("Original");
    if (isOriginal && !s.doc_brand_authorization) return false;
    return allReq;
}

export default function Phase2Banner({ supplier, onUpdated }) {
    const [openBank, setOpenBank] = useState(false);
    const [openDocs, setOpenDocs] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    if (!supplier) return null;
    const bankOK = bankComplete(supplier);
    const docsOK = docsComplete(supplier);
    if ((bankOK && docsOK) || dismissed) return null;

    const missingDocs = REQUIRED_DOCS.filter((d) => !supplier[d.key]).map((d) => d.label);
    const isOriginal = Array.isArray(supplier.seller_types) && supplier.seller_types.includes("Original");
    if (isOriginal && !supplier.doc_brand_authorization) missingDocs.push("Brand authorization letter");

    return (
        <>
            <div className="bg-[#ECFBFD] border-b border-[#C2EFF5]" data-testid="phase2-banner">
                <div className="tc-container py-3.5 flex items-start gap-3">
                    <ShieldCheck size={18} className="text-[#00838f] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-[#0A4A50]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                            Complete your profile to get paid
                        </div>
                        <div className="text-[12.5px] text-[#0A4A50]/85 mt-0.5">
                            {bankOK ? null : <span><strong>Bank details</strong> are required before your first payout. </span>}
                            {missingDocs.length > 0 ? <span><strong>{missingDocs.length} document{missingDocs.length > 1 ? "s" : ""}</strong> still missing: {missingDocs.slice(0, 3).join(", ")}{missingDocs.length > 3 ? `, +${missingDocs.length - 3} more` : ""}.</span> : null}
                            <span className="block mt-0.5 text-[#0A4A50]/65 text-[11.5px]">You can keep listing products — payouts will be released once this is complete.</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {!bankOK && (
                                <button onClick={() => setOpenBank(true)} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-[#0A0A0B] text-white text-[12px] font-semibold hover:bg-[#23252B]" data-testid="phase2-bank-cta">
                                    <Building2 size={12} /> Add bank details <ChevronRight size={12} />
                                </button>
                            )}
                            {!docsOK && (
                                <button onClick={() => setOpenDocs(true)} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-white border border-[#0A0A0B] text-[#0A0A0B] text-[12px] font-semibold hover:bg-[#F4F4F6]" data-testid="phase2-docs-cta">
                                    <FileText size={12} /> Upload documents <ChevronRight size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                    <button onClick={() => setDismissed(true)} aria-label="Dismiss for this session" className="text-[#0A4A50]/60 hover:text-[#0A4A50] -mt-1" data-testid="phase2-dismiss">
                        <XIcon size={16} />
                    </button>
                </div>
            </div>

            <BankDialog open={openBank} onClose={() => setOpenBank(false)} supplier={supplier} onSaved={onUpdated} />
            <DocsDialog open={openDocs} onClose={() => setOpenDocs(false)} supplier={supplier} onSaved={onUpdated} />
        </>
    );
}

function BankDialog({ open, onClose, supplier, onSaved }) {
    const [f, setF] = useState({
        account_holder_name: supplier?.account_holder_name || "",
        account_number: supplier?.account_number || "",
        ifsc_code: supplier?.ifsc_code || "",
        bank_name: supplier?.bank_name || "",
        bank_branch: supplier?.bank_branch || "",
    });
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const valid =
        f.account_holder_name.trim() &&
        /^\d{6,18}$/.test(f.account_number.trim()) &&
        /^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc_code.trim().toUpperCase()) &&
        f.bank_name.trim() &&
        f.bank_branch.trim();
    const save = async () => {
        if (!valid) { toast.error("Please fill all bank details correctly"); return; }
        try {
            setSaving(true);
            await api.post("/auth/supplier-phase2", {
                account_holder_name: f.account_holder_name.trim(),
                account_number: f.account_number.trim(),
                ifsc_code: f.ifsc_code.trim().toUpperCase(),
                bank_name: f.bank_name.trim(),
                bank_branch: f.bank_branch.trim(),
            });
            toast.success("Bank details saved");
            onSaved && onSaved();
            onClose();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally { setSaving(false); }
    };
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[520px] p-6 rounded-[18px]" data-testid="phase2-bank-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>Bank details for payouts</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                    <div><Label>Account holder name</Label><Input value={f.account_holder_name} onChange={set("account_holder_name")} data-testid="phase2-acct-holder" /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><Label>Account number</Label><Input value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value.replace(/\D/g, "").slice(0, 18) })} inputMode="numeric" data-testid="phase2-acct-number" /></div>
                        <div><Label>IFSC</Label><Input value={f.ifsc_code} onChange={(e) => setF({ ...f, ifsc_code: e.target.value.toUpperCase().slice(0, 11) })} maxLength={11} placeholder="HDFC0001234" data-testid="phase2-ifsc" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><Label>Bank name</Label><Input value={f.bank_name} onChange={set("bank_name")} placeholder="HDFC Bank" data-testid="phase2-bank-name" /></div>
                        <div><Label>Branch</Label><Input value={f.bank_branch} onChange={set("bank_branch")} placeholder="MG Road, Bangalore" data-testid="phase2-bank-branch" /></div>
                    </div>
                    <div className="text-[11.5px] text-[#6E6E73]">The holder name must match your registered business name.</div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button type="button" disabled={!valid || saving} onClick={save} className="btn-cta" data-testid="phase2-bank-save">
                            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Check size={14} className="mr-1" />}
                            Save bank details
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function DocSlot({ label, hint, fieldKey, alreadyUploaded, onUploaded }) {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const upload = async () => {
        if (!file) return;
        try {
            setUploading(true);
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post(`/auth/supplier-document-upload?field=${fieldKey}`, fd);
            await api.post("/auth/supplier-phase2", { [fieldKey]: data.path });
            toast.success(`${label} uploaded`);
            onUploaded && onUploaded(fieldKey, data.path);
            setFile(null);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally { setUploading(false); }
    };
    const status = alreadyUploaded ? "uploaded" : (file ? "pending" : "missing");
    return (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-[#E5E5EA] bg-white" data-testid={`phase2-slot-${fieldKey}`}>
            <div className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${status === "uploaded" ? "bg-emerald-50 text-emerald-600" : status === "pending" ? "bg-amber-50 text-amber-600" : "bg-[#F4F4F6] text-[#86868B]"}`}>
                {status === "uploaded" ? <Check size={14} /> : <FileText size={14} />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#0A0A0B]">{label}{status === "uploaded" && <span className="ml-2 text-[10.5px] tracking-[0.12em] uppercase text-emerald-600">Uploaded</span>}</div>
                {hint && <div className="text-[11.5px] text-[#6E6E73] mt-0.5">{hint}</div>}
                {!alreadyUploaded && (
                    <div className="mt-2 flex items-center gap-2">
                        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[12px]" data-testid={`phase2-file-${fieldKey}`} />
                        {file && (
                            <Button type="button" onClick={upload} disabled={uploading} className="btn-cta h-8 px-3 text-[11.5px]" data-testid={`phase2-upload-${fieldKey}`}>
                                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function DocsDialog({ open, onClose, supplier, onSaved }) {
    const [local, setLocal] = useState(supplier || {});
    const isOriginal = Array.isArray(supplier?.seller_types) && supplier.seller_types.includes("Original");
    const onUploaded = (k, v) => { setLocal((prev) => ({ ...prev, [k]: v })); onSaved && onSaved(); };
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[640px] max-h-[88vh] overflow-y-auto p-6 rounded-[18px]" data-testid="phase2-docs-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>Upload KYC documents</DialogTitle>
                </DialogHeader>
                <div className="text-[12.5px] text-[#6E6E73] mt-1">All files are stored privately — only TonersCart admins can view them via short-lived signed links. PDF or image, up to 5 MB.</div>
                <div className="space-y-2 mt-4">
                    <DocSlot label="GST certificate" fieldKey="doc_gst" alreadyUploaded={!!local.doc_gst} onUploaded={onUploaded} />
                    <DocSlot label="PAN card" fieldKey="doc_pan" alreadyUploaded={!!local.doc_pan} onUploaded={onUploaded} />
                    <DocSlot label="ID proof — Aadhaar / Passport" fieldKey="doc_id_proof" alreadyUploaded={!!local.doc_id_proof} onUploaded={onUploaded} />
                    <DocSlot label="Address proof" hint="Utility bill / rent agreement" fieldKey="doc_address_proof" alreadyUploaded={!!local.doc_address_proof} onUploaded={onUploaded} />
                    <DocSlot label="Cancelled cheque" hint="Required before first payout" fieldKey="doc_bank_proof" alreadyUploaded={!!local.doc_bank_proof} onUploaded={onUploaded} />
                    <DocSlot
                        label={isOriginal ? "Brand authorization letter (required)" : "Brand authorization letter (optional)"}
                        hint={isOriginal ? "Required for Original / OEM sellers" : "Only if you sell original OEM cartridges"}
                        fieldKey="doc_brand_authorization"
                        alreadyUploaded={!!local.doc_brand_authorization}
                        onUploaded={onUploaded}
                    />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onClose} data-testid="phase2-docs-close">Done</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
