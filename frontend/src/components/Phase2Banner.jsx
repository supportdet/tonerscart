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
 *   supplier         – user.supplier object from /auth/me (includes bank fields +
 *                      doc_* paths)
 *   onUpdated        – called after a successful save so the parent can refresh()
 *   externalOpen     – when true, opens the docs dialog from outside (Wave 100,
 *                      used by DealerOnboarding step-3 CTA)
 *   onExternalClose  – external close handler for externalOpen
 *   hideBanner       – when true, the inline banner UI is suppressed and only
 *                      the dialogs are mounted (used by DealerOnboarding)
 */
// Wave 101 hotfix-3 — per user requirements:
//   Mandatory: GST, PAN, ID proof, plus bank details (account + IFSC).
//   Optional: cancelled cheque (doc_bank_proof), address proof
//   (doc_address_proof — satisfied if GST is present since GST certificate
//   doubles as address proof in India), brand authorization
//   (doc_brand_authorization — only required for Original/OEM sellers).
const MANDATORY_DOCS = [
    { key: "doc_gst", label: "GST certificate" },
    { key: "doc_pan", label: "PAN card" },
    { key: "doc_id_proof", label: "ID proof (Aadhaar / Passport)" },
];
const OPTIONAL_DOCS = [
    { key: "doc_bank_proof", label: "Cancelled cheque", hint: "Recommended before first payout — optional now" },
    { key: "doc_address_proof", label: "Address proof", hint: "Optional — GST certificate counts as address proof" },
];

function bankComplete(s) {
    // Wave 100 — match the user-spec: bank is "complete" the moment the
    // account number and IFSC are populated. Holder name / bank name /
    // branch are gentle nudges inside the dialog, not gating fields.
    return !!(s?.account_number && s?.ifsc_code);
}
function docsComplete(s) {
    if (!s) return false;
    const allReq = MANDATORY_DOCS.every((d) => !!s[d.key]);
    const isOriginal = Array.isArray(s.seller_types) && s.seller_types.includes("Original");
    if (isOriginal && !s.doc_brand_authorization) return false;
    return allReq;
}

export default function Phase2Banner({ supplier, onUpdated, externalOpen = false, onExternalClose, hideBanner = false, showSubmitForReview = false }) {
    const [openBank, setOpenBank] = useState(false);
    const [openDocs, setOpenDocs] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    // When DealerOnboarding flips externalOpen=true, surface the docs dialog
    // (which also contains the bank-details entry inline at the top).
    React.useEffect(() => {
        if (externalOpen) setOpenDocs(true);
    }, [externalOpen]);

    if (!supplier) return null;
    const bankOK = bankComplete(supplier);
    const docsOK = docsComplete(supplier);
    // Wave 101 hotfix-6 — early-exit only when in onboarding submit mode
    // (where the dialog must remain open). For the regular approved-dealer
    // banner mode we compute `hasAnyGap` below so optional missing items
    // (cancelled cheque) still surface a friendly nudge.

    // Wave 101 hotfix-6 — surface BOTH mandatory and optional missing docs
    // in the banner so approved dealers (Big C / ZION / RAVI / VERVE etc.)
    // who are missing only their cancelled cheque still see a friendly nudge.
    // Mandatory docs in red counter; optional ones listed separately as
    // "Recommended" nudges, never gating.
    const missingDocs = MANDATORY_DOCS.filter((d) => !supplier[d.key]).map((d) => d.label);
    const isOriginal = Array.isArray(supplier.seller_types) && supplier.seller_types.includes("Original");
    if (isOriginal && !supplier.doc_brand_authorization) missingDocs.push("Brand authorization letter");
    const missingOptional = OPTIONAL_DOCS.filter((d) => !supplier[d.key]).map((d) => d.label);
    // Show banner if bank missing OR any mandatory missing OR any optional missing.
    const hasAnyGap = !bankOK || missingDocs.length > 0 || missingOptional.length > 0;
    if (!hasAnyGap || dismissed) {
        if (externalOpen && onExternalClose) onExternalClose();
        if (!showSubmitForReview) return null;
    }

    return (
        <>
            {!hideBanner && (
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
            )}

            <BankDialog open={openBank} onClose={() => setOpenBank(false)} supplier={supplier} onSaved={onUpdated} />
            <DocsDialog
                open={openDocs}
                onClose={() => { setOpenDocs(false); if (onExternalClose) onExternalClose(); }}
                supplier={supplier}
                onSaved={onUpdated}
                optionalDocs={OPTIONAL_DOCS}
                showSubmitForReview={showSubmitForReview}
                onOpenBank={() => setOpenBank(true)}
            />
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

function DocSlot({ label, hint, fieldKey, alreadyUploaded, onUploaded, required = false }) {
    const [uploading, setUploading] = useState(false);
    const inputRef = React.useRef(null);
    // Wave 101 hotfix-4 — auto-upload the moment a file is selected. No
    // intermediate "Upload" button click. Spinner replaces the file input
    // while uploading; green check + "Uploaded" label appear on success.
    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error(`${label} is too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 5 MB`);
            e.target.value = "";
            return;
        }
        try {
            setUploading(true);
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post(`/auth/supplier-document-upload?field=${fieldKey}`, fd);
            await api.post("/auth/supplier-phase2", { [fieldKey]: data.path });
            toast.success(`${label} uploaded`);
            onUploaded && onUploaded(fieldKey, data.path);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };
    const status = alreadyUploaded ? "uploaded" : uploading ? "pending" : "missing";
    return (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-[#E5E5EA] bg-white" data-testid={`phase2-slot-${fieldKey}`}>
            <div className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${status === "uploaded" ? "bg-emerald-50 text-emerald-600" : status === "pending" ? "bg-amber-50 text-amber-600" : "bg-[#F4F4F6] text-[#86868B]"}`}>
                {status === "uploaded" ? <Check size={14} /> : status === "pending" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#0A0A0B]">
                    {label}
                    {required && !alreadyUploaded && <span className="ml-1 text-red-500">*</span>}
                    {status === "uploaded" && <span className="ml-2 text-[10.5px] tracking-[0.12em] uppercase text-emerald-600">Uploaded</span>}
                    {status === "pending" && <span className="ml-2 text-[10.5px] tracking-[0.12em] uppercase text-amber-600">Uploading…</span>}
                </div>
                {hint && <div className="text-[11.5px] text-[#6E6E73] mt-0.5">{hint}</div>}
                {!alreadyUploaded && (
                    <div className="mt-2">
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={handleFile}
                            disabled={uploading}
                            className="text-[12px] block w-full text-[#0A0A0B] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[11.5px] file:font-semibold file:bg-[#0A0A0B] file:text-white file:cursor-pointer hover:file:bg-[#23252B] disabled:opacity-50"
                            data-testid={`phase2-file-${fieldKey}`}
                        />
                    </div>
                )}
                {alreadyUploaded && (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="mt-1.5 text-[11px] text-[#0A0A0B]/60 hover:text-[#0A0A0B] underline"
                        data-testid={`phase2-replace-${fieldKey}`}
                    >
                        Replace
                    </button>
                )}
                {alreadyUploaded && (
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFile}
                        disabled={uploading}
                        className="hidden"
                    />
                )}
            </div>
        </div>
    );
}

function DocsDialog({ open, onClose, supplier, onSaved, showSubmitForReview = false, onOpenBank }) {
    // Wave 101 hotfix-4 — reactivity fix.
    // We keep ONLY a small "uploadedPatch" of doc-fields the user has just
    // saved in this session. The merged view `{...supplier, ...uploadedPatch}`
    // ALWAYS wins over the supplier prop, so a fresh re-fetch of /auth/me
    // can't blow away an upload that just happened (the previous useEffect
    // resetting local from supplier was the bug that broke Submit reactivity).
    const [uploadedPatch, setUploadedPatch] = useState({});
    const [submitting, setSubmitting] = useState(false);
    // Inline bank form state — only used when showSubmitForReview is true so
    // the dealer sees both bank fields and document uploads side-by-side
    // (no collapsed sections, no extra dialog hops).
    const [bank, setBank] = useState({
        account_holder_name: supplier?.account_holder_name || "",
        account_number: supplier?.account_number || "",
        ifsc_code: supplier?.ifsc_code || "",
        bank_name: supplier?.bank_name || "",
        bank_branch: supplier?.bank_branch || "",
    });
    const [bankDirty, setBankDirty] = useState(false);
    const [savingBank, setSavingBank] = useState(false);
    // Reset state when the dialog OPENS (not on every supplier refresh — that
    // would clobber the uploadedPatch and the Submit button would flicker).
    React.useEffect(() => {
        if (open) {
            setUploadedPatch({});
            setBankDirty(false);
            setBank({
                account_holder_name: supplier?.account_holder_name || "",
                account_number: supplier?.account_number || "",
                ifsc_code: supplier?.ifsc_code || "",
                bank_name: supplier?.bank_name || "",
                bank_branch: supplier?.bank_branch || "",
            });
        }
    }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps
    // Pull through supplier-side bank values when supplier prop changes AND
    // the user hasn't started editing the bank section yet.
    React.useEffect(() => {
        if (!bankDirty) {
            setBank((b) => ({
                account_holder_name: supplier?.account_holder_name || b.account_holder_name,
                account_number: supplier?.account_number || b.account_number,
                ifsc_code: supplier?.ifsc_code || b.ifsc_code,
                bank_name: supplier?.bank_name || b.bank_name,
                bank_branch: supplier?.bank_branch || b.bank_branch,
            }));
        }
    }, [supplier, bankDirty]);

    // Merged effective doc state — uploadedPatch wins over supplier prop.
    const docs = { ...supplier, ...uploadedPatch };
    const isOriginal = Array.isArray(docs.seller_types) && docs.seller_types.includes("Original");
    const onUploaded = (k, v) => {
        // Optimistic update — survives any subsequent /auth/me refresh.
        setUploadedPatch((prev) => ({ ...prev, [k]: v }));
        // Tell the parent to re-fetch so the banner/dashboard pick up the
        // change too — but we never rely on this to update OUR Submit gate.
        onSaved && onSaved();
    };

    // Wave 101 hotfix-3 — only the 3 mandatory docs (+ brand auth for OEM)
    // gate the Submit button. Cancelled cheque + address proof are optional.
    const allMandatoryDocsUploaded = MANDATORY_DOCS.every((d) => !!docs[d.key])
        && (!isOriginal || !!docs.doc_brand_authorization);
    // Bank "complete enough to submit" — account number + IFSC are the
    // hard floor (matches bankComplete()).
    const bankOK = !!(bank.account_number && /^[A-Z]{4}0[A-Z0-9]{6}$/.test((bank.ifsc_code || "").trim().toUpperCase()));
    const readyToSubmit = allMandatoryDocsUploaded && bankOK;

    // Wave 101 hotfix-4 — approved-dealer mode: only show the docs that are
    // genuinely missing for THIS specific dealer. Mandatory docs first; if
    // the dealer is Original/OEM and brand auth is missing, that's included.
    // Optional docs are only shown if the dealer asked for them (we still
    // surface cancelled cheque + address proof as nudges when missing —
    // they're explicitly marked optional in the UI).
    const missingMandatoryKeys = MANDATORY_DOCS.filter((d) => !docs[d.key]).map((d) => d.key);
    const missingBrandAuth = isOriginal && !docs.doc_brand_authorization;
    const missingOptionalKeys = OPTIONAL_DOCS.filter((d) => !docs[d.key]).map((d) => d.key);

    const saveBank = async () => {
        if (!bank.account_number || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test((bank.ifsc_code || "").trim().toUpperCase())) {
            toast.error("Account number and valid IFSC code are required");
            return;
        }
        try {
            setSavingBank(true);
            await api.post("/auth/supplier-phase2", {
                account_holder_name: bank.account_holder_name.trim() || null,
                account_number: bank.account_number.trim(),
                ifsc_code: bank.ifsc_code.trim().toUpperCase(),
                bank_name: bank.bank_name.trim() || null,
                bank_branch: bank.bank_branch.trim() || null,
            });
            toast.success("Bank details saved");
            setBankDirty(false);
            onSaved && onSaved();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally { setSavingBank(false); }
    };

    const submit = async () => {
        if (!readyToSubmit) return;
        try {
            setSubmitting(true);
            if (bankDirty) {
                await api.post("/auth/supplier-phase2", {
                    account_holder_name: bank.account_holder_name.trim() || null,
                    account_number: bank.account_number.trim(),
                    ifsc_code: bank.ifsc_code.trim().toUpperCase(),
                    bank_name: bank.bank_name.trim() || null,
                    bank_branch: bank.bank_branch.trim() || null,
                });
            }
            await api.post("/auth/submit-for-review");
            toast.success("Submitted for verification — we'll email you once approved.");
            onSaved && onSaved();
            onClose();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally { setSubmitting(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[720px] max-h-[88vh] overflow-y-auto p-6 rounded-[18px]" data-testid="phase2-docs-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        {showSubmitForReview ? "Bank details + KYC documents" : "Upload missing documents"}
                    </DialogTitle>
                </DialogHeader>

                {showSubmitForReview ? (
                    <>
                        {/* === Bank section, visible inline === */}
                        <div className="mt-3" data-testid="phase2-bank-inline">
                            <div className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B] mb-2">
                                <Building2 size={12} /> Bank account for payouts
                            </div>
                            <div className="rounded-xl border border-[#E5E5EA] bg-white p-4 space-y-3">
                                <div>
                                    <Label className="text-[12.5px]">Account holder name</Label>
                                    <Input
                                        value={bank.account_holder_name}
                                        onChange={(e) => { setBank({ ...bank, account_holder_name: e.target.value }); setBankDirty(true); }}
                                        placeholder="Match your registered business name"
                                        data-testid="phase2-acct-holder"
                                        className="mt-1"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-[12.5px]">Account number <span className="text-red-500">*</span></Label>
                                        <Input
                                            value={bank.account_number}
                                            onChange={(e) => { setBank({ ...bank, account_number: e.target.value.replace(/\D/g, "").slice(0, 18) }); setBankDirty(true); }}
                                            inputMode="numeric"
                                            placeholder="6–18 digits"
                                            data-testid="phase2-acct-number"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[12.5px]">IFSC code <span className="text-red-500">*</span></Label>
                                        <Input
                                            value={bank.ifsc_code}
                                            onChange={(e) => { setBank({ ...bank, ifsc_code: e.target.value.toUpperCase().slice(0, 11) }); setBankDirty(true); }}
                                            maxLength={11}
                                            placeholder="HDFC0001234"
                                            data-testid="phase2-ifsc"
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-[12.5px]">Bank name</Label>
                                        <Input value={bank.bank_name} onChange={(e) => { setBank({ ...bank, bank_name: e.target.value }); setBankDirty(true); }} placeholder="HDFC Bank" data-testid="phase2-bank-name" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-[12.5px]">Branch</Label>
                                        <Input value={bank.bank_branch} onChange={(e) => { setBank({ ...bank, bank_branch: e.target.value }); setBankDirty(true); }} placeholder="MG Road, Bangalore" data-testid="phase2-bank-branch" className="mt-1" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[11.5px] text-[#6E6E73]">
                                        {bankOK ? <span className="text-emerald-600 inline-flex items-center gap-1"><Check size={11} /> Bank details look good</span> : "Account number + IFSC are required to submit."}
                                    </span>
                                    {bankDirty && (
                                        <Button type="button" variant="outline" onClick={saveBank} disabled={savingBank} className="h-8 px-3 text-[11.5px]" data-testid="phase2-bank-save-inline">
                                            {savingBank ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                                            Save bank
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* === KYC documents, visible inline === */}
                        <div className="mt-5">
                            <div className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B] mb-2">
                                <FileText size={12} /> KYC documents
                            </div>
                            <div className="text-[11.5px] text-[#6E6E73] mb-2">PDF or image, up to 5 MB each. Files upload automatically the moment you pick them.</div>
                            <div className="space-y-2">
                                <DocSlot label="GST certificate" required fieldKey="doc_gst" alreadyUploaded={!!docs.doc_gst} onUploaded={onUploaded} />
                                <DocSlot label="PAN card" required fieldKey="doc_pan" alreadyUploaded={!!docs.doc_pan} onUploaded={onUploaded} />
                                <DocSlot label="ID proof — Aadhaar / Passport" required fieldKey="doc_id_proof" alreadyUploaded={!!docs.doc_id_proof} onUploaded={onUploaded} />
                                <DocSlot label="Cancelled cheque" hint="Optional — recommended before first payout" fieldKey="doc_bank_proof" alreadyUploaded={!!docs.doc_bank_proof} onUploaded={onUploaded} />
                                <DocSlot label="Address proof" hint="Optional — GST certificate counts as address proof" fieldKey="doc_address_proof" alreadyUploaded={!!docs.doc_address_proof} onUploaded={onUploaded} />
                                <DocSlot
                                    label={isOriginal ? "Brand authorization letter" : "Brand authorization letter (optional)"}
                                    required={isOriginal}
                                    hint={isOriginal ? "Required for Original / OEM sellers" : "Only if you sell original OEM cartridges"}
                                    fieldKey="doc_brand_authorization"
                                    alreadyUploaded={!!docs.doc_brand_authorization}
                                    onUploaded={onUploaded}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 pt-5 sticky bottom-0 bg-white">
                            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Close</Button>
                            <Button
                                type="button"
                                disabled={!readyToSubmit || submitting}
                                onClick={submit}
                                className="btn-cta"
                                data-testid="phase2-submit-for-review"
                                title={readyToSubmit ? "" : "Upload mandatory documents + add bank details first"}
                            >
                                {submitting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Check size={14} className="mr-1" />}
                                Submit for verification
                            </Button>
                        </div>
                        {!readyToSubmit && (
                            <div className="text-[11.5px] text-[#6E6E73] text-right" data-testid="phase2-submit-hint">
                                {!bankOK && <>Add account number + valid IFSC · </>}
                                {!allMandatoryDocsUploaded && <>Upload GST, PAN, and ID proof{isOriginal ? ", and brand authorization" : ""} </>}
                                to enable Submit.
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* === Approved-dealer mode — only show the docs THIS dealer is missing. === */}
                        {(missingMandatoryKeys.length + (missingBrandAuth ? 1 : 0) + missingOptionalKeys.length) === 0 ? (
                            <div className="py-8 text-center" data-testid="phase2-docs-all-done">
                                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-3">
                                    <Check size={22} />
                                </div>
                                <div className="text-[14.5px] font-semibold text-[#0A0A0B]">All your documents are in</div>
                                <div className="text-[12.5px] text-[#6E6E73] mt-1">Thanks — there&apos;s nothing left to upload.</div>
                            </div>
                        ) : (
                            <>
                                <div className="text-[12.5px] text-[#6E6E73] mt-1">
                                    These are the only documents you&apos;re missing — files upload automatically the moment you pick them.
                                </div>
                                <div className="space-y-2 mt-4">
                                    {MANDATORY_DOCS.filter((d) => missingMandatoryKeys.includes(d.key)).map((d) => (
                                        <DocSlot
                                            key={d.key}
                                            label={d.label}
                                            required
                                            fieldKey={d.key}
                                            alreadyUploaded={!!docs[d.key]}
                                            onUploaded={onUploaded}
                                        />
                                    ))}
                                    {missingBrandAuth && (
                                        <DocSlot
                                            label="Brand authorization letter"
                                            required
                                            hint="Required for Original / OEM sellers"
                                            fieldKey="doc_brand_authorization"
                                            alreadyUploaded={!!docs.doc_brand_authorization}
                                            onUploaded={onUploaded}
                                        />
                                    )}
                                    {OPTIONAL_DOCS.filter((d) => missingOptionalKeys.includes(d.key)).map((d) => (
                                        <DocSlot
                                            key={d.key}
                                            label={d.label}
                                            hint={d.hint}
                                            fieldKey={d.key}
                                            alreadyUploaded={!!docs[d.key]}
                                            onUploaded={onUploaded}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={onClose} data-testid="phase2-docs-close">Done</Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

