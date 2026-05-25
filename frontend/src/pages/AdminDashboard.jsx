import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, MapPin, Building2, Phone, Mail, FileText, IndianRupee, Sparkles, AlertTriangle, MinusCircle, Star } from "lucide-react";
import AnalyticsTab from "./admin/AnalyticsTab";
import DealersTab from "./admin/DealersTab";
import OrdersTab from "./admin/OrdersTab";
import ContentTab from "./admin/ContentTab";
import FinanceTab from "./admin/FinanceTab";

function aiSummary(application) {
    const ai = application?.ai_check || {};
    const fields = Object.values(ai).filter((v) => v && typeof v === "object");
    if (fields.length === 0) {
        return { tone: "muted", icon: MinusCircle, label: "AI: no docs" };
    }
    const total = fields.length;
    const unclear = fields.filter((v) => v.clear === false).length;
    const clear = fields.filter((v) => v.clear === true).length;
    if (unclear > 0) {
        return { tone: "warn", icon: AlertTriangle, label: `AI: ${unclear} unclear` };
    }
    if (clear === total) {
        return { tone: "ok", icon: Sparkles, label: `AI: ${total} clear` };
    }
    return { tone: "muted", icon: MinusCircle, label: `AI: ${clear}/${total} checked` };
}

function AiVerdictPill({ application, testid }) {
    const { tone, icon: Icon, label } = aiSummary(application);
    const cls = tone === "ok"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-100 text-slate-600 border-slate-200";
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold uppercase tracking-[0.06em] ${cls}`} data-testid={testid}>
            <Icon size={11} /> {label}
        </span>
    );
}

export default function AdminDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [pending, setPending] = useState([]);
    const [approved, setApproved] = useState([]);
    const [featured, setFeatured] = useState([]);
    const [tab, setTab] = useState("analytics");
    const [reviewing, setReviewing] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState("");

    const load = async () => {
        try {
            const [s, p, a, f] = await Promise.all([
                api.get("/admin/stats"),
                api.get("/admin/suppliers/pending"),
                api.get("/admin/suppliers"),
                api.get("/admin/featured/applications").catch(() => ({ data: [] })),
            ]);
            setStats(s.data || {});
            setPending(Array.isArray(p.data) ? p.data : []);
            setApproved(Array.isArray(a.data) ? a.data : []);
            setFeatured(Array.isArray(f.data) ? f.data : []);
        } catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { load(); }, []);

    const approve = async (id) => {
        try {
            await api.post(`/admin/suppliers/${id}/approve`);
            toast.success("Supplier approved");
            setReviewing(null);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const reject = async (id, r) => {
        try {
            await api.post(`/admin/suppliers/${id}/reject`, { reason: r || "Not approved" });
            toast.success("Supplier rejected");
            setRejecting(null); setReason(""); setReviewing(null);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const setFeaturedStatus = async (id, status) => {
        try {
            await api.put(`/admin/featured/applications/${id}/status`, { status });
            toast.success(`Marked ${status}`);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const toggleSupplierFeatured = async (s) => {
        try {
            await api.put(`/admin/suppliers/${s.id}/featured`, { is_featured: !s.is_featured });
            toast.success(s.is_featured ? "Removed from featured" : "Added to featured");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const [docs, setDocs] = useState({ urls: {}, ai: {} });
    const [docsLoading, setDocsLoading] = useState(false);

    const openReview = async (p) => {
        setReviewing(p);
        setDocs({ urls: {}, ai: {} });
        setDocsLoading(true);
        try {
            const r = await api.get(`/admin/suppliers/${p.id}/documents`);
            setDocs({ urls: r.data?.documents || {}, ai: r.data?.ai_check || {} });
        } catch (e) { /* non-fatal */ }
        finally { setDocsLoading(false); }
    };

    const StatCards = useMemo(() => [
        { k: "Pending review", v: stats?.suppliers_pending ?? "—", color: "text-amber-600" },
        { k: "Approved suppliers", v: stats?.suppliers_approved ?? "—", color: "text-emerald-600" },
        { k: "Total listings", v: stats?.listings ?? "—", color: "text-[#0A0A0B]" },
        { k: "Toner SKUs", v: stats?.toner_master ?? "—", color: "text-[#0A0A0B]" },
        { k: "Orders", v: stats?.orders ?? "—", color: "text-[#0A0A0B]" },
    ], [stats]);

    return (
        <div className="tc-container py-8 sm:py-10" data-testid="admin-dashboard">
            <div className="mb-6 sm:mb-8">
                <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Admin console</div>
                <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                    TonersCart — Operations
                </h1>
                <p className="text-[14px] text-[#6E6E73] mt-1">Welcome, {user?.name}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                {StatCards.map((s) => (
                    <div key={s.k} className="tc-card-flat p-4">
                        <div className={`font-mono text-2xl font-semibold ${s.color}`}>{s.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="mb-5 flex-wrap">
                    <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
                    <TabsTrigger value="pending" data-testid="tab-pending">
                        Pending {pending.length > 0 && (<span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5">{pending.length}</span>)}
                    </TabsTrigger>
                    <TabsTrigger value="dealers" data-testid="tab-dealers">Dealers</TabsTrigger>
                    <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
                    <TabsTrigger value="finance" data-testid="tab-finance">Finance</TabsTrigger>
                    <TabsTrigger value="featured" data-testid="tab-featured">
                        Featured {featured.filter((x) => x.status === "new").length > 0 && (<span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-[#F5C400] text-[#0A0A0B] text-[10px] font-bold px-1.5">{featured.filter((x) => x.status === "new").length}</span>)}
                    </TabsTrigger>
                    <TabsTrigger value="content" data-testid="tab-content">Content</TabsTrigger>
                </TabsList>

                <TabsContent value="analytics">
                    {tab === "analytics" && <AnalyticsTab />}
                </TabsContent>

                <TabsContent value="dealers">
                    {tab === "dealers" && <DealersTab />}
                </TabsContent>

                <TabsContent value="orders">
                    {tab === "orders" && <OrdersTab />}
                </TabsContent>

                <TabsContent value="finance">
                    {tab === "finance" && <FinanceTab />}
                </TabsContent>

                <TabsContent value="content">
                    {tab === "content" && <ContentTab />}
                </TabsContent>

                <TabsContent value="pending">
                    {pending.length === 0 ? (
                        <div className="tc-card-flat p-10 text-center text-[#6E6E73]">
                            <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={32} />
                            All caught up — no pending applications.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {pending.map((p) => (
                                <div key={p.id} className="tc-card-flat p-5" data-testid={`pending-${p.id}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-amber-600">Pending</div>
                                            <h3 className="mt-1 text-[18px] font-semibold text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.business_name}</h3>
                                            <div className="text-[12px] text-[#6E6E73] flex items-center gap-1 mt-0.5"><MapPin size={11} /> {p.city}</div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <AiVerdictPill application={p} testid={`ai-pill-${p.id}`} />
                                            <div className="text-[11px] text-[#86868B] whitespace-nowrap">{new Date(p.submitted_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
                                        <div><span className="text-[#86868B]">Contact:</span> {p.contact_person}</div>
                                        <div className="truncate"><span className="text-[#86868B]">Phone:</span> <span className="font-mono">{p.phone}</span></div>
                                        <div className="col-span-2 truncate"><span className="text-[#86868B]">Email:</span> {p.email}</div>
                                        <div><span className="text-[#86868B]">GST:</span> <span className="font-mono">{p.gst_number || "—"}</span></div>
                                        <div><span className="text-[#86868B]">Turnover:</span> {p.annual_turnover || "—"}</div>
                                    </div>
                                    <div className="mt-4 flex items-center gap-2">
                                        <Button onClick={() => openReview(p)} variant="outline" className="text-[12.5px]" data-testid={`view-${p.id}`}>View details</Button>
                                        <Button onClick={() => approve(p.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px]" data-testid={`approve-${p.id}`}>
                                            <CheckCircle2 size={14} className="mr-1" /> Approve
                                        </Button>
                                        <Button onClick={() => { setRejecting(p); setReason(""); }} variant="outline" className="text-[12.5px] text-red-600 border-red-200 hover:bg-red-50" data-testid={`reject-${p.id}`}>
                                            <XCircle size={14} className="mr-1" /> Reject
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="approved">
                    {approved.length === 0 ? (
                        <div className="tc-card-flat p-10 text-center text-[#6E6E73]">No approved suppliers yet.</div>
                    ) : (
                        <div className="tc-card-flat p-0 overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                    <tr>
                                        <th className="text-left p-3">Business</th>
                                        <th className="text-left p-3">Contact</th>
                                        <th className="text-left p-3">City</th>
                                        <th className="text-left p-3">GST</th>
                                        <th className="text-left p-3">Approved</th>
                                        <th className="text-left p-3">Featured</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {approved.map((s) => (
                                        <tr key={s.id} className="border-t border-black/[0.05]">
                                            <td className="p-3 font-semibold">{s.business_name}</td>
                                            <td className="p-3">{s.contact_person}<div className="text-[11px] text-[#86868B] font-mono">{s.phone}</div></td>
                                            <td className="p-3">{s.city}</td>
                                            <td className="p-3 font-mono text-[12px]">{s.gst_number || "—"}</td>
                                            <td className="p-3 text-[11px] text-[#6E6E73]">{new Date(s.approved_at).toLocaleDateString()}</td>
                                            <td className="p-3">
                                                <button
                                                    onClick={() => toggleSupplierFeatured(s)}
                                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${s.is_featured ? "bg-[#FFFBEB] text-[#8C6A00] border-[#F5C400]" : "bg-white text-[#6E6E73] border-[#D2D2D7] hover:border-[#F5C400]"}`}
                                                    data-testid={`toggle-featured-${s.id}`}
                                                >
                                                    <Star size={11} className={s.is_featured ? "fill-[#F5C400] text-[#F5C400]" : ""} />
                                                    {s.is_featured ? "Featured" : "Make featured"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="featured">
                    {featured.length === 0 ? (
                        <div className="tc-card-flat p-10 text-center text-[#6E6E73]">No featured-supplier applications yet.</div>
                    ) : (
                        <div className="tc-card-flat p-0 overflow-x-auto" data-testid="featured-table">
                            <table className="w-full text-[13px]">
                                <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                    <tr>
                                        <th className="text-left p-3">Company</th>
                                        <th className="text-left p-3">Contact</th>
                                        <th className="text-left p-3">City</th>
                                        <th className="text-left p-3">Type</th>
                                        <th className="text-left p-3">Submitted</th>
                                        <th className="text-left p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {featured.map((a) => (
                                        <tr key={a.id} className="border-t border-black/[0.05]" data-testid={`featured-row-${a.id}`}>
                                            <td className="p-3 font-semibold">{a.company}</td>
                                            <td className="p-3">
                                                {a.contact_person}
                                                <div className="text-[11px] text-[#86868B] font-mono">{a.phone}</div>
                                                <div className="text-[11px] text-[#86868B] truncate">{a.email}</div>
                                            </td>
                                            <td className="p-3">{a.city || "—"}{a.pincode ? ` · ${a.pincode}` : ""}</td>
                                            <td className="p-3 capitalize">{a.business_type || "—"}</td>
                                            <td className="p-3 text-[11px] text-[#6E6E73]">{new Date(a.created_at).toLocaleDateString()}</td>
                                            <td className="p-3">
                                                <select
                                                    value={a.status}
                                                    onChange={(e) => setFeaturedStatus(a.id, e.target.value)}
                                                    className="h-8 px-2 rounded-md border border-[#D2D2D7] bg-white text-[12px] font-semibold"
                                                    data-testid={`featured-status-${a.id}`}
                                                >
                                                    <option value="new">New</option>
                                                    <option value="contacted">Contacted</option>
                                                    <option value="active">Active</option>
                                                    <option value="rejected">Rejected</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Review dialog */}
            <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto" data-testid="review-dialog">
                    {reviewing && (
                        <>
                            <DialogHeader>
                                <DialogTitle>{reviewing.business_name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 text-[13.5px]">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Detail icon={Building2} label="Business name" value={reviewing.business_name} />
                                    <Detail icon={Mail} label="Email" value={reviewing.email} />
                                    <Detail icon={Phone} label="Phone" value={reviewing.phone} mono />
                                    <Detail icon={MapPin} label="City / state" value={`${reviewing.city || "—"}${reviewing.state ? ", " + reviewing.state : ""}${reviewing.pincode ? " · " + reviewing.pincode : ""}`} />
                                    <Detail icon={FileText} label="GST" value={reviewing.gst_number || "—"} mono />
                                    <Detail icon={FileText} label="PAN" value={reviewing.pan_number || "—"} mono />
                                    <Detail icon={IndianRupee} label="Annual turnover" value={reviewing.annual_turnover || "—"} />
                                    <Detail icon={Building2} label="Years in business" value={reviewing.years_in_business ?? "—"} />
                                </div>

                                {(reviewing.seller_types || []).length > 0 && (
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#86868B]">Seller types</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {(reviewing.seller_types || []).map((t) => (
                                                <span key={t} className="px-2 py-0.5 rounded-full bg-[#0A0A0B] text-white text-[11px]">{t}</span>
                                            ))}
                                            {reviewing.testing_before_delivery && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200">Tests refilled</span>}
                                        </div>
                                    </div>
                                )}

                                {(reviewing.compatible_brands || []).length > 0 && (
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#86868B]">Compatible brands</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {(reviewing.compatible_brands || []).map((b) => (
                                                <span key={b} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] border border-blue-200">{b}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(reviewing.cities_served || []).length > 0 && (
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#86868B]">Cities served</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {(reviewing.cities_served || []).map((c) => (
                                                <span key={c} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#86868B]">Business address</div>
                                    <div className="mt-1 whitespace-pre-line">{reviewing.business_address}</div>
                                </div>

                                {/* Documents */}
                                <div>
                                    <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#86868B] mb-2">Documents (signed links, 5 min)</div>
                                    {docsLoading ? (
                                        <div className="text-[12px] text-[#6E6E73]">Loading documents…</div>
                                    ) : Object.keys(docs.urls || {}).length === 0 ? (
                                        <div className="text-[12px] text-[#6E6E73]">No documents uploaded.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {Object.entries(docs.urls || {}).map(([field, url]) => {
                                                const ai = (docs.ai && docs.ai[field]) || null;
                                                const label = field.replace(/^doc_/, "").replace(/_/g, " ");
                                                const aiBadge = ai
                                                    ? (ai.clear === true
                                                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">AI: clear</span>
                                                        : ai.clear === false
                                                            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">AI: unclear</span>
                                                            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">AI: skipped</span>)
                                                    : null;
                                                return (
                                                    <div key={field} className="border border-black/[0.08] rounded-lg p-2.5 flex flex-col gap-1.5" data-testid={`doc-${field}`}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[12.5px] font-semibold capitalize">{label}</span>
                                                            {aiBadge}
                                                        </div>
                                                        {ai?.notes && <div className="text-[11px] text-[#6E6E73] italic">{ai.notes}</div>}
                                                        <a href={url} target="_blank" rel="noreferrer" className="text-[12.5px] text-[#00B7C7] font-semibold hover:underline inline-flex items-center gap-1" data-testid={`view-doc-${field}`}>
                                                            <FileText size={12} /> View document
                                                        </a>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="text-[11px] text-[#86868B]">Contact person: <span className="text-[#0A0A0B] font-semibold">{reviewing.contact_person}</span></div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => { setRejecting(reviewing); setReason(""); }} className="text-red-600 border-red-200 hover:bg-red-50" data-testid="dialog-reject-btn">
                                    <XCircle size={14} className="mr-1" /> Reject
                                </Button>
                                <Button onClick={() => approve(reviewing.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="dialog-approve-btn">
                                    <CheckCircle2 size={14} className="mr-1" /> Approve supplier
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Reject reason dialog */}
            <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
                <DialogContent className="max-w-md" data-testid="reject-dialog">
                    <DialogHeader>
                        <DialogTitle>Reject {rejecting?.business_name}?</DialogTitle>
                    </DialogHeader>
                    <div className="text-[13px] text-[#6E6E73] mb-2">Optional — share a reason. The applicant will see it in their dashboard.</div>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Could not verify GST number" data-testid="reject-reason-input" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
                        <Button onClick={() => reject(rejecting.id, reason)} className="bg-red-600 hover:bg-red-700 text-white" data-testid="reject-confirm-btn">Reject application</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Detail({ icon: Icon, label, value, mono }) {
    return (
        <div className="flex items-start gap-3">
            <Icon size={16} className="text-[#86868B] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#86868B]">{label}</div>
                <div className={`text-[14px] text-[#0A0A0B] ${mono ? "font-mono" : ""} truncate`}>{value}</div>
            </div>
        </div>
    );
}
