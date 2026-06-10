import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { ArrowLeft, Loader2, FileText, Download, ExternalLink, Save, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import PageMeta from "../components/PageMeta";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const DOC_LABELS = {
    doc_id_proof: "ID proof (Aadhaar/Passport)",
    doc_bank_proof: "Cancelled cheque / bank proof",
    doc_gst: "GST certificate",
    doc_pan: "PAN card",
    doc_brand_authorization: "Brand authorization",
    doc_shop_photo: "Shop photo",
    doc_address_proof: "Address proof",
};

export default function DealerProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get(`/admin/suppliers/${id}/detail`)
            .then(({ data }) => { setData(data); setNotes(data?.supplier?.admin_notes || ""); })
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    }, [id]);

    const saveNotes = async () => {
        setSavingNotes(true);
        try {
            await api.put(`/admin/suppliers/${id}/notes`, { admin_notes: notes });
            toast.success("Notes saved");
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSavingNotes(false); }
    };

    // Mint a fresh signed URL on click (never an expired link). View opens in a
    // new tab; Download forces a file download (Supabase download flag).
    const openDoc = async (field, download) => {
        try {
            const { data: d } = await api.get(`/admin/suppliers/${id}/document`, { params: { field, download } });
            if (!d?.url) throw new Error("No document link");
            if (download) {
                const a = document.createElement("a");
                a.href = d.url;
                a.rel = "noreferrer";
                a.download = d.filename || field;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                window.open(d.url, "_blank", "noopener,noreferrer");
            }
        } catch (e) {
            toast.error(formatApiError(e) || "Couldn't open document");
        }
    };

    if (loading) {
        return <div className="tc-container py-24 grid place-items-center text-[#86868B]"><Loader2 className="animate-spin" /></div>;
    }
    if (!data) {
        return <div className="tc-container py-24 text-center text-[#86868B]">Dealer not found.</div>;
    }

    const s = data.supplier || {};
    const stats = data.stats || {};
    const docs = data.documents || {};
    const agreements = data.agreements || [];
    const orders = data.orders || [];
    const docEntries = Object.entries(docs);

    return (
        <div className="tc-container py-8 max-w-5xl" data-testid="dealer-profile-page">
            <PageMeta title={`${s.business_name || "Dealer"} — Admin`} noindex />

            <button onClick={() => navigate("/admin")} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6E6E73] hover:text-[#0A0A0B] mb-4" data-testid="dealer-profile-back">
                <ArrowLeft size={15} /> Back to dealers
            </button>

            {/* Header */}
            <div className="bg-white border border-black/[0.06] rounded-2xl p-5 mb-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-[26px] font-bold text-[#0A0A0B] flex items-center gap-3">
                            {s.business_name || "—"}
                            {s.is_suspended
                                ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Suspended</span>
                                : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>}
                        </h1>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-mono font-semibold text-[#00838f] bg-[#00838f]/10 border border-[#00838f]/20 rounded-md px-2 py-0.5" data-testid="profile-seller-id">
                                <ShieldCheck size={13} /> {s.seller_id || "Seller ID pending"}
                            </span>
                            <span className="text-[12.5px] text-[#6E6E73]">{s.city || "—"}</span>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <Stat label="Listings" value={`${stats.active_listing_count || 0}/${stats.listing_count || 0}`} sub="active / total" />
                    <Stat label="Orders" value={stats.order_count || 0} />
                    <Stat label="GMV" value={fmtMoney(stats.gmv)} />
                    <Stat label="Commission earned" value={fmtMoney(stats.commission_earned)} />
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
                {/* Business */}
                <Section title="Business details" testid="section-business">
                    <Field label="Business name" value={s.business_name} />
                    <Field label="Owner / contact" value={s.contact_person} />
                    <Field label="Email" value={s.account_email || s.email} />
                    <Field label="Phone" value={s.phone} />
                    <Field label="City" value={s.city} />
                    <Field label="State / Pincode" value={[s.state, s.pincode].filter(Boolean).join(" · ")} />
                    <Field label="Address" value={s.business_address} full />
                    <Field label="GST number" value={s.gst_number} mono />
                    <Field label="PAN number" value={s.pan_number} mono />
                    <Field label="Seller ID" value={s.seller_id} mono />
                </Section>

                {/* Account */}
                <Section title="Account details" testid="section-account">
                    <Field label="Registration date" value={fmtDate(s.registration_date || s.created_at)} />
                    <Field label="Approval date" value={fmtDate(s.approved_at)} />
                    <Field label="Account status" value={s.is_suspended ? "Suspended" : "Active"} />
                    <Field label="User type" value={s.user_type || "supplier"} />
                    <Field label="Years in business" value={s.years_in_business} />
                    <Field label="Annual turnover" value={s.annual_turnover} />
                    <Field label="Pending payout" value={fmtMoney(stats.pending_payout)} />
                </Section>

                {/* Bank */}
                <Section title="Bank details" testid="section-bank">
                    <Field label="Account holder" value={s.account_holder_name} />
                    <Field label="Account number" value={s.account_number} mono />
                    <Field label="IFSC code" value={s.ifsc_code} mono />
                    <Field label="Bank name" value={s.bank_name} />
                    <Field label="Branch" value={s.bank_branch} />
                </Section>

                {/* Documents */}
                <Section title="Uploaded documents" testid="section-documents">
                    {docEntries.length === 0 ? (
                        <div className="text-[13px] text-[#86868B]">No documents uploaded (or storage links unavailable).</div>
                    ) : (
                        <div className="space-y-2">
                            {docEntries.map(([key]) => (
                                <div key={key} className="flex items-center justify-between gap-2 border border-black/[0.06] rounded-lg px-3 py-2" data-testid={`doc-${key}`}>
                                    <span className="inline-flex items-center gap-2 text-[13px] text-[#0A0A0B] font-medium min-w-0">
                                        <FileText size={15} className="text-[#00838f] shrink-0" />
                                        <span className="truncate">{DOC_LABELS[key] || key}</span>
                                    </span>
                                    <span className="flex items-center gap-2 shrink-0">
                                        <button type="button" onClick={() => openDoc(key, false)} className="text-[12px] font-semibold text-[#00838f] hover:underline inline-flex items-center gap-1" data-testid={`doc-view-${key}`}><ExternalLink size={12} /> View</button>
                                        <button type="button" onClick={() => openDoc(key, true)} className="text-[12px] font-semibold text-[#6E6E73] hover:text-[#0A0A0B] inline-flex items-center gap-1" data-testid={`doc-download-${key}`}><Download size={12} /> Download</button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>

            {/* Agreement acceptance */}
            <Section title="Agreement acceptance" testid="section-agreement" className="mt-5">
                {agreements.length === 0 ? (
                    <div className="text-[13px] text-[#86868B]">No agreement acceptance recorded.</div>
                ) : (
                    <div className="space-y-1.5">
                        {agreements.map((a) => (
                            <div key={a.id} className="text-[13px] text-[#3a3a40]">
                                <span className="font-semibold text-[#0A0A0B]">{a.agreement_type || "Dealer agreement"}</span> {a.version ? `v${a.version}` : ""} — accepted on <strong>{fmtDateTime(a.accepted_at)}</strong>{a.ip_address ? ` (IP ${a.ip_address})` : ""}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Recent orders */}
            <Section title={`Orders (${orders.length})`} testid="section-orders" className="mt-5">
                {orders.length === 0 ? (
                    <div className="text-[13px] text-[#86868B]">No orders yet.</div>
                ) : (
                    <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-[13px] min-w-[480px]">
                            <thead className="text-[10px] tracking-[0.14em] uppercase text-[#86868B]">
                                <tr><th className="text-left py-2">Product</th><th className="text-left py-2">Customer</th><th className="text-left py-2">Date</th><th className="text-left py-2">Status</th><th className="text-right py-2">Total</th></tr>
                            </thead>
                            <tbody>
                                {orders.slice(0, 50).map((o) => (
                                    <tr key={o.id} className="border-t border-black/[0.05]">
                                        <td className="py-2 font-medium">{[o.brand, o.model_number].filter(Boolean).join(" ") || "—"}</td>
                                        <td className="py-2">{o.customer_name || "—"}</td>
                                        <td className="py-2 text-[11.5px] text-[#6E6E73]">{fmtDate(o.created_at)}</td>
                                        <td className="py-2">{o.status || "—"}</td>
                                        <td className="py-2 text-right font-mono">{fmtMoney(o.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* Admin notes */}
            <Section title="Admin notes & flags" testid="section-notes" className="mt-5">
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this dealer (visible to admins only)…" data-testid="dealer-notes-input" />
                <div className="flex justify-end mt-2">
                    <Button size="sm" onClick={saveNotes} disabled={savingNotes} className="bg-[#0A0A0B] text-white hover:bg-black/80" data-testid="dealer-notes-save">
                        {savingNotes ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Save notes
                    </Button>
                </div>
            </Section>
        </div>
    );
}

const Section = ({ title, children, testid, className = "" }) => (
    <section className={`bg-white border border-black/[0.06] rounded-2xl p-5 ${className}`} data-testid={testid}>
        <h2 className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73] mb-3">{title}</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </section>
);

const Field = ({ label, value, mono, full }) => (
    <div className={full ? "col-span-2" : ""}>
        <div className="text-[10.5px] tracking-[0.14em] uppercase text-[#86868B]">{label}</div>
        <div className={`text-[#0A0A0B] font-medium break-words ${mono ? "font-mono text-[12.5px]" : "text-[13.5px]"}`}>{value || "—"}</div>
    </div>
);

const Stat = ({ label, value, sub }) => (
    <div className="bg-black/[0.03] rounded-xl p-3">
        <div className="text-[10px] tracking-[0.14em] uppercase text-[#86868B]">{label}</div>
        <div className="text-[18px] font-bold text-[#0A0A0B] mt-0.5">{value}</div>
        {sub && <div className="text-[10.5px] text-[#86868B]">{sub}</div>}
    </div>
);
