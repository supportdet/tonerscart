import React, { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { ShieldCheck } from "lucide-react";

// Wave 14 — One-time supplier agreement before first listing attempt.
// Acceptance persists per-browser via localStorage so it appears only once.

const STORAGE_KEY = "tc.supplier_agreement.v1";

export function hasAcceptedSupplierAgreement() {
    try { return localStorage.getItem(STORAGE_KEY) === "accepted"; }
    catch { return false; }
}

export default function SupplierAgreementDialog({ open, onAccept, onClose }) {
    const [checked, setChecked] = useState(false);

    const accept = () => {
        if (!checked) return;
        try { localStorage.setItem(STORAGE_KEY, "accepted"); } catch { /* ignore */ }
        onAccept?.();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
            <DialogContent className="max-w-[520px]" data-testid="supplier-agreement-dialog">
                <DialogHeader>
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#00B7C71A] text-[#00B7C7]">
                            <ShieldCheck size={18} />
                        </div>
                        <DialogTitle className="text-[#0A0A0B] text-[17px] font-semibold tracking-tight">Supplier terms</DialogTitle>
                    </div>
                </DialogHeader>

                <div className="text-[13px] text-[#3a3a40] leading-[1.65] py-2">
                    By listing on TonersCart you agree to:
                    <ul className="mt-2.5 space-y-1.5 list-disc list-inside marker:text-[#86868B]">
                        <li><strong className="text-[#0A0A0B]">Accurate stock and pricing</strong> on every listing</li>
                        <li><strong className="text-[#0A0A0B]">Timely dispatch within 2 business days</strong> of order confirmation</li>
                        <li><strong className="text-[#0A0A0B]">GST-compliant invoicing</strong> to buyers under your own GSTIN</li>
                        <li><strong className="text-[#0A0A0B]">TonersCart commission terms</strong> as published in your dealer portal</li>
                    </ul>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F5F5F7] border border-[#E8E8EC] cursor-pointer hover:bg-[#EEEEF1] transition" data-testid="supplier-agreement-label">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#0A0A0B] flex-shrink-0"
                        data-testid="supplier-agreement-checkbox"
                    />
                    <span className="text-[12.5px] text-[#0A0A0B] font-semibold">I agree</span>
                </label>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" size="sm" onClick={onClose} data-testid="supplier-agreement-cancel">Cancel</Button>
                    <Button className="btn-cta" size="sm" onClick={accept} disabled={!checked} data-testid="supplier-agreement-accept">
                        Start listing
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
