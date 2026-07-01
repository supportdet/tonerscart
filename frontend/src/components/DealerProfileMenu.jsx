import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
    UserCircle2, ChevronDown, FileText, ShieldAlert, MessageSquare, LogOut,
    User as UserIcon, X as XIcon, Send, Loader2, Check, AlertTriangle, FileCheck2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
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
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    // Wave 102 HOTFIX-2 — dropdown must escape the SupplierDashboard hero's
    // `overflow: hidden` (which was silently clipping the menu, making it
    // look like an empty rectangle sliding behind the Phase2 banner). Render
    // it via createPortal into <body> and position it as fixed relative to
    // the trigger's viewport rect.
    const [coords, setCoords] = useState({ top: 0, right: 0 });

    const updateCoords = () => {
        if (!triggerRef.current) return;
        const r = triggerRef.current.getBoundingClientRect();
        setCoords({
            top: r.bottom + 8,               // 8px = mt-2
            right: Math.max(8, window.innerWidth - r.right),
        });
    };

    useLayoutEffect(() => {
        if (!open) return;
        updateCoords();
        window.addEventListener("resize", updateCoords);
        window.addEventListener("scroll", updateCoords, true);
        return () => {
            window.removeEventListener("resize", updateCoords);
            window.removeEventListener("scroll", updateCoords, true);
        };
    }, [open]);

    // Close on click outside (allow clicks inside trigger OR portal menu)
    useEffect(() => {
        if (!open) return;
        const onClick = (e) => {
            const t = e.target;
            if (triggerRef.current && triggerRef.current.contains(t)) return;
            if (menuRef.current && menuRef.current.contains(t)) return;
            setOpen(false);
        };
        const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onEsc);
        };
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
            <div className="relative inline-block" data-testid="dealer-profile-menu">
                <button
                    ref={triggerRef}
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
            </div>

            {open && typeof document !== "undefined" && createPortal(
                <div
                    ref={menuRef}
                    role="menu"
                    className="fixed w-60 bg-white text-[#0A0A0B] rounded-xl shadow-xl border border-black/[0.06] py-1.5 z-[10000]"
                    style={{ top: coords.top, right: coords.right }}
                    data-testid="dealer-profile-dropdown"
                >
                    <MenuItem icon={UserIcon} label="My Details" onClick={() => { setOpen(false); setDetailsOpen(true); }} testId="profile-menu-details" />
                    <MenuItem icon={FileCheck2} label="Submitted Documents" onClick={() => { setOpen(false); setSubmittedOpen(true); }} testId="profile-menu-submitted-docs" />
                    <MenuItem icon={ShieldAlert} label="Missing Documents" onClick={() => { setOpen(false); setMissingOpen(true); }} testId="profile-menu-missing-docs" />
                    <MenuItem icon={MessageSquare} label="Raise a Query" onClick={() => { setOpen(false); setQueryOpen(true); }} testId="profile-menu-query" />
                    <div className="my-1 border-t border-black/[0.06]" />
                    <MenuItem icon={LogOut} label="Logout" onClick={() => { setOpen(false); doLogout(); }} testId="profile-menu-logout" danger />
                </div>,
                document.body
            )}

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
    // Wave 102 v2 — show ALL canonical fields with em-dash placeholders so
    // the dealer can see at a glance what's still blank, not just an empty
    // dialog. Group by section for legibility.
    const sections = [
        {
            title: "Business",
            rows: [
                ["Business name", supplier.business_name],
                ["Seller ID", supplier.seller_id],
                ["Contact person", supplier.contact_person],
                ["Email", supplier.email],
                ["Phone", supplier.phone],
            ],
        },
        {
            title: "Address",
            rows: [
                ["Address", supplier.business_address],
                ["City", supplier.city],
                ["State", supplier.state],
                ["Pincode", supplier.pincode],
            ],
        },
        {
            title: "Tax",
            rows: [
                ["GST number", supplier.gst_number],
                ["PAN number", supplier.pan_number],
            ],
        },
        {
            title: "Bank (for payouts)",
            rows: [
                ["Account holder", supplier.account_holder_name],
                ["Account number", supplier.account_number ? `••••${String(supplier.account_number).slice(-4)}` : null],
                ["IFSC", supplier.ifsc_code],
                ["Bank", supplier.bank_name],
                ["Branch", supplier.bank_branch],
            ],
        },
    ];
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[620px] max-h-[80vh] overflow-y-auto p-6 rounded-[18px]" data-testid="profile-details-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-[19px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        <UserIcon size={17} /> My Details
                    </DialogTitle>
                    <DialogDescription className="text-[12px] text-[#6E6E73]">
                        Everything we have on file for your business. Missing fields show — em-dash. Raise a query to update any of these.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-5">
                    {sections.map((s) => (
                        <section key={s.title} data-testid={`profile-section-${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                            <div className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-[#6E6E73] mb-1.5">{s.title}</div>
                            <div className="divide-y divide-black/[0.05] border border-black/[0.06] rounded-lg">
                                {s.rows.map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-3 py-2 px-3 text-[13px]" data-testid={`profile-detail-${k.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                                        <div className="w-[150px] text-[#6E6E73] shrink-0 text-[12px]">{k}</div>
                                        <div className={`flex-1 font-medium break-words ${v ? "text-[#0A0A0B]" : "text-[#86868B]"}`}>
                                            {v || "—"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
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
                    <DialogDescription className="text-[12px] text-[#6E6E73]">
                        KYC documents you&apos;ve already uploaded. To upload anything still missing, use the Missing Documents tab.
                    </DialogDescription>
                </DialogHeader>
                {submitted.length === 0 ? (
                    <div className="py-6 text-center text-[#86868B] text-[13px]" data-testid="submitted-docs-empty">No documents uploaded yet.</div>
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
    // Wave 102 — figure out missing docs the SAME way Phase2Banner does so
    // we can short-circuit when there's nothing missing (Big C etc.) and
    // present a friendly "all submitted" state instead of mounting an empty
    // Phase2Banner dialog.
    const cheque = supplier?.cheque_uploaded !== false && (!!supplier?.doc_bank_proof || supplier?.cheque_uploaded === true);
    const missing = [
        ...MANDATORY.filter((k) => !supplier?.[k]),
        ...OPTIONAL.filter((k) => k === "doc_bank_proof" ? !cheque : !supplier?.[k]),
    ];
    if (!open) return null;
    if (missing.length === 0) {
        return (
            <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
                <DialogContent className="max-w-[480px] p-6 rounded-[18px]" data-testid="profile-missing-docs-dialog">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[19px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                            <ShieldAlert size={17} /> Missing Documents
                        </DialogTitle>
                        <DialogDescription className="text-[12px] text-[#6E6E73]">
                            Track any KYC documents still required. Auto-uploads on file select.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 text-center text-[#0A4A50]" data-testid="missing-docs-empty">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3">
                            <Check size={22} className="text-emerald-600" />
                        </div>
                        <div className="text-[14px] font-semibold">All documents submitted</div>
                        <div className="text-[12px] text-[#6E6E73] mt-1">You&apos;re all caught up. We&apos;ll let you know if anything new is needed.</div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }
    // Otherwise, mount Phase2Banner in hidden mode so its docs dialog opens.
    return (
        <Phase2Banner
            supplier={supplier}
            onUpdated={onRefresh}
            externalOpen={true}
            onExternalClose={onClose}
            hideBanner={true}
        />
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
                    <DialogDescription className="text-[12px] text-[#6E6E73]">
                        Reach the TonersCart team directly — replies come to your registered email.
                    </DialogDescription>
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
