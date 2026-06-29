import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Wallet, AlertCircle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "—");

const ADJ_TYPES = [
    { value: "payment", label: "Payment received" },
    { value: "waiver", label: "Waiver" },
    { value: "writeoff", label: "Write-off" },
];

/**
 * Wave 101 Phase 3 — Admin credit-adjustment dialog.
 *
 * Used from the Procurement Orders table: lets an admin record a payment /
 * waiver / write-off against a specific buyer + optionally tie it to a
 * specific order's debit. Refreshes the parent table on success so the
 * payment_status pill flips to "Paid" instantly.
 *
 * Props:
 *   open        — bool
 *   onClose     — callback
 *   buyerId     — procurement_users.id (required)
 *   order       — optional. When passed, the dialog defaults the amount to
 *                 the order's outstanding balance and ties the adjustment to
 *                 the order via order_id, so a full payment marks it Paid.
 *   onSaved     — callback fired after a successful adjustment
 */
export default function CreditAdjustDialog({ open, onClose, buyerId, order, onSaved }) {
    const [type, setType] = useState("payment");
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [panel, setPanel] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !buyerId) return;
        setLoading(true);
        setType("payment");
        setNote("");
        setAmount(order ? String(order.total_amount || "") : "");
        api.get(`/admin/procurement/${buyerId}/credit`)
            .then(({ data }) => setPanel(data))
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    }, [open, buyerId, order]);

    const save = async () => {
        const amt = Number(amount);
        if (!amt || amt <= 0) { toast.error("Enter a positive amount"); return; }
        if (!type) { toast.error("Pick an adjustment type"); return; }
        setSaving(true);
        try {
            const body = { type, amount: amt, note: note.trim() || null };
            if (order?.id) body.order_id = order.id;
            const { data } = await api.post(`/admin/procurement/${buyerId}/credit/adjust`, body);
            toast.success(data.order_marked_paid
                ? "Adjustment saved · order marked Paid"
                : "Adjustment saved");
            onSaved && onSaved(data);
            onClose();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-[640px] p-6 rounded-[18px]" data-testid="credit-adjust-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                        Adjust credit
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="py-8 text-center text-[#6E6E73] flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin" /> Loading buyer credit…
                    </div>
                ) : (
                    <>
                        {panel && (
                            <div className="rounded-xl border border-black/[0.06] bg-[#F8F9FB] p-4" data-testid="credit-adjust-buyer-summary">
                                <div className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">
                                    <Wallet size={12} /> {panel.user?.org_name || "Buyer"} · {panel.user?.type === "govt" ? "Government" : "Corporate"}
                                </div>
                                <div className="grid grid-cols-3 gap-3 mt-2 text-[12.5px]">
                                    <div>
                                        <div className="text-[10.5px] uppercase text-[#86868B]">Limit</div>
                                        <div className="font-semibold text-[#0A0A0B] mt-0.5">{inr(panel.user?.credit_limit)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10.5px] uppercase text-[#86868B]">Used</div>
                                        <div className="font-semibold text-amber-600 mt-0.5">{inr(panel.user?.credit_used)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10.5px] uppercase text-[#86868B]">Available</div>
                                        <div className="font-semibold text-emerald-600 mt-0.5">
                                            {inr(Math.max(0, Number(panel.user?.credit_limit || 0) - Number(panel.user?.credit_used || 0)))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {order && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] flex items-start gap-2" data-testid="credit-adjust-order-banner">
                                <AlertCircle size={14} className="text-amber-700 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-amber-900 font-semibold">
                                        Applying to order {order.ref_number}
                                    </div>
                                    <div className="text-amber-800 mt-0.5">
                                        Order total {inr(order.total_amount)}. A full-amount payment will mark the order Paid automatically.
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 mt-4">
                            <div>
                                <Label className="text-[12.5px]">Type</Label>
                                <div className="grid grid-cols-3 gap-2 mt-1.5">
                                    {ADJ_TYPES.map((t) => (
                                        <button
                                            key={t.value}
                                            type="button"
                                            onClick={() => setType(t.value)}
                                            className={`text-[12.5px] h-10 rounded-lg border transition ${type === t.value ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white border-[#E5E5EA] text-[#0A0A0B] hover:border-[#0A0A0B]"}`}
                                            data-testid={`credit-adjust-type-${t.value}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-[12.5px]">Amount (₹)</Label>
                                    <Input
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        className="mt-1"
                                        data-testid="credit-adjust-amount"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-[12.5px]">Note (optional)</Label>
                                <Textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={2}
                                    placeholder="UTR / cheque number / context"
                                    className="mt-1 text-[12.5px]"
                                    data-testid="credit-adjust-note"
                                />
                            </div>
                        </div>

                        {panel?.ledger?.length > 0 && (
                            <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-black/[0.06]">
                                <table className="w-full text-[11.5px]">
                                    <thead className="bg-[#F4F4F6] text-[10px] uppercase tracking-[0.14em] text-[#86868B]">
                                        <tr>
                                            <th className="text-left px-2 py-1.5">Date</th>
                                            <th className="text-left px-2 py-1.5">Note</th>
                                            <th className="text-right px-2 py-1.5">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {panel.ledger.slice(0, 8).map((row) => (
                                            <tr key={row.id} className="border-t border-black/[0.04]">
                                                <td className="px-2 py-1.5 whitespace-nowrap text-[#0A0A0B]">{fmtDate(row.created_at)}</td>
                                                <td className="px-2 py-1.5 text-[#3a3a40] flex items-center gap-1">
                                                    {row.type === "credit"
                                                        ? <ArrowUpRight size={11} className="text-emerald-600 shrink-0" />
                                                        : <ArrowDownRight size={11} className="text-amber-600 shrink-0" />}
                                                    <span className="truncate">{row.note || (row.type === "credit" ? "Credit" : "Debit")}</span>
                                                </td>
                                                <td className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap ${row.type === "credit" ? "text-emerald-600" : "text-amber-700"}`}>
                                                    {row.type === "credit" ? "−" : "+"}{inr(row.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button onClick={save} disabled={saving || loading} className="btn-cta" data-testid="credit-adjust-save">
                        {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                        Save adjustment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
