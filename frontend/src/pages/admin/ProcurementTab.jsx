import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Landmark, Building2, Mail, Phone, MapPin, Loader2 } from "lucide-react";

function DetailRow({ label, value }) {
    if (!value) return null;
    return (
        <div className="flex gap-2 text-[12.5px]">
            <span className="text-[#86868B] w-32 shrink-0">{label}</span>
            <span className="text-[#0A0A0B] break-words">{value}</span>
        </div>
    );
}

function ApplicantCard({ p, onApprove, onReject, busy }) {
    const isGovt = p.type === "govt";
    return (
        <div className="tc-card-flat p-5" data-testid={`proc-pending-${p.id}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-amber-600 flex items-center gap-1.5">
                        {isGovt ? <Landmark size={12} /> : <Building2 size={12} />} {isGovt ? "Government" : "Corporate"} · Pending
                    </div>
                    <div className="text-[16px] font-semibold text-[#0A0A0B] mt-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.org_name}</div>
                </div>
            </div>
            <div className="space-y-1.5">
                <DetailRow label="Contact" value={`${p.name}${p.designation ? ` · ${p.designation}` : ""}`} />
                {isGovt && <DetailRow label="Ministry / State" value={p.ministry_state} />}
                {isGovt && <DetailRow label="Employee ID" value={p.employee_id} />}
                {!isGovt && <DetailRow label="GST" value={p.gst_number} />}
                <div className="flex gap-2 text-[12.5px]"><span className="text-[#86868B] w-32 shrink-0 flex items-center gap-1"><Mail size={11} /> Email</span><span className="text-[#0A0A0B] break-all">{p.email}</span></div>
                <div className="flex gap-2 text-[12.5px]"><span className="text-[#86868B] w-32 shrink-0 flex items-center gap-1"><Phone size={11} /> Phone</span><span className="text-[#0A0A0B]">{p.phone || "—"}</span></div>
                <div className="flex gap-2 text-[12.5px]"><span className="text-[#86868B] w-32 shrink-0 flex items-center gap-1"><MapPin size={11} /> Address</span><span className="text-[#0A0A0B]">{p.address || "—"}</span></div>
            </div>
            <div className="flex items-center gap-2 mt-4">
                <Button onClick={() => onApprove(p.id)} disabled={busy} className="btn-cta inline-flex items-center gap-1.5" data-testid={`proc-approve-${p.id}`}>
                    <CheckCircle2 size={14} /> Approve
                </Button>
                <Button onClick={() => onReject(p)} disabled={busy} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" data-testid={`proc-reject-${p.id}`}>Reject</Button>
            </div>
        </div>
    );
}

export default function ProcurementTab() {
    const [data, setData] = useState({ govt: [], corporate: [] });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const { data: d } = await api.get("/admin/procurement/pending");
            setData({ govt: d.govt || [], corporate: d.corporate || [] });
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const approve = async (id) => {
        setBusy(true);
        try {
            await api.post(`/admin/procurement/${id}/approve`);
            toast.success("Account approved — welcome email sent");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(false); }
    };

    const reject = async () => {
        if (!rejecting) return;
        setBusy(true);
        try {
            await api.post(`/admin/procurement/${rejecting.id}/reject`, { reason: reason || "Not approved" });
            toast.success("Account rejected — email sent");
            setRejecting(null); setReason("");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(false); }
    };

    if (loading) {
        return <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
    }

    const Section = ({ title, icon: Icon, rows }) => (
        <div className="mb-8" data-testid={`proc-queue-${title.toLowerCase()}`}>
            <div className="flex items-center gap-2 mb-3">
                <Icon size={16} className="text-[#0B1220]" />
                <h3 className="text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{title} approvals</h3>
                <span className="text-[12px] text-[#86868B]">({rows.length})</span>
            </div>
            {rows.length === 0 ? (
                <div className="tc-card-flat p-6 text-center text-[13px] text-[#6E6E73]">No pending {title.toLowerCase()} accounts.</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {rows.map((p) => <ApplicantCard key={p.id} p={p} onApprove={approve} onReject={setRejecting} busy={busy} />)}
                </div>
            )}
        </div>
    );

    return (
        <div data-testid="admin-procurement-tab">
            <div className="mb-5">
                <h2 className="text-[18px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Procurement approvals</h2>
                <p className="text-[13px] text-[#6E6E73] mt-0.5">Government and corporate accounts are reviewed separately from dealer applications.</p>
            </div>

            <Section title="Government" icon={Landmark} rows={data.govt} />
            <Section title="Corporate" icon={Building2} rows={data.corporate} />

            <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) { setRejecting(null); setReason(""); } }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Reject {rejecting?.org_name}?</DialogTitle></DialogHeader>
                    <p className="text-[13px] text-[#6E6E73]">The applicant will receive an email with this reason.</p>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (e.g. could not verify department / GST)" rows={3} data-testid="proc-reject-reason" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
                        <Button onClick={reject} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white" data-testid="proc-reject-confirm">Reject & notify</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
