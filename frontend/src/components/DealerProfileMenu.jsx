import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
    UserCircle2, ChevronDown, FileText, ShieldAlert, MessageSquare, LogOut,
    User as UserIcon, X as XIcon, Send, Loader2, Check, AlertTriangle, FileCheck2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import Phase2Banner from "./Phase2Banner";

// Wave 102 — approved-dealer profile dropdown in the supplier dashboard hero.
// Menu items: My Details · Submitted Documents · Missing Documents · Raise a Query · Logout
const DOC_LABELS = {
    doc_gst: "GST certificate",
    doc_pan: "PAN card",
    doc_id_proof: "ID proof (Aadhaar / Passport)",
    doc_address_proof: "Address proof",
    doc_bank_proof: "Cancelled cheque",
    doc_brand_authorization: "Brand authorization letter",
    doc_shop_photo: "Shop photo",
};

const MANDATORY = ["doc_gst", "doc_pan", "doc_id_proof"];
const OPTIONAL = ["doc_bank_proof", "doc_address_proof"];

export default function DealerProfileMenu({ supplier, onRefresh }) {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [submittedOpen, setSubmittedOpen] = useState(false);
    const [missingOpen, setMissingOpen] = useState(false);
    const [queryOpen, setQueryOpen] = useState(false);
    const menuRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const onClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    const doLogout = async () => {
        try {
            await logout();
            toast.success("Signed out");
            navigate("/login");
        } catch (e) { toast.error(formatApiError(e)); }
    };

    if (!supplier) return null;

    return (
        <>
            <div className="relative" ref={menuRef} data-testid="dealer-profile-menu">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[12.5px] font-semibold transition"
                    data-testid="dealer-profile-trigger"
                    aria-haspopup="menu"
                    aria-expanded={open}
                >
                    <UserCircle2 size={15} />
                    <span className="hidden sm:inline max-w-[140px] truncate">{supplier.business_name || "Profile"}</span>
                    <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                    <div
                        role="menu"
                        className="absolute right-0 mt-2 w-60 bg-white text-[#0A0A0B] rounded-xl shadow-xl border border-black/[0.06] py-1.5 z-[200]"
                        data-testid="dealer-profile-dropdown"
                    >
                        <MenuItem icon={UserIcon} label="My Details" onClick={() => { setOpen(false); setDetailsOpen(true); }} testId="profile-menu-details" />
                        <MenuItem icon={FileCheck2} label="Submitted Documents" onClick={() => { setOpen(false); setSubmittedOpen(true); }} testId="profile-menu-submitted-docs" />
                        <MenuItem icon={ShieldAlert} label="Missing Documents" onClick={() => { setOpen(false); setMissingOpen(true); }} testId="profile-menu-missing-docs" />
                        <MenuItem icon={MessageSquare} label="Raise a Query" onClick={() => { setOpen(false); setQueryOpen(true); }} testId="profile-menu-query" />
                        <div className="my-1 border-t border-black/[0.06]" />
                        <MenuItem icon={LogOut} label="Logout" onClick={() => { setOpen(false); doLogout(); }} testId="profile-menu-logout" danger />
                    </div>
                )}
            </div>

            <MyDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} supplier={supplier} />
            <SubmittedDocsDialog open={submittedOpen} onClose={() => setSubmittedOpen(false)} supplier={supplier} />
            <MissingDocsDialog open={missingOpen} onClose={() => setMissingOpen(false)} supplier={supplier} onRefresh={onRefresh} />
            <RaiseQueryDialog open={queryOpen} onClose={() => setQueryOpen(false)} />
        </>
    );
}

function MenuItem({ icon: Icon, label, onClick, testId, danger = false }) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-[#F4F4F6] ${danger ? "text-red-600" : "text-[#0A0A0B]"}`}
            data-testid={testId}
        >
            <Icon size={14} className={danger ? "text-red-500" : "text-[#6E6E73]"} />
            <span className="font-medium">{label}</span>
        </button>
    );
}

function MyDetailsDialog({ open, onClose, supplier }) {
    const rows = [
        ["Business name", supplier.business_name],
        ["Seller ID", supplier.seller_id],
        ["Contact person", supplier.contact_person],
        ["Email", supplier.email],
        ["Phone", supplier.phone],
        ["City", supplier.city],
        ["State", supplier.state],
        ["Pincode", supplier.pincode],
        ["GST number", supplier.gst_number],
        ["PAN number", supplier.pan_number],
        ["Business address", supplier.business_address],
        ["Bank account holder", supplier.account_holder_name],
        ["Bank account no.", supplier.account_number ? `••••${String(supplier.account_number).slice(-4)}` : ""],
        ["IFSC", supplier.ifsc_code],
        ["Bank name", supplier.bank_name],
        ["Bank branch", supplier.bank_branch],
    ].filter(([, v]) => !!v);
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto p-6 rounded-[18px]" data-testid="profile-details-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-[19px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        <UserIcon size={17} /> My Details
                    </DialogTitle>
                </DialogHeader>
                <div className="mt-2 divide-y divide-black/[0.05]">
                    {rows.length === 0 ? (
                        <div className="py-6 text-center text-[#86868B] text-[13px]">No details on file yet.</div>
                    ) : rows.map(([k, v]) => (
                        <div key={k} className="flex items-start gap-3 py-2 text-[13px]" data-testid={`profile-detail-${k.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                            <div className="w-[160px] text-[#6E6E73] shrink-0 text-[12px]">{k}</div>
                            <div className="flex-1 font-medium text-[#0A0A0B] break-words">{v}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 text-[11.5px] text-[#86868B]">
                    To update any of these details, please raise a query — our team will help you.
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SubmittedDocsDialog({ open, onClose, supplier }) {
    const submitted = [...MANDATORY, ...OPTIONAL, "doc_brand_authorization", "doc_shop_photo"]
        .filter((k) => !!supplier[k])
        .map((k) => ({ key: k, label: DOC_LABELS[k] || k }));
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[520px] p-6 rounded-[18px]" data-testid="profile-submitted-docs-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-[19px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        <FileCheck2 size={17} /> Submitted Documents
                    </DialogTitle>
                </DialogHeader>
                {submitted.length === 0 ? (
                    <div className="py-6 text-center text-[#86868B] text-[13px]">No documents uploaded yet.</div>
                ) : (
                    <ul className="mt-2 space-y-1.5">
                        {submitted.map((d) => (
                            <li key={d.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50/50 border border-emerald-100 text-[13px]" data-testid={`submitted-doc-${d.key}`}>
                                <Check size={14} className="text-emerald-600" />
                                <span className="font-medium text-[#0A0A0B]">{d.label}</span>
                                <span className="ml-auto text-[10.5px] uppercase tracking-[0.12em] text-emerald-700">Uploaded</span>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}

function MissingDocsDialog({ open, onClose, supplier, onRefresh }) {
    // Reuse the Phase2Banner DocsDialog in approved-dealer mode by mounting
    // Phase2Banner with externalOpen + hideBanner. That dialog already lists
    // ONLY missing docs and handles auto-upload on file select.
    return (
        <>
            {open && (
                <Phase2Banner
                    supplier={supplier}
                    onUpdated={onRefresh}
                    externalOpen={true}
                    onExternalClose={onClose}
                    hideBanner={true}
                />
            )}
        </>
    );
}

function RaiseQueryDialog({ open, onClose }) {
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!open) { setSubject(""); setMessage(""); }
    }, [open]);

    const submit = async () => {
        if (!subject.trim() || !message.trim()) {
            toast.error("Subject and message are required");
            return;
        }
        try {
            setSending(true);
            const { data } = await api.post("/supplier/raise-query", { subject: subject.trim(), message: message.trim() });
            if (data?.sent) {
                toast.success("Your query has been sent to TonersCart support. We'll reply by email soon.");
            } else {
                toast.success("Your query has been recorded. We'll get back to you by email.");
            }
            onClose();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSending(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[560px] p-6 rounded-[18px]" data-testid="raise-query-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-[19px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        <MessageSquare size={17} /> Raise a Query
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                    <div>
                        <Label className="text-[12.5px]">Subject</Label>
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="e.g. Need help with payouts"
                            maxLength={200}
                            className="mt-1"
                            data-testid="query-subject-input"
                        />
                    </div>
                    <div>
                        <Label className="text-[12.5px]">Your message</Label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Share what you need help with — we'll respond by email."
                            rows={6}
                            maxLength={5000}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#00838f]/30 resize-y"
                            data-testid="query-message-input"
                        />
                        <div className="text-[10.5px] text-[#86868B] mt-1 text-right">{message.length}/5000</div>
                    </div>
                    <div className="text-[11.5px] text-[#86868B] bg-[#F8F9FB] rounded-md p-2.5">
                        <AlertTriangle size={11} className="inline mr-1 text-amber-600" />
                        Replies will come from <strong>support@tonerscart.com</strong>. We typically respond within 1 business day.
                    </div>
                </div>
                <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={onClose} disabled={sending} data-testid="query-cancel-btn">
                        <XIcon size={13} className="mr-1" /> Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={submit}
                        disabled={sending || !subject.trim() || !message.trim()}
                        className="btn-cta"
                        data-testid="query-send-btn"
                    >
                        {sending ? <><Loader2 size={13} className="animate-spin mr-1.5" /> Sending…</> : <><Send size={13} className="mr-1.5" /> Send query</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
