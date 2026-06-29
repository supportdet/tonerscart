import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
    Search, FileText, Package, Wallet, UserRound, LogOut, ShieldCheck,
    Landmark, Building2, Loader2, ArrowRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import procApi, { formatApiError } from "../lib/procApi";
import { useProcAuth } from "../context/ProcAuthContext";
import SearchCompare from "../components/procurement/SearchCompare";
import MyQuotations from "../components/procurement/MyQuotations";
import MyOrders from "../components/procurement/MyOrders";
import CreditSummaryWidget from "../components/procurement/CreditSummaryWidget";
import AgreementGate from "../components/AgreementGate";
import PageMeta from "../components/PageMeta";

const procAgreementStatus = () => procApi.get("/procurement/agreement").then((r) => r.data);
const procAgreementAccept = () => procApi.post("/procurement/agreement/accept").then(() => {});

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const SECTIONS = [
    { key: "search", label: "Search & Compare", icon: Search },
    { key: "quotations", label: "My Quotations", icon: FileText },
    { key: "orders", label: "My Orders", icon: Package },
    { key: "credit", label: "Credit Account", icon: Wallet },
    { key: "profile", label: "Profile", icon: UserRound },
];

export default function ProcurementDashboard() {
    const navigate = useNavigate();
    const { user, logout, setUser } = useProcAuth();
    const [section, setSection] = useState("credit");
    const [phone, setPhone] = useState(user?.phone || "");
    const [address, setAddress] = useState(user?.address || "");
    const [saving, setSaving] = useState(false);

    if (!user) return null;
    const isGovt = user.type === "govt";
    const limit = Number(user.credit_limit || 0);
    const used = Number(user.credit_used || 0);
    const available = Math.max(0, limit - used);
    const usedPct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    const onLogout = () => { logout(); navigate("/procurement/login"); };

    // After an order is placed: jump to My Orders and refresh credit usage.
    const onOrdered = async () => {
        setSection("orders");
        try {
            const { data } = await procApi.get("/procurement/me");
            setUser(data);
        } catch { /* non-blocking */ }
    };

    const saveProfile = async () => {
        setSaving(true);
        try {
            const { data } = await procApi.patch("/procurement/me", { phone, address });
            setUser(data);
            toast.success("Profile updated");
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    return (
        <div className="min-h-screen bg-[#F5F5F7]" data-testid="procurement-dashboard">
            <PageMeta title="Procurement Dashboard — TonersCart" />
            <AgreementGate ready={!!user} statusFn={procAgreementStatus} acceptFn={procAgreementAccept} />
            {/* Top bar */}
            <div className="bg-[#0B1220] text-white">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link to="/" className="shrink-0 bg-white rounded-md px-2 py-1 hover:opacity-90 transition" data-testid="proc-home-logo" aria-label="TonersCart home">
                            <img src="/TONERSCART-bg.png" alt="TonersCart" className="h-6 w-auto" />
                        </Link>
                        <span className="hidden sm:block w-px h-7 bg-white/15" />
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-white/10 grid place-items-center shrink-0">
                                {isGovt ? <Landmark size={16} className="text-[#F7C600]" /> : <Building2 size={16} className="text-[#F7C600]" />}
                            </div>
                            <div className="min-w-0">
                                <div className="text-[14px] font-semibold truncate" style={{ fontFamily: "'Montserrat', sans-serif" }} data-testid="proc-org-name">{user.org_name}</div>
                                <div className="text-[11px] text-white/55 flex items-center gap-1.5">
                                    <ShieldCheck size={11} className="text-[#3DD68C]" /> {isGovt ? "Government" : "Corporate"} · Approved
                                </div>
                            </div>
                        </div>
                    </div>
                    <button onClick={onLogout} className="inline-flex items-center gap-1.5 text-[13px] text-white/70 hover:text-white px-3 h-9 rounded-lg hover:bg-white/10" data-testid="proc-logout-btn">
                        <LogOut size={15} /> Logout
                    </button>
                </div>
            </div>

            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 grid lg:grid-cols-[230px_1fr] gap-6">
                {/* Side nav */}
                <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible" data-testid="proc-nav">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.key}
                            onClick={() => setSection(s.key)}
                            className={`flex items-center gap-2.5 px-3.5 h-11 rounded-xl text-[13.5px] font-medium whitespace-nowrap transition ${section === s.key ? "bg-white text-[#0A0A0B] shadow-sm" : "text-[#6E6E73] hover:bg-white/60"}`}
                            data-testid={`proc-nav-${s.key}`}
                        >
                            <s.icon size={16} /> {s.label}
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <div className="min-w-0">
                    {section === "search" && <SearchCompare onQuoted={() => setSection("quotations")} />}
                    {section === "quotations" && <MyQuotations active={section === "quotations"} onOrdered={onOrdered} />}
                    {section === "orders" && <MyOrders active={section === "orders"} isGovt={isGovt} />}

                    {section === "credit" && (
                        <div className="space-y-5" data-testid="proc-credit-section">
                            <h2 className="text-[20px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Credit account</h2>
                            {limit <= 0 ? (
                                <div className="tc-card-flat p-6" data-testid="proc-credit-unset">
                                    <Wallet className="text-[#00B7C7] mb-3" size={26} />
                                    <div className="text-[15px] font-semibold text-[#0A0A0B]">Your credit limit is being set up</div>
                                    <p className="text-[13px] text-[#6E6E73] mt-1.5 max-w-md">The TonersCart team assigns a credit limit after account review. You&apos;ll see your limit, usage and due dates here once it&apos;s active.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="tc-card-flat p-5" data-testid="proc-credit-limit">
                                            <div className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Credit limit</div>
                                            <div className="mt-1.5 text-[24px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}>{inr(limit)}</div>
                                        </div>
                                        <div className="tc-card-flat p-5" data-testid="proc-credit-used">
                                            <div className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Used</div>
                                            <div className="mt-1.5 text-[24px] font-semibold text-amber-600" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}>{inr(used)}</div>
                                        </div>
                                        <div className="tc-card-flat p-5" data-testid="proc-credit-available">
                                            <div className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Available</div>
                                            <div className="mt-1.5 text-[24px] font-semibold text-emerald-600" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}>{inr(available)}</div>
                                        </div>
                                    </div>
                                    <div className="tc-card-flat p-5">
                                        <div className="flex items-center justify-between text-[12px] text-[#6E6E73] mb-2">
                                            <span>Credit utilisation</span><span>{usedPct}%</span>
                                        </div>
                                        <div className="h-2.5 rounded-full bg-black/[0.06] overflow-hidden">
                                            <div className="h-full rounded-full bg-[#00B7C7]" style={{ width: `${usedPct}%` }} />
                                        </div>
                                    </div>
                                    {/* Phase 3 — Outstanding, next due, ledger */}
                                    <CreditSummaryWidget />
                                </>
                            )}
                        </div>
                    )}

                    {section === "profile" && (
                        <div className="space-y-5" data-testid="proc-profile-section">
                            <h2 className="text-[20px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Profile</h2>
                            <div className="tc-card-flat p-6 grid sm:grid-cols-2 gap-x-8 gap-y-4 text-[13.5px]">
                                {[
                                    ["Type", isGovt ? "Government" : "Corporate"],
                                    ["Contact name", user.name],
                                    ["Designation", user.designation],
                                    [isGovt ? "Department" : "Company", user.org_name],
                                    ...(isGovt ? [["Ministry / State", user.ministry_state], ["Employee ID", user.employee_id]] : [["GST number", user.gst_number]]),
                                    ["Email", user.email],
                                ].map(([k, v]) => (
                                    <div key={k}>
                                        <div className="text-[11px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">{k}</div>
                                        <div className="text-[#0A0A0B] mt-0.5 break-words">{v || "—"}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="tc-card-flat p-6 space-y-4">
                                <div className="text-[13px] font-semibold text-[#0A0A0B]">Editable contact details</div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div><Label className="text-[12.5px]">Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" data-testid="proc-profile-phone" /></div>
                                    <div><Label className="text-[12.5px]">Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" data-testid="proc-profile-address" /></div>
                                </div>
                                <Button onClick={saveProfile} disabled={saving} className="btn-cta inline-flex items-center gap-2" data-testid="proc-profile-save">
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <>Save changes <ArrowRight size={14} /></>}
                                </Button>
                                <p className="text-[11.5px] text-[#86868B] pt-1">PAN and formal company details will be added post-incorporation.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
