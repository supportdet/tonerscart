import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Landmark, Building2, Mail, Phone, MapPin, Loader2, Package, ExternalLink, ArrowRight } from "lucide-react";

const ORDER_STATUSES = ["confirmed", "processing", "shipped", "delivered"];
const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? String(s).slice(0, 10) : "—");

function OrdersSection() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/procurement/orders");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const advance = async (o) => {
        const idx = ORDER_STATUSES.indexOf(o.status);
        const next = ORDER_STATUSES[idx + 1];
        if (!next) return;
        setBusyId(o.id);
        try {
            await api.post(`/admin/procurement/orders/${o.id}/status`, { status: next });
            toast.success(`${o.ref_number} → ${next}`);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusyId(null); }
    };

    const viewPo = async (o) => {
        try {
            const { data } = await api.get(`/admin/procurement/orders/${o.id}/po-url`);
            window.open(data.url, "_blank", "noopener");
        } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div className="mb-8" data-testid="proc-admin-orders">
            <div className="flex items-center gap-2 mb-3">
                <Package size={16} className="text-[#0B1220]" />
                <h3 className="text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Procurement orders</h3>
                <span className="text-[12px] text-[#86868B]">({rows.length})</span>
            </div>
            {loading ? (
                <div className="py-8 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={15} /> Loading orders…</div>
            ) : rows.length === 0 ? (
                <div className="tc-card-flat p-6 text-center text-[13px] text-[#6E6E73]">No procurement orders yet.</div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
                    <table className="w-full text-[12.5px]" style={{ minWidth: 860 }}>
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-[#86868B] border-b border-black/[0.06]">
                                <th className="px-3 py-2.5">Ref</th>
                                <th className="px-3 py-2.5">Organisation</th>
                                <th className="px-3 py-2.5">Product</th>
                                <th className="px-3 py-2.5">Supplier</th>
                                <th className="px-3 py-2.5">Total</th>
                                <th className="px-3 py-2.5">Due</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="px-3 py-2.5">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((o) => {
                                const item = (o.items || [])[0] || {};
                                const idx = ORDER_STATUSES.indexOf(o.status);
                                const next = ORDER_STATUSES[idx + 1];
                                return (
                                    <tr key={o.id} className="border-b border-black/[0.04]" data-testid={`proc-admin-order-${o.ref_number}`}>
                                        <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap">{o.ref_number}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="font-medium text-[#0A0A0B]">{o.org_name || "—"}</div>
                                            <div className="text-[10.5px] uppercase text-[#86868B]">{o.org_type}</div>
                                        </td>
                                        <td className="px-3 py-2.5">{item.brand} {item.model_number} × {o.qty}</td>
                                        <td className="px-3 py-2.5">{o.supplier_name} <span className="text-[10.5px] text-[#86868B]">({o.rank})</span></td>
                                        <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap">{fmtMoney(o.total_amount)}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(o.payment_due_date)}</td>
                                        <td className="px-3 py-2.5">
                                            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${o.status === "delivered" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#EAF6FF] text-[#0369A1] border-[#BFE3FB]"}`} data-testid={`proc-admin-order-status-${o.ref_number}`}>
                                                {o.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                {next && (
                                                    <Button size="sm" variant="outline" onClick={() => advance(o)} disabled={busyId === o.id}
                                                        className="h-7 px-2.5 text-[11.5px] inline-flex items-center gap-1" data-testid={`proc-admin-advance-${o.ref_number}`}>
                                                        {busyId === o.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />} {next}
                                                    </Button>
                                                )}
                                                {o.po_document_url && (
                                                    <Button size="sm" variant="outline" onClick={() => viewPo(o)} className="h-7 px-2.5 text-[11.5px] inline-flex items-center gap-1" data-testid={`proc-admin-po-${o.ref_number}`}>
                                                        <ExternalLink size={12} /> PO
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

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

            <OrdersSection />

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
