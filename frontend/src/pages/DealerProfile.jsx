import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { inclGstPrice, formatINR } from "../lib/listingConstants";
import {
    ArrowLeft, Loader2, FileText, Download, ExternalLink, Save, ShieldCheck,
    Package, Edit3, Image as ImageIcon, CheckCircle2, AlertCircle, Upload, UserCog,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import PageMeta from "../components/PageMeta";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const DOC_LABELS = {
    doc_id_proof: "ID proof (Aadhaar/Passport)",
    doc_bank_proof: "Cancelled cheque",
    doc_gst: "GST certificate",
    doc_pan: "PAN card",
    doc_brand_authorization: "Brand authorization letter",
    doc_shop_photo: "Shop photo",
    doc_address_proof: "Address proof",
};

// Wave 64 — render order + which docs are "mandatory at-a-glance" (badge driver).
const DOC_ORDER = [
    "doc_gst",
    "doc_pan",
    "doc_bank_proof",
    "doc_id_proof",
    "doc_address_proof",
    "doc_brand_authorization",
];
const MANDATORY_DOCS = new Set(["doc_gst", "doc_pan", "doc_bank_proof", "doc_id_proof"]);

// Maps each kind's listing rows into a normalised row used by the Listings tab.
function flattenListings(data) {
    const out = [];
    // Each row keeps the full original under `_raw` so the edit dialog can
    // surface every field for the admin to modify.
    (data?.toner_listings || []).forEach((l) => out.push({
        kind: "toner",
        id: l.id,
        name: l.model_number || l.compatible_models || "—",
        brand: l.brand,
        price: l.price,
        gst_rate: l.gst_rate,
        stock: l.stock,
        description: l.compatible_models || "",
        image_url: l.image_url || (Array.isArray(l.image_urls) && l.image_urls[0]) || null,
        created_at: l.created_at,
        _raw: l,
    }));
    (data?.printer_listings || []).forEach((l) => out.push({
        kind: "printer",
        id: l.id,
        name: l.model_number || l.name || "—",
        brand: l.brand,
        price: l.price,
        gst_rate: l.gst_rate,
        stock: l.stock,
        description: l.description || "",
        image_url: l.image_url || (Array.isArray(l.image_urls) && l.image_urls[0]) || null,
        created_at: l.created_at,
        _raw: l,
    }));
    (data?.paper_listings || []).forEach((l) => out.push({
        kind: "paper",
        id: l.id,
        name: `${l.size || "—"} · ${l.gsm || "—"} GSM`,
        brand: l.brand,
        price: l.price_per_ream,
        gst_rate: l.gst_rate,
        stock: l.stock,
        description: l.description || "",
        image_url: l.image_url || null,
        created_at: l.created_at,
        _raw: l,
    }));
    (data?.consumable_listings || []).forEach((l) => out.push({
        kind: "consumable",
        id: l.id,
        name: l.model_number || l.subcategory || "—",
        brand: l.brand,
        price: l.price,
        gst_rate: l.gst_rate,
        stock: l.stock,
        description: l.description || "",
        image_url: l.image_url || null,
        created_at: l.created_at,
        _raw: l,
    }));
    (data?.scanner_listings || []).forEach((l) => out.push({
        kind: "scanner",
        id: l.id,
        name: l.model_number || "—",
        brand: l.brand,
        price: l.price,
        gst_rate: l.gst_rate,
        stock: l.stock,
        description: l.description || "",
        image_url: l.image_url || (Array.isArray(l.image_urls) && l.image_urls[0]) || null,
        created_at: l.created_at,
        _raw: l,
    }));
    return out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

const CATEGORY_TONE = {
    toner: "bg-blue-50 text-blue-700 border-blue-200",
    printer: "bg-indigo-50 text-indigo-700 border-indigo-200",
    paper: "bg-amber-50 text-amber-700 border-amber-200",
    consumable: "bg-purple-50 text-purple-700 border-purple-200",
    scanner: "bg-teal-50 text-teal-700 border-teal-200",
};

export default function DealerProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);
    const [tab, setTab] = useState("overview");
    const [downloading, setDownloading] = useState(false);
    const [editing, setEditing] = useState(null); // { kind, id, … } | null

    const load = () => {
        setLoading(true);
        return api.get(`/admin/suppliers/${id}/detail`)
            .then(({ data }) => { setData(data); setNotes(data?.supplier?.admin_notes || ""); })
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

    const saveNotes = async () => {
        setSavingNotes(true);
        try {
            await api.put(`/admin/suppliers/${id}/notes`, { admin_notes: notes });
            toast.success("Notes saved");
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSavingNotes(false); }
    };

    const openDoc = async (field, download) => {
        try {
            const { data: d } = await api.get(`/admin/suppliers/${id}/document`, { params: { field, download } });
            if (!d?.url) throw new Error("No document link");
            if (download) {
                const a = document.createElement("a");
                a.href = d.url; a.rel = "noreferrer"; a.download = d.filename || field;
                document.body.appendChild(a); a.click(); a.remove();
            } else {
                window.open(d.url, "_blank", "noopener,noreferrer");
            }
        } catch (e) { toast.error(formatApiError(e) || "Couldn't open document"); }
    };

    // Wave 64 — admin uploads a missing KYC document on the dealer's behalf.
    const [uploadingField, setUploadingField] = useState(null);
    const uploadDocForDealer = async (field, file) => {
        if (!file) return;
        setUploadingField(field);
        try {
            const fd = new FormData();
            fd.append("file", file);
            await api.post(`/admin/suppliers/${id}/document`, fd, {
                params: { field },
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success(`${DOC_LABELS[field] || field} uploaded`);
            await load();
        } catch (e) {
            toast.error(formatApiError(e) || "Upload failed");
        } finally {
            setUploadingField(null);
        }
    };

    const downloadFullProfile = async () => {
        setDownloading(true);
        try {
            const res = await api.get(`/admin/suppliers/${id}/export`, { responseType: "blob" });
            const cd = res.headers["content-disposition"] || res.headers["Content-Disposition"] || "";
            const m = /filename="?([^"]+)"?/.exec(cd);
            const filename = m ? m[1] : `dealer_${id}.zip`;
            const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
            const a = document.createElement("a");
            a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(blobUrl);
            toast.success("Profile ZIP downloaded");
        } catch (e) {
            toast.error(formatApiError(e) || "Export failed");
        } finally { setDownloading(false); }
    };

    // Wave 79 — admin impersonation flow rewritten to use SAME-tab
    // navigation. Admin's bearer token is preserved (still localStorage
    // 'sb-…-auth-token'); only the X-Impersonate-User-Id header changes
    // (api.js interceptor). The ImpersonationBanner shows globally; the
    // "End Session" button clears the flag and returns the admin to the
    // admin dashboard. ProtectedRoute now allows admins through to
    // supplier-only routes when this flag is set.
    const actAsDealer = async () => {
        try {
            const { data } = await api.post(`/admin/suppliers/${id}/impersonate`);
            if (!data?.user_id) { toast.error("Impersonation failed"); return; }
            try {
                window.sessionStorage.setItem("tc_impersonate_user_id", data.user_id);
                window.sessionStorage.setItem("tc_impersonate_name", data.business_name || "Dealer");
                window.sessionStorage.setItem("tc_impersonate_supplier_id", data.supplier_id || "");
                window.sessionStorage.setItem("tc_impersonate_return_to", window.location.pathname + window.location.search);
            } catch { /* ignore */ }
            toast.success(`Acting as ${data.business_name}`);
            // Same-tab navigation — admin token is preserved in localStorage.
            navigate("/supplier");
        } catch (e) {
            toast.error(formatApiError(e) || "Impersonation failed");
        }
    };

    const listings = useMemo(() => flattenListings(data), [data]);

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
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={actAsDealer}
                            className="bg-[#00838f] text-white hover:bg-[#006570] inline-flex items-center gap-2"
                            data-testid="act-as-dealer-btn"
                        >
                            <UserCog size={14} /> Act as Dealer
                        </Button>
                        <Button
                            onClick={downloadFullProfile}
                            disabled={downloading}
                            className="bg-[#0A0A0B] text-white hover:bg-black/80 inline-flex items-center gap-2"
                            data-testid="download-full-profile-btn"
                        >
                            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            Download Full Profile
                        </Button>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <Stat label="Listings" value={`${stats.active_listing_count || 0}/${stats.listing_count || 0}`} sub="active / total" />
                    <Stat label="Orders" value={stats.order_count || 0} />
                    <Stat label="GMV" value={fmtMoney(stats.gmv)} />
                    <Stat label="Commission earned" value={fmtMoney(stats.commission_earned)} />
                </div>

                {/* Tabs */}
                <div className="mt-5 flex items-center gap-1 border-b border-black/[0.06]" data-testid="dealer-tabs">
                    {[
                        { key: "overview", label: "Overview" },
                        { key: "listings", label: `Listings (${listings.length})` },
                    ].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${tab === t.key ? "text-[#0A0A0B] border-[#0A0A0B]" : "text-[#86868B] border-transparent hover:text-[#0A0A0B]"}`}
                            data-testid={`dealer-tab-${t.key}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === "overview" && (
                <>
                    <div className="grid md:grid-cols-2 gap-5">
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

                        <Section title="Account details" testid="section-account">
                            <Field label="Registration date" value={fmtDate(s.registration_date || s.created_at)} />
                            <Field label="Approval date" value={fmtDate(s.approved_at)} />
                            <Field label="Account status" value={s.is_suspended ? "Suspended" : "Active"} />
                            <Field label="User type" value={s.user_type || "supplier"} />
                            <Field label="Years in business" value={s.years_in_business} />
                            <Field label="Annual turnover" value={s.annual_turnover} />
                            <Field label="Pending payout" value={fmtMoney(stats.pending_payout)} />
                        </Section>

                        <Section title="Bank details" testid="section-bank">
                            <Field label="Account holder" value={s.account_holder_name} />
                            <Field label="Account number" value={s.account_number} mono />
                            <Field label="IFSC code" value={s.ifsc_code} mono />
                            <Field label="Bank name" value={s.bank_name} />
                            <Field label="Branch" value={s.bank_branch} />
                        </Section>

                        <Section title="Documents" testid="section-documents">
                            {(() => {
                                const status = s.doc_status || {};
                                const pendingMandatory = DOC_ORDER.filter(
                                    (f) => MANDATORY_DOCS.has(f) && !(status[f] || docs[f])
                                );
                                return (
                                    <>
                                        {pendingMandatory.length > 0 && (
                                            <div className="mb-3 text-[12px] text-[#92400E] bg-[#FFFBEB] border border-[#F5C400]/40 rounded-lg px-3 py-2 flex items-start gap-2" data-testid="docs-pending-banner">
                                                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                                <span><strong>{pendingMandatory.length} mandatory document{pendingMandatory.length === 1 ? "" : "s"} missing.</strong> Upload on the dealer&rsquo;s behalf using the buttons below.</span>
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            {DOC_ORDER.map((field) => {
                                                const uploaded = !!(status[field] || docs[field]);
                                                const mandatory = MANDATORY_DOCS.has(field);
                                                const busy = uploadingField === field;
                                                return (
                                                    <div key={field} className="flex items-center justify-between gap-2 border border-black/[0.06] rounded-lg px-3 py-2" data-testid={`doc-row-${field}`}>
                                                        <span className="inline-flex items-center gap-2 text-[13px] text-[#0A0A0B] font-medium min-w-0 flex-1">
                                                            <FileText size={15} className="text-[#00838f] shrink-0" />
                                                            <span className="truncate">
                                                                {DOC_LABELS[field] || field}
                                                                {!mandatory && (
                                                                    <span className="ml-1.5 text-[10.5px] uppercase tracking-wider text-[#86868B] font-semibold">Optional</span>
                                                                )}
                                                            </span>
                                                        </span>
                                                        <span className="flex items-center gap-2 shrink-0">
                                                            {uploaded ? (
                                                                <>
                                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5" data-testid={`doc-status-${field}`}>
                                                                        <CheckCircle2 size={11} /> Uploaded
                                                                    </span>
                                                                    <button type="button" onClick={() => openDoc(field, false)} className="text-[12px] font-semibold text-[#00838f] hover:underline inline-flex items-center gap-1" data-testid={`doc-view-${field}`}><ExternalLink size={12} /> View</button>
                                                                    <button type="button" onClick={() => openDoc(field, true)} className="text-[12px] font-semibold text-[#6E6E73] hover:text-[#0A0A0B] inline-flex items-center gap-1" data-testid={`doc-download-${field}`}><Download size={12} /> Download</button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${mandatory ? "text-red-700 bg-red-50 border border-red-200" : "text-amber-700 bg-amber-50 border border-amber-200"}`} data-testid={`doc-status-${field}`}>
                                                                        <AlertCircle size={11} /> Missing
                                                                    </span>
                                                                    <label className={`text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer rounded-md px-2 py-1 ${busy ? "opacity-50 cursor-not-allowed bg-black/[0.04]" : "text-white bg-[#0A0A0B] hover:bg-black/80"}`} data-testid={`doc-upload-${field}`}>
                                                                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                                                        {busy ? "Uploading…" : "Upload"}
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*,application/pdf"
                                                                            className="hidden"
                                                                            disabled={busy}
                                                                            onChange={(e) => {
                                                                                const f = e.target.files?.[0];
                                                                                e.target.value = "";
                                                                                uploadDocForDealer(field, f);
                                                                            }}
                                                                            data-testid={`doc-upload-input-${field}`}
                                                                        />
                                                                    </label>
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                );
                            })()}
                        </Section>
                    </div>

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

                    <Section title="Admin notes & flags" testid="section-notes" className="mt-5">
                        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this dealer (visible to admins only)…" data-testid="dealer-notes-input" />
                        <div className="flex justify-end mt-2">
                            <Button size="sm" onClick={saveNotes} disabled={savingNotes} className="bg-[#0A0A0B] text-white hover:bg-black/80" data-testid="dealer-notes-save">
                                {savingNotes ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />} Save notes
                            </Button>
                        </div>
                    </Section>
                </>
            )}

            {tab === "listings" && (
                <Section title="All listings" testid="section-listings">
                    {listings.length === 0 ? (
                        <div className="text-[14px] text-[#86868B] inline-flex items-center gap-2"><Package size={16} /> No listings yet.</div>
                    ) : (
                        <div className="-mx-1 sm:mx-0">
                            <div className="hidden lg:grid grid-cols-[80px_1fr_120px_120px_140px_120px_120px_130px] gap-4 px-4 pb-3 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B] border-b border-black/[0.05]">
                                <div>Image</div>
                                <div>Product</div>
                                <div>Category</div>
                                <div>Brand</div>
                                <div className="text-right">Price (incl. GST)</div>
                                <div className="text-right">Stock</div>
                                <div>Status</div>
                                <div className="text-right">Action</div>
                            </div>
                            <div className="divide-y divide-black/[0.05]" data-testid="dealer-listings-table">
                                {listings.map((l) => {
                                    const active = Number(l.stock || 0) > 0;
                                    const tone = CATEGORY_TONE[l.kind] || "bg-slate-50 text-slate-700 border-slate-200";
                                    return (
                                        <div
                                            key={`${l.kind}-${l.id}`}
                                            className="grid grid-cols-1 lg:grid-cols-[80px_1fr_120px_120px_140px_120px_120px_130px] gap-3 lg:gap-4 px-3 sm:px-4 py-4 items-center hover:bg-black/[0.015] rounded-xl transition"
                                            data-testid={`listing-row-${l.id}`}
                                        >
                                            <div className="w-16 h-16 rounded-xl bg-[#F5F5F7] border border-black/[0.06] grid place-items-center overflow-hidden shrink-0">
                                                {l.image_url ? (
                                                    <img src={l.image_url} alt={l.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImageIcon size={22} className="text-[#C7C7CC]" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[14.5px] font-semibold text-[#0A0A0B] truncate">{l.name}</div>
                                                {l.description && <div className="text-[12px] text-[#86868B] truncate mt-0.5">{l.description}</div>}
                                                <div className="text-[10.5px] text-[#C7C7CC] mt-1 lg:hidden">Listed {fmtDate(l.created_at)}</div>
                                            </div>
                                            <div className="lg:block">
                                                <span className={`inline-block px-2.5 py-1 rounded-md border text-[10.5px] font-bold capitalize ${tone}`}>{l.kind}</span>
                                            </div>
                                            <div className="text-[13.5px] font-semibold text-[#1D1D1F]">{l.brand || "—"}</div>
                                            <div className="lg:text-right">
                                                <div className="text-[10px] tracking-[0.14em] uppercase text-[#86868B] lg:hidden">Price (incl. GST)</div>
                                                <div className="font-mono text-[15.5px] font-bold text-[#0A0A0B]">{formatINR(inclGstPrice(l.price, l.gst_rate))}</div>
                                                <div className="text-[10px] text-[#86868B] mt-0.5">Base {formatINR(l.price)} · {l.gst_rate ?? 18}% GST</div>
                                            </div>
                                            <div className="lg:text-right font-mono text-[14.5px] font-semibold text-[#1D1D1F]">
                                                <span className="text-[10px] tracking-[0.14em] uppercase text-[#86868B] lg:hidden mr-2">Stock</span>
                                                {l.stock ?? "—"}
                                            </div>
                                            <div>
                                                {active
                                                    ? <span className="inline-flex items-center gap-1 text-[11.5px] font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">● Active</span>
                                                    : <span className="inline-flex items-center gap-1 text-[11.5px] font-bold px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">● Inactive</span>}
                                            </div>
                                            <div className="lg:text-right">
                                                <button
                                                    onClick={() => setEditing(l)}
                                                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A0A0B] text-white text-[13px] font-semibold hover:bg-black/85 active:scale-95 transition shadow-sm w-full lg:w-auto"
                                                    data-testid={`listing-edit-${l.id}`}
                                                >
                                                    <Edit3 size={14} /> Edit
                                                </button>
                                            </div>
                                            <div className="hidden lg:block text-[10.5px] text-[#86868B] col-span-full lg:hidden">Listed {fmtDate(l.created_at)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {editing && (
                <EditListingDialog
                    listing={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}
        </div>
    );
}

// Fields exposed for editing, per product kind. Each entry: [api_key, label,
// type, opts]. We use this single source of truth to (a) seed the form from
// the listing's _raw row, (b) render the inputs, and (c) shape the PUT
// payload. New fields can be added in one place without changing two layers.
const ADMIN_EDIT_FIELDS = {
    toner: [
        ["brand", "Brand", "text"],
        ["model_number", "Toner model number", "text"],
        ["compatible_models", "Suitable for (compatible printers)", "textarea"],
        ["color", "Color", "text"],
        ["toner_type", "Toner type", "select", ["Original", "Compatible", "Refilled"]],
        ["price", "Price (₹) base / excl. GST", "number"],
        ["gst_rate", "GST rate (%)", "number"],
        ["stock", "Stock", "number"],
        ["page_yield", "Page yield (sheets)", "number"],
        ["oem_part_number", "OEM part number", "text"],
        ["cartridge_weight", "Cartridge weight (g)", "number"],
        ["warranty", "Warranty", "text"],
        ["print_technology", "Print technology", "select", ["Laser", "Inkjet", "Thermal", "Dot Matrix"]],
        ["intercity_delivery_charge", "Intercity delivery charge (₹)", "number"],
        ["image_url", "Primary image URL", "text"],
    ],
    printer: [
        ["brand", "Brand", "text"],
        ["model_number", "Model number", "text"],
        ["category", "Technology", "select", ["laser", "inkjet", "led", "thermal", "dot_matrix", "multifunction"]],
        ["condition", "Condition", "select", ["new", "refurbished"]],
        ["usage_type", "Usage type", "select", ["corporate", "home", "soho", "commercial"]],
        ["color", "Output color", "select", ["bw", "color"]],
        ["price", "Price (₹) base / excl. GST", "number"],
        ["gst_rate", "GST rate (%)", "number"],
        ["stock", "Stock", "number"],
        ["print_speed_ppm", "Print speed (ppm)", "number"],
        ["monthly_volume_min", "Monthly volume — min", "number"],
        ["monthly_volume_max", "Monthly volume — max", "number"],
        ["connectivity", "Connectivity (comma-separated)", "list"],
        ["paper_sizes", "Paper sizes (comma-separated)", "list"],
        ["functions", "Functions (comma-separated)", "list"],
        ["intercity_delivery_charge", "Intercity delivery charge (₹)", "number"],
        ["description", "Description", "textarea"],
        ["image_url", "Primary image URL", "text"],
    ],
    paper: [
        ["brand", "Brand", "text"],
        ["size", "Size", "select", ["A4", "A3", "A5", "Letter", "Legal", "Executive"]],
        ["gsm", "GSM", "number"],
        ["reams_per_box", "Reams per box", "number"],
        ["price", "Price per ream (₹) base / excl. GST", "number"],
        ["gst_rate", "GST rate (%)", "number"],
        ["stock", "Stock (boxes)", "number"],
        ["brightness", "Brightness", "number"],
        ["thickness_microns", "Thickness (μm)", "number"],
        ["acid_free", "Acid-free", "bool"],
        ["suitable_for", "Suitable for (comma-separated)", "list"],
        ["description", "Description", "textarea"],
        ["image_url", "Primary image URL", "text"],
    ],
    consumable: [
        ["subcategory", "Subcategory", "select", ["Ink Cartridges", "Drums", "Imaging Units", "Maintenance Kits", "Fusers", "Belts", "Waste Toner Bottles", "Other"]],
        ["subcategory_other", "If 'Other', specify", "text"],
        ["brand", "Brand", "text"],
        ["model_number", "Model number", "text"],
        ["compatible_models", "Suitable for", "textarea"],
        ["condition", "Condition", "select", ["New", "Refurbished", "Used"]],
        ["price", "Price (₹) base / excl. GST", "number"],
        ["gst_rate", "GST rate (%)", "number"],
        ["stock", "Stock", "number"],
        ["intercity_delivery_charge", "Intercity delivery charge (₹)", "number"],
        ["description", "Description", "textarea"],
        ["image_url", "Primary image URL", "text"],
    ],
    scanner: [
        ["brand", "Brand", "text"],
        ["model_number", "Model number", "text"],
        ["scanner_type", "Scanner type", "select", ["Flatbed", "Sheet-fed", "Drum", "Portable", "Photo"]],
        ["condition", "Condition", "select", ["New", "Refurbished", "Used"]],
        ["scan_resolution", "Scan resolution", "select", ["600dpi", "1200dpi", "2400dpi", "4800dpi", "9600dpi"]],
        ["scan_speed_ppm", "Scan speed (ppm)", "number"],
        ["color_mode", "Color/Mono", "select", ["Color", "Mono", "Both"]],
        ["warranty", "Warranty", "text"],
        ["connectivity", "Connectivity (comma-separated)", "list"],
        ["price", "Price (₹) base / excl. GST", "number"],
        ["gst_rate", "GST rate (%)", "number"],
        ["stock", "Stock", "number"],
        ["intercity_delivery_charge", "Intercity delivery charge (₹)", "number"],
        ["description", "Description", "textarea"],
        ["image_url", "Primary image URL", "text"],
    ],
};

// Map a listing row (raw from API) → form state.
function seedFormFromRaw(kind, raw) {
    const form = {};
    const fields = ADMIN_EDIT_FIELDS[kind] || [];
    for (const [key, , type] of fields) {
        // The paper table stores price_per_ream, not price — surface that
        // under the unified `price` key so the editor stays generic.
        let val = raw[key];
        if (key === "price" && kind === "paper") val = raw.price_per_ream;
        if (type === "bool") form[key] = !!val;
        else if (type === "list") form[key] = Array.isArray(val) ? val.join(", ") : (val || "");
        else if (val == null) form[key] = "";
        else form[key] = String(val);
    }
    return form;
}

// Convert form state → API payload (only non-empty entries).
function payloadFromForm(kind, form) {
    const payload = {};
    const fields = ADMIN_EDIT_FIELDS[kind] || [];
    for (const [key, , type] of fields) {
        const v = form[key];
        if (v === "" || v == null) continue;
        if (type === "number") {
            const n = Number(v);
            if (Number.isFinite(n)) payload[key] = n;
        } else if (type === "bool") {
            payload[key] = !!v;
        } else if (type === "list") {
            const arr = String(v).split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
            payload[key] = arr;
        } else {
            payload[key] = String(v);
        }
    }
    return payload;
}

function EditListingDialog({ listing, onClose, onSaved }) {
    const kind = listing.kind;
    const fields = ADMIN_EDIT_FIELDS[kind] || [];
    const [form, setForm] = useState(() => seedFormFromRaw(kind, listing._raw || listing));
    const [status, setStatus] = useState(Number(listing.stock || 0) > 0 ? "active" : "inactive");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = payloadFromForm(kind, form);
            payload.status = status;
            await api.put(`/admin/listings/${kind}/${listing.id}`, payload);
            toast.success("Listing updated");
            onSaved();
        } catch (err) { toast.error(formatApiError(err) || "Update failed"); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="edit-listing-dialog">
                <DialogHeader>
                    <DialogTitle>Edit {kind} listing — every field is editable</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4 mt-2">
                    <div className="bg-black/[0.03] border border-black/[0.06] rounded-lg p-3">
                        <Label className="text-[11px] uppercase tracking-[0.14em] text-[#86868B]">Product</Label>
                        <div className="text-[14px] font-semibold text-[#0A0A0B] mt-1">{listing.brand || ""} {listing.name}</div>
                        <div className="text-[11.5px] text-[#86868B] mt-0.5">Price stored as <strong>base / excl. GST</strong>. The buyer-facing card adds GST on display.</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {fields.map(([key, label, type, opts]) => {
                            const wide = type === "textarea" || type === "list";
                            return (
                                <div key={key} className={wide ? "sm:col-span-2" : ""}>
                                    <Label htmlFor={`edit-${key}`}>{label}</Label>
                                    {type === "textarea" ? (
                                        <Textarea id={`edit-${key}`} rows={2} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} data-testid={`edit-${kind}-${key}`} />
                                    ) : type === "select" ? (
                                        <select
                                            id={`edit-${key}`}
                                            value={form[key] ?? ""}
                                            onChange={(e) => set(key, e.target.value)}
                                            className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]"
                                            data-testid={`edit-${kind}-${key}`}
                                        >
                                            <option value="">—</option>
                                            {(opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    ) : type === "bool" ? (
                                        <div className="flex items-center gap-2 h-10">
                                            <input id={`edit-${key}`} type="checkbox" checked={!!form[key]} onChange={(e) => set(key, e.target.checked)} data-testid={`edit-${kind}-${key}`} />
                                            <span className="text-[13px] text-[#3a3a40]">Yes</span>
                                        </div>
                                    ) : (
                                        <Input
                                            id={`edit-${key}`}
                                            type={type === "number" ? "number" : "text"}
                                            step={type === "number" ? "1" : undefined}
                                            value={form[key] ?? ""}
                                            onChange={(e) => set(key, e.target.value)}
                                            data-testid={`edit-${kind}-${key}`}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div>
                        <Label htmlFor="edit-status">Status</Label>
                        <select
                            id="edit-status"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]"
                            data-testid="edit-listing-status"
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <div className="text-[11px] text-[#86868B] mt-1">Inactive zeroes stock so the listing falls out of public browse.</div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose} data-testid="edit-listing-cancel">Cancel</Button>
                        <Button type="submit" disabled={saving} className="bg-[#0A0A0B] text-white hover:bg-black/80" data-testid="edit-listing-save">
                            {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />} Save all fields
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
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
