import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import {
    ArrowLeft, Loader2, FileText, Download, ExternalLink, Save, ShieldCheck,
    Package, Edit3,
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
    doc_bank_proof: "Cancelled cheque / bank proof",
    doc_gst: "GST certificate",
    doc_pan: "PAN card",
    doc_brand_authorization: "Brand authorization",
    doc_shop_photo: "Shop photo",
    doc_address_proof: "Address proof",
};

// Maps each kind's listing rows into a normalised row used by the Listings tab.
function flattenListings(data) {
    const out = [];
    (data?.toner_listings || []).forEach((l) => out.push({
        kind: "toner",
        id: l.id,
        name: l.model_number || l.compatible_models || "—",
        brand: l.brand,
        price: l.price,
        stock: l.stock,
        description: l.compatible_models || "",
        created_at: l.created_at,
    }));
    (data?.printer_listings || []).forEach((l) => out.push({
        kind: "printer",
        id: l.id,
        name: l.model_number || l.name || "—",
        brand: l.brand,
        price: l.price,
        stock: l.stock,
        description: l.description || "",
        created_at: l.created_at,
    }));
    (data?.paper_listings || []).forEach((l) => out.push({
        kind: "paper",
        id: l.id,
        name: `${l.size || "—"} · ${l.gsm || "—"} GSM`,
        brand: l.brand,
        price: l.price_per_ream,
        stock: l.stock,
        description: l.description || "",
        created_at: l.created_at,
    }));
    (data?.consumable_listings || []).forEach((l) => out.push({
        kind: "consumable",
        id: l.id,
        name: l.model_number || l.subcategory || "—",
        brand: l.brand,
        price: l.price,
        stock: l.stock,
        description: l.description || "",
        created_at: l.created_at,
    }));
    (data?.scanner_listings || []).forEach((l) => out.push({
        kind: "scanner",
        id: l.id,
        name: l.model_number || "—",
        brand: l.brand,
        price: l.price,
        stock: l.stock,
        description: l.description || "",
        created_at: l.created_at,
    }));
    return out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

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
                        <div className="text-[13px] text-[#86868B] inline-flex items-center gap-2"><Package size={14} /> No listings yet.</div>
                    ) : (
                        <div className="overflow-x-auto -mx-1">
                            <table className="w-full text-[13px] min-w-[680px]" data-testid="dealer-listings-table">
                                <thead className="text-[10px] tracking-[0.14em] uppercase text-[#86868B]">
                                    <tr>
                                        <th className="text-left py-2">Product</th>
                                        <th className="text-left py-2">Category</th>
                                        <th className="text-left py-2">Brand</th>
                                        <th className="text-right py-2">Price</th>
                                        <th className="text-right py-2">Stock</th>
                                        <th className="text-left py-2">Status</th>
                                        <th className="text-left py-2">Listed</th>
                                        <th className="text-right py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {listings.map((l) => {
                                        const active = Number(l.stock || 0) > 0;
                                        return (
                                            <tr key={`${l.kind}-${l.id}`} className="border-t border-black/[0.05]" data-testid={`listing-row-${l.id}`}>
                                                <td className="py-2 font-medium text-[#0A0A0B] max-w-[240px]"><span className="block truncate">{l.name}</span></td>
                                                <td className="py-2 capitalize text-[#6E6E73]">{l.kind}</td>
                                                <td className="py-2 text-[#6E6E73]">{l.brand || "—"}</td>
                                                <td className="py-2 text-right font-mono">{fmtMoney(l.price)}</td>
                                                <td className="py-2 text-right font-mono">{l.stock ?? "—"}</td>
                                                <td className="py-2">
                                                    {active
                                                        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                                                        : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Inactive</span>}
                                                </td>
                                                <td className="py-2 text-[11.5px] text-[#6E6E73]">{fmtDate(l.created_at)}</td>
                                                <td className="py-2 text-right">
                                                    <button onClick={() => setEditing(l)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#00838f] hover:underline" data-testid={`listing-edit-${l.id}`}>
                                                        <Edit3 size={12} /> Edit
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
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

function EditListingDialog({ listing, onClose, onSaved }) {
    const [price, setPrice] = useState(String(listing.price ?? ""));
    const [stock, setStock] = useState(String(listing.stock ?? ""));
    const [description, setDescription] = useState(listing.description || "");
    const [status, setStatus] = useState(Number(listing.stock || 0) > 0 ? "active" : "inactive");
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put(`/admin/listings/${listing.kind}/${listing.id}`, {
                price: price === "" ? null : Number(price),
                stock: stock === "" ? null : Number(stock),
                description,
                status,
            });
            toast.success("Listing updated");
            onSaved();
        } catch (e) { toast.error(formatApiError(e) || "Update failed"); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md" data-testid="edit-listing-dialog">
                <DialogHeader>
                    <DialogTitle>Edit {listing.kind} listing</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4 mt-2">
                    <div>
                        <Label className="text-[11px] uppercase tracking-[0.14em] text-[#86868B]">Product</Label>
                        <div className="text-[14px] font-semibold text-[#0A0A0B] mt-1">{listing.brand || ""} {listing.name}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="edit-price">Price (₹)</Label>
                            <Input id="edit-price" type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="edit-listing-price" />
                        </div>
                        <div>
                            <Label htmlFor="edit-stock">Stock</Label>
                            <Input id="edit-stock" type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} data-testid="edit-listing-stock" />
                        </div>
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
                    <div>
                        <Label htmlFor="edit-desc">Description</Label>
                        <Textarea id="edit-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="edit-listing-description" />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose} data-testid="edit-listing-cancel">Cancel</Button>
                        <Button type="submit" disabled={saving} className="bg-[#0A0A0B] text-white hover:bg-black/80" data-testid="edit-listing-save">
                            {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />} Save changes
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
