import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, MapPin, Building2, Phone, Mail, FileText, IndianRupee, Sparkles, AlertTriangle, MinusCircle, Star, Upload, Loader2, BarChart3, UserPlus, Users, ShoppingBag, ShieldAlert, Wallet, MessageSquare, Activity, Crown, BookOpen, Briefcase, Factory, FileSignature } from "lucide-react";
import AnalyticsTab from "./admin/AnalyticsTab";
import DealersTab from "./admin/DealersTab";
import OrdersTab from "./admin/OrdersTab";
import ContentTab from "./admin/ContentTab";
import FinanceTab from "./admin/FinanceTab";
import ProcurementTab from "./admin/ProcurementTab";
import OemTab from "./admin/OemTab";
import AgreementsTab from "./admin/AgreementsTab";
import CustomersTab from "./admin/CustomersTab";
import DisputesTab from "./admin/DisputesTab";
import ActivityLogTab from "./admin/ActivityLogTab";
import MessagesTab from "./admin/MessagesTab";
import UsersTab from "./admin/UsersTab";

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

// Colour palette for the admin tab bar. Each tab owns a distinct hue with a
// "live" colour (active pill background) and a "dim" colour (inactive pill
// background — washed-out so the active tab stands out clearly). Icons use
// the live colour on inactive pills and white on active pills.
const TAB_META = {
    analytics:   { label: "Analytics",      icon: BarChart3,    live: "#1E40AF", dim: "#EFF4FF", text: "#1E3A8A" }, // blue
    pending:     { label: "Pending Dealers",icon: UserPlus,     live: "#EA580C", dim: "#FFF1E6", text: "#9A3412" }, // orange
    dealers:     { label: "Dealers",        icon: Building2,    live: "#0F766E", dim: "#E6F6F4", text: "#115E59" }, // teal
    customers:   { label: "Customers",      icon: Users,        live: "#0E7490", dim: "#E1F5F9", text: "#0E7490" }, // cyan-teal
    users:       { label: "All Users",       icon: Users,        live: "#0F172A", dim: "#E2E8F0", text: "#0F172A" }, // slate-black
    orders:      { label: "Orders",         icon: ShoppingBag,  live: "#4338CA", dim: "#EEF0FF", text: "#3730A3" }, // indigo
    disputes:    { label: "Disputes",       icon: ShieldAlert,  live: "#DC2626", dim: "#FEECEC", text: "#991B1B" }, // red
    finance:     { label: "Finance",        icon: Wallet,       live: "#16A34A", dim: "#E8F7EC", text: "#15803D" }, // green
    messages:    { label: "Messages",       icon: MessageSquare,live: "#7C3AED", dim: "#F0E9FE", text: "#5B21B6" }, // purple
    activity:    { label: "Activity",       icon: Activity,     live: "#475569", dim: "#EEF1F5", text: "#334155" }, // slate
    featured:    { label: "Featured",       icon: Crown,        live: "#D97706", dim: "#FEF4E0", text: "#92400E" }, // amber
    content:     { label: "Content",        icon: BookOpen,     live: "#DB2777", dim: "#FCE7F0", text: "#9D174D" }, // pink
    procurement: { label: "Procurement",    icon: Briefcase,    live: "#0891B2", dim: "#DDF4FB", text: "#155E75" }, // cyan
    oem:         { label: "OEM",            icon: Factory,      live: "#C2410C", dim: "#FFE7DC", text: "#9A3412" }, // deep orange
    agreements:  { label: "Agreements",     icon: FileSignature,live: "#78350F", dim: "#F5EBDF", text: "#5B2E0B" }, // brown
};

function ColoredTabPill({ value, active, badge, onClick }) {
    const meta = TAB_META[value];
    if (!meta) return null;
    const Icon = meta.icon;
    const style = active
        ? { background: meta.live, color: "#FFFFFF", borderColor: meta.live }
        : { background: meta.dim, color: meta.text, borderColor: "transparent" };
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={`tab-${value}`}
            className={`group relative inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border-2 text-[12.5px] sm:text-[13px] font-semibold whitespace-nowrap transition-all duration-200 hover:scale-[1.03] hover:shadow-sm ${active ? "shadow-md" : "hover:brightness-95"}`}
            style={style}
            aria-pressed={active}
        >
            <Icon size={14} className="shrink-0" />
            <span className="hidden sm:inline">{meta.label}</span>
            <span className="sm:hidden">{meta.label.split(" ")[0]}</span>
            {badge > 0 && (
                <span
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-extrabold px-1.5 leading-none"
                    style={active
                        ? { background: "#FFFFFF", color: meta.live }
                        : { background: meta.live, color: "#FFFFFF" }}
                >
                    {badge}
                </span>
            )}
        </button>
    );
}

export default function AdminDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [pending, setPending] = useState([]);
    const [approved, setApproved] = useState([]);
    const [featured, setFeatured] = useState([]);
    const [procPending, setProcPending] = useState(0);
    const [oemPending, setOemPending] = useState(0);
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
            api.get("/admin/procurement/pending")
                .then((r) => setProcPending((r.data?.counts?.govt || 0) + (r.data?.counts?.corporate || 0)))
                .catch(() => setProcPending(0));
            api.get("/admin/oem/pending")
                .then((r) => setOemPending(r.data?.count || 0))
                .catch(() => setOemPending(0));
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
    const [featureModal, setFeatureModal] = useState(null); // {application}
    const [featureLogo, setFeatureLogo] = useState(null);
    const [featureSupplierId, setFeatureSupplierId] = useState("");
    const [featuring, setFeaturing] = useState(false);

    const openFeatureModal = (application) => {
        setFeatureModal(application);
        setFeatureLogo(null);
        // Try to find existing supplier whose business name matches the application company
        const match = approved.find((s) => (s.business_name || "").toLowerCase() === (application.company || "").toLowerCase());
        setFeatureSupplierId(match?.id || "");
    };

    const confirmFeature = async () => {
        if (!featureSupplierId) { toast.error("Pick a supplier from the dropdown first"); return; }
        setFeaturing(true);
        try {
            // Preferred path — use the applicant-uploaded image stored on the application
            if (featureModal?.image_url && !featureLogo) {
                await api.post("/admin/featured/feature-from-application", {
                    application_id: featureModal.id,
                    supplier_id: featureSupplierId,
                });
            } else if (featureLogo) {
                const fd = new FormData();
                fd.append("file", featureLogo);
                await api.post(`/admin/suppliers/${featureSupplierId}/featured-image`, fd);
                if (featureModal?.id) {
                    try { await api.put(`/admin/featured/applications/${featureModal.id}/status`, { status: "active" }); } catch { /* non-fatal */ }
                }
            } else {
                toast.error("No image attached — applicant uploaded none. Please upload a banner image.");
                setFeaturing(false);
                return;
            }
            toast.success("Company is now featured on the landing page");
            setFeatureModal(null);
            setFeatureLogo(null);
            setFeatureSupplierId("");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setFeaturing(false); }
    };

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
                {(() => {
                    const adminTabs = [
                        { value: "analytics" },
                        { value: "pending", badge: pending.length || 0 },
                        { value: "dealers" },
                        { value: "customers" },
                        { value: "users" },
                        { value: "orders" },
                        { value: "disputes" },
                        { value: "finance" },
                        { value: "messages" },
                        { value: "activity" },
                        { value: "featured", badge: featured.filter((x) => x.status === "new").length || 0 },
                        { value: "content" },
                        { value: "procurement", badge: procPending || 0 },
                        { value: "oem", badge: oemPending || 0 },
                        { value: "agreements" },
                    ];
                    return (
                        <div className="mb-7 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 overflow-x-auto no-scrollbar" data-testid="admin-tab-bar">
                            <div className="flex flex-wrap gap-2 sm:gap-2.5 min-w-full justify-start">
                                {adminTabs.map((t) => (
                                    <ColoredTabPill
                                        key={t.value}
                                        value={t.value}
                                        active={tab === t.value}
                                        badge={t.badge}
                                        onClick={() => setTab(t.value)}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })()}

                <TabsContent value="analytics">
                    {tab === "analytics" && <AnalyticsTab />}
                </TabsContent>

                <TabsContent value="dealers">
                    {tab === "dealers" && <DealersTab />}
                </TabsContent>

                <TabsContent value="customers">
                    {tab === "customers" && <CustomersTab />}
                </TabsContent>

                <TabsContent value="users">
                    {tab === "users" && <UsersTab />}
                </TabsContent>

                <TabsContent value="orders">
                    {tab === "orders" && <OrdersTab />}
                </TabsContent>

                <TabsContent value="disputes">
                    {tab === "disputes" && <DisputesTab />}
                </TabsContent>

                <TabsContent value="finance">
                    {tab === "finance" && <FinanceTab />}
                </TabsContent>

                <TabsContent value="messages">
                    {tab === "messages" && <MessagesTab />}
                </TabsContent>

                <TabsContent value="activity">
                    {tab === "activity" && <ActivityLogTab />}
                </TabsContent>

                <TabsContent value="content">
                    {tab === "content" && <ContentTab />}
                </TabsContent>

                <TabsContent value="procurement">
                    {tab === "procurement" && <ProcurementTab />}
                </TabsContent>

                <TabsContent value="oem">
                    {tab === "oem" && <OemTab />}
                </TabsContent>

                <TabsContent value="agreements">
                    {tab === "agreements" && <AgreementsTab />}
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
                                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
                                        <Button onClick={() => openReview(p)} variant="outline" className="w-full sm:w-auto text-[12.5px]" data-testid={`view-${p.id}`}>View details</Button>
                                        <Button onClick={() => approve(p.id)} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px]" data-testid={`approve-${p.id}`}>
                                            <CheckCircle2 size={14} className="mr-1" /> Approve
                                        </Button>
                                        <Button onClick={() => { setRejecting(p); setReason(""); }} variant="outline" className="w-full sm:w-auto text-[12.5px] text-red-600 border-red-200 hover:bg-red-50" data-testid={`reject-${p.id}`}>
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
                            <table className="w-full min-w-[720px] text-[13px]">
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
                            <table className="w-full min-w-[760px] text-[13px]">
                                <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                                    <tr>
                                        <th className="text-left p-3 w-[80px]">Image</th>
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
                                            <td className="p-3">
                                                {a.image_url ? (
                                                    <img src={a.image_url} alt={a.company} className="w-16 h-16 object-cover rounded-md border border-black/[0.06]" data-testid={`featured-thumb-${a.id}`} />
                                                ) : (
                                                    <div className="w-16 h-16 rounded-md bg-black/[0.04] grid place-items-center text-[10px] text-[#86868B]" data-testid={`featured-thumb-empty-${a.id}`}>No image</div>
                                                )}
                                            </td>
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
                                                <button
                                                    onClick={() => openFeatureModal(a)}
                                                    className="ml-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FFFBEB] border border-[#F5C400] text-[#8C6A00] text-[11.5px] font-semibold hover:bg-[#FFF7D6]"
                                                    data-testid={`feature-company-btn-${a.id}`}
                                                    title="Upload company logo and feature on landing"
                                                >
                                                    <Star size={11} /> Feature this company
                                                </button>
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

            {/* Feature this company — admin uploads logo + selects supplier */}
            <Dialog open={!!featureModal} onOpenChange={(o) => !o && setFeatureModal(null)}>
                <DialogContent className="max-w-md" data-testid="feature-upload-dialog">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Star size={16} className="text-[#F5C400]" /> Feature {featureModal?.company}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 text-[13px]">
                        <p className="text-[#6E6E73]">Upload the company&apos;s logo or banner image. Then pick which approved supplier this featured placement maps to.</p>
                        <div>
                            <label className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">Map to approved supplier</label>
                            <select
                                value={featureSupplierId}
                                onChange={(e) => setFeatureSupplierId(e.target.value)}
                                className="mt-1 h-10 w-full px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]"
                                data-testid="feature-supplier-select"
                            >
                                <option value="">— select —</option>
                                {approved.map((s) => (<option key={s.id} value={s.id}>{s.business_name} · {s.city || ""}</option>))}
                            </select>
                        </div>
                        <label className="block cursor-pointer">
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => setFeatureLogo(e.target.files?.[0] || null)}
                                className="hidden"
                                data-testid="feature-logo-input"
                            />
                            <div className="border-2 border-dashed border-[#D2D2D7] rounded-xl p-5 text-center hover:border-[#F5C400] transition">
                                {featureLogo ? (
                                    <>
                                        <img src={URL.createObjectURL(featureLogo)} alt="preview" className="max-h-24 mx-auto rounded" />
                                        <div className="mt-2 text-[12px] text-[#6E6E73]">{featureLogo.name}</div>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={20} className="mx-auto text-[#86868B]" />
                                        <div className="mt-2 text-[13px] font-semibold">Upload logo / banner</div>
                                        <div className="text-[11px] text-[#86868B]">PNG / JPG / WEBP · max 5 MB</div>
                                    </>
                                )}
                            </div>
                        </label>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFeatureModal(null)} disabled={featuring}>Cancel</Button>
                        <Button onClick={confirmFeature} disabled={featuring} className="btn-cta" data-testid="feature-confirm-btn">
                            {featuring ? <><Loader2 size={13} className="animate-spin mr-1.5" /> Featuring…</> : "Confirm & feature"}
                        </Button>
                    </DialogFooter>
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
