import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Building2, Mail, Phone, Package, Loader2, BadgeCheck } from "lucide-react";

function DetailRow({ label, icon: Icon, value }) {
    if (!value) return null;
    return (
        <div className="flex gap-2 text-[12.5px]">
            <span className="text-[#86868B] w-28 shrink-0 flex items-center gap-1">{Icon && <Icon size={11} />} {label}</span>
            <span className="text-[#0A0A0B] break-words">{value}</span>
        </div>
    );
}

export default function OemTab() {
    const [pending, setPending] = useState([]);
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const [pend, all] = await Promise.all([
                api.get("/admin/oem/pending"),
                api.get("/admin/oem/partners"),
            ]);
            setPending(pend.data.partners || []);
            setPartners(all.data || []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const approve = async (id) => {
        setBusy(true);
        try {
            await api.post(`/admin/oem/${id}/approve`);
            toast.success("OEM approved — credentials emailed");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(false); }
    };

    const reject = async () => {
        if (!rejecting) return;
        setBusy(true);
        try {
            await api.post(`/admin/oem/${rejecting.id}/reject`, { reason: reason || "Not approved" });
            toast.success("OEM rejected — email sent");
            setRejecting(null); setReason("");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(false); }
    };

    if (loading) {
        return <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
    }

    const approved = partners.filter((p) => p.status === "approved");
    const rejected = partners.filter((p) => p.status === "rejected");

    return (
        <div data-testid="admin-oem-tab">
            <div className="mb-5">
                <h2 className="text-[18px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>OEM Marketplace partners</h2>
                <p className="text-[13px] text-[#6E6E73] mt-0.5">Approve manufacturers to showcase official-brand products. Approval creates their login and emails credentials.</p>
            </div>

            {/* Pending */}
            <div className="mb-8" data-testid="oem-queue-pending">
                <div className="flex items-center gap-2 mb-3">
                    <Building2 size={16} className="text-[#6d4c41]" />
                    <h3 className="text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Pending applications</h3>
                    <span className="text-[12px] text-[#86868B]">({pending.length})</span>
                </div>
                {pending.length === 0 ? (
                    <div className="tc-card-flat p-6 text-center text-[13px] text-[#6E6E73]">No pending OEM applications.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {pending.map((p) => (
                            <div key={p.id} className="tc-card-flat p-5" data-testid={`oem-pending-${p.id}`}>
                                <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-amber-600 mb-1">Pending approval</div>
                                <div className="text-[16px] font-semibold text-[#0A0A0B] mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.brand} <span className="text-[#86868B] text-[13px] font-normal">· {p.company}</span></div>
                                <div className="space-y-1.5">
                                    <DetailRow label="Contact" value={p.contact_name} />
                                    <DetailRow label="Email" icon={Mail} value={p.email} />
                                    <DetailRow label="Phone" icon={Phone} value={p.phone} />
                                    <DetailRow label="Products" icon={Package} value={p.products_note} />
                                </div>
                                <div className="flex items-center gap-2 mt-4">
                                    <Button onClick={() => approve(p.id)} disabled={busy} className="btn-cta inline-flex items-center gap-1.5" data-testid={`oem-approve-${p.id}`}><CheckCircle2 size={14} /> Approve</Button>
                                    <Button onClick={() => setRejecting(p)} disabled={busy} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" data-testid={`oem-reject-${p.id}`}>Reject</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Approved */}
            {approved.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <BadgeCheck size={16} className="text-emerald-600" />
                        <h3 className="text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Approved partners</h3>
                        <span className="text-[12px] text-[#86868B]">({approved.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {approved.map((p) => (
                            <div key={p.id} className="tc-card-flat p-4" data-testid={`oem-approved-${p.id}`}>
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 mb-1"><BadgeCheck size={12} /> Official Brand</div>
                                <div className="text-[15px] font-semibold text-[#0A0A0B]">{p.brand}</div>
                                <div className="text-[12px] text-[#86868B]">{p.email}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {rejected.length > 0 && (
                <div className="text-[12px] text-[#86868B]">{rejected.length} rejected application(s).</div>
            )}

            <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) { setRejecting(null); setReason(""); } }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Reject {rejecting?.brand}?</DialogTitle></DialogHeader>
                    <p className="text-[13px] text-[#6E6E73]">The applicant will receive an email with this reason.</p>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. could not verify brand authorisation)" rows={3} data-testid="oem-reject-reason" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
                        <Button onClick={reject} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white" data-testid="oem-reject-confirm">Reject & notify</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
