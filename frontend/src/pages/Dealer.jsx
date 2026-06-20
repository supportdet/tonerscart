import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Search as SearchIcon, Lock, ShoppingCart, ShieldCheck, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageMeta from "../components/PageMeta";
import TonerCartridge from "../components/TonerCartridge";
import OrderRequestDialog from "../components/OrderRequestDialog";
import VerifiedBadge from "../components/VerifiedBadge";

const ACCENT = "#607d8b";

function fmtINR(n) { return `₹${Number(n || 0).toLocaleString("en-IN")}`; }

function D2DCard({ kind, p, onBuy }) {
    const list = Number(p.price ?? p.price_per_ream ?? 0);
    const d2d = Number(p.d2d_price ?? 0);
    const savings = d2d && list ? Math.max(0, list - d2d) : 0;
    const detailHref = `/d2d/${kind}/${p.id}`;
    const title = kind === "paper"
        ? `${p.brand} · ${p.size} · ${p.gsm} GSM`
        : `${p.brand} ${p.model_number}`;

    return (
        <div className="tc-product-card relative" data-testid={`d2d-${kind}-card-${p.id}`}>
            <div className="absolute top-3 left-3 z-10">
                <span
                    className="inline-block text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded-md text-white"
                    style={{ background: ACCENT }}
                >
                    D2D Price
                </span>
            </div>
            <Link to={detailHref} className="tc-product-img block">
                <span className="tc-product-img-label">{p.brand}</span>
                {p.image_url && kind === "printer" ? (
                    <img src={p.image_url} alt={title} className="w-full h-full object-cover" loading="lazy" />
                ) : kind === "toner" ? (
                    <TonerCartridge color={p.color || "Black"} brand={p.brand} model={p.model_number} type={p.toner_type || "Original"} />
                ) : (
                    <div className="w-full h-full grid place-items-center" style={{ background: "linear-gradient(180deg,#FAFAFB,#F0F0F2)" }}>
                        <div className="text-center">
                            <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#86868B] mb-1">{p.size || ""}</div>
                            <div className="text-[26px] font-bold text-[#0A0A0B]">{p.gsm || "—"}<span className="text-[12px] font-medium text-[#86868B] ml-0.5">GSM</span></div>
                        </div>
                    </div>
                )}
            </Link>
            <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{p.brand}</div>
                <Link to={detailHref} className="font-mono text-[17px] font-semibold text-[#0A0A0B] tracking-tight hover:text-[#00B7C7] transition truncate">{title}</Link>
                <div className="text-[12.5px] text-[#1D1D1F] truncate flex items-center gap-1.5" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                    <span className="truncate">{p.supplier_name || (p.suppliers && p.suppliers.business_name) || "—"}</span>
                    <VerifiedBadge compact />
                </div>
                <div className="text-[12px] text-[#6E6E73] flex items-center gap-1">
                    <MapPin size={11} /> {p.supplier_city || p.city || "—"}
                </div>
                <div className="mt-2 pt-3 border-t border-black/[0.05]">
                    <div className="text-[10px] tracking-[0.14em] uppercase font-semibold" style={{ color: ACCENT }}>D2D Price</div>
                    <div className="flex items-end gap-2">
                        <div className="font-mono text-[20px] font-semibold text-[#0A0A0B]">{fmtINR(d2d)}</div>
                        {list > 0 && d2d < list && (
                            <div className="text-[12px] text-[#86868B] line-through pb-0.5">{fmtINR(list)}</div>
                        )}
                    </div>
                    {savings > 0 && <div className="text-[11.5px] text-emerald-600 font-medium mt-0.5">Save {fmtINR(savings)}</div>}
                    <button
                        onClick={() => onBuy(kind, p)}
                        className="mt-3 w-full h-10 rounded-xl text-[13px] font-semibold text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                        style={{ background: ACCENT }}
                        disabled={p.stock != null && p.stock <= 0}
                        data-testid={`d2d-order-${kind}-${p.id}`}
                    >
                        <ShoppingCart size={13} /> {p.stock != null && p.stock <= 0 ? "Out of stock" : "Place D2D order"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Section({ title, kind, items, onBuy }) {
    if (!items.length) return null;
    return (
        <section className="mb-10" data-testid={`d2d-section-${kind}`}>
            <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-[18px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{title}</h2>
                <div className="text-[12px] text-[#86868B]">{items.length} listing{items.length === 1 ? "" : "s"}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((p) => <D2DCard key={p.id} kind={kind} p={p} onBuy={onBuy} />)}
            </div>
        </section>
    );
}

function VerificationGate({ status, user }) {
    const reason = status?.reason;
    // Default copy assumes the visitor is signed in but their account isn't
    // approved-as-dealer yet (the most common case among logged-in viewers).
    let title = "Apply to access dealer-to-dealer pricing";
    let body = "Only verified dealers on TonersCart can view and purchase at D2D rates. Submit the dealer application — approval typically takes under 24 hours.";
    let cta = { to: "/sell", label: "Apply to become a dealer" };
    let showSignInHint = false;

    if (reason === "guest" || !user) {
        // Truly logged-out visitor.
        title = "Sign in to view the dealer-to-dealer marketplace";
        body = "Approved dealers see exclusive D2D pricing across India. Sign in with your dealer account, or apply for free to get verified.";
        cta = { to: "/login?next=/dealer", label: "Sign in" };
        showSignInHint = false; // CTA already says Sign in
    } else if (reason === "not_approved") {
        title = "Your dealer application is pending review";
        body = "We're reviewing your dealer application. You'll receive an email once approved (typically within 24 hours).";
        cta = { to: "/supplier", label: "Open dealer dashboard" };
    } else if (reason === "not_supplier" || reason === "no_supplier_record") {
        title = "Your account isn't a verified dealer yet";
        body = "You're signed in, but this account doesn't have a dealer profile. Apply once — get verified — buy from your peers at exclusive pricing.";
        cta = { to: "/sell", label: "Apply to become a dealer" };
    } else if (reason === "error") {
        title = "Couldn't verify your dealer status";
        body = "Something went wrong while checking your account. Please refresh in a moment — if this keeps happening contact support@tonerscart.com.";
        cta = { to: "/dealer", label: "Refresh & retry" };
    }

    return (
        <div className="tc-container max-w-[640px] py-16 sm:py-24">
            <div
                className="rounded-[24px] bg-white border border-black/[0.06] p-8 sm:p-12 text-center"
                style={{ boxShadow: "0 8px 40px -12px rgba(0,0,0,0.08)" }}
                data-testid="dealer-verification-gate"
            >
                <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-6" style={{ background: `${ACCENT}1A`, color: ACCENT }}>
                    <ShieldCheck size={22} />
                </div>
                <div className="tc-eyebrow mb-3" style={{ color: ACCENT }}>Verified dealers only</div>
                <h1 className="text-[#0A0A0B] mb-4" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 3.5vw, 32px)", fontWeight: 400, letterSpacing: "-0.02em" }}>
                    {title}
                </h1>
                <p className="text-[14.5px] text-[#6E6E73] leading-relaxed mb-7 max-w-[440px] mx-auto">{body}</p>
                <Link
                    to={cta.to}
                    className="inline-flex items-center justify-center h-12 px-7 rounded-xl text-[14px] font-semibold text-white"
                    style={{ background: ACCENT }}
                    data-testid="dealer-gate-cta"
                >
                    {cta.label}
                </Link>
                {/* Wave 57: only suggest "Sign in" when the visitor is actually
                    logged out. Showing this for already-signed-in dealers was
                    confusing — they thought the page was kicking them out. */}
                {showSignInHint && (
                    <div className="mt-6 text-[11.5px] text-[#86868B]">Already a dealer? <Link to="/login?next=/dealer" className="underline font-medium">Sign in</Link></div>
                )}
            </div>
        </div>
    );
}

export default function Dealer() {
    const { user, loading: authLoading } = useAuth();
    const [status, setStatus] = useState(null); // null = checking, {verified:bool,...}
    const [q, setQ] = useState("");
    const [data, setData] = useState({ toners: [], printers: [], papers: [] });
    const [loading, setLoading] = useState(false);
    const [order, setOrder] = useState(null); // {kind, p}

    // Verification check
    useEffect(() => {
        if (authLoading) return;
        // Don't flash the gate while the session is still being restored from
        // localStorage — wait for auth to fully resolve. If we end up logged
        // out, then show the guest gate. If logged in, hit /d2d/me; the
        // listings render only once we have a confirmed verified=true.
        if (!user) { setStatus({ verified: false, reason: "guest" }); return; }
        // Reset to "still checking" whenever user identity changes so the
        // spinner replaces any stale gate from a previous role.
        setStatus(null);
        let cancelled = false;
        api.get("/d2d/me", { timeout: 8000 })
            .then((r) => { if (!cancelled) setStatus(r.data); })
            .catch(() => { if (!cancelled) setStatus({ verified: false, reason: "error" }); });
        return () => { cancelled = true; };
    }, [user, authLoading]);

    // Listings fetch (only when verified)
    useEffect(() => {
        if (!status?.verified) return;
        let cancelled = false;
        setLoading(true);
        api.get("/d2d/listings", { params: { q: q || undefined } })
            .then((r) => { if (!cancelled) setData(r.data || { toners: [], printers: [], papers: [] }); })
            .catch(() => { if (!cancelled) setData({ toners: [], printers: [], papers: [] }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [status, q]);

    const onBuy = (kind, p) => {
        if (kind !== "toner") {
            toast.info("D2D orders for this product type are coming soon — contact dealer directly for now");
            return;
        }
        setOrder({ kind, p });
    };

    return (
        <>
            <PageMeta title="Dealer to Dealer · TonersCart" description="Exclusive dealer pricing across India's verified toner / printer / paper network." />
            <div className="min-h-[80vh] bg-[#F5F5F7] py-10 sm:py-14">
                {authLoading || status === null ? (
                    <div className="tc-container py-24 flex items-center justify-center text-[#86868B]">
                        <Loader2 size={18} className="animate-spin mr-2" /> Checking dealer status…
                    </div>
                ) : !status.verified ? (
                    <VerificationGate status={status} user={user} />
                ) : (
                    <div className="tc-container">
                        {/* Wave 58: back-to-dashboard link so dealers don't get stranded in
                            the D2D marketplace with no clear way home. */}
                        <Link
                            to="/supplier"
                            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6E6E73] hover:text-[#0A0A0B] mb-5 transition"
                            data-testid="dealer-back-to-dashboard"
                        >
                            <ArrowLeft size={14} /> Back to dealer dashboard
                        </Link>
                        <div className="mb-6 sm:mb-8">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-[0.18em] uppercase font-semibold mb-3" style={{ background: `${ACCENT}1A`, color: ACCENT }}>
                                <ShieldCheck size={11} /> Verified dealer · {status.business_name || "you"}
                            </div>
                            <h1 className="text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 400, letterSpacing: "-0.02em" }} data-testid="dealer-title">
                                Dealer to Dealer marketplace
                            </h1>
                            <p className="text-[14.5px] text-[#6E6E73] mt-2 max-w-[620px]">
                                Toners, printers and papers at exclusive D2D pricing from your peer dealers across India. Buyer-side pricing stays unchanged — only verified dealers see these rates.
                            </p>
                        </div>

                        <div className="mb-6 max-w-[520px]">
                            <div className="relative">
                                <SearchIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
                                <input
                                    type="text"
                                    placeholder="Search by brand or model — e.g. HP 88A"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    className="w-full h-12 pl-10 pr-3 rounded-2xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                    data-testid="dealer-search-input"
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="tc-product-card animate-pulse">
                                        <div className="tc-product-img bg-black/[0.04]" />
                                        <div className="p-4 space-y-2">
                                            <div className="h-3 bg-black/[0.06] rounded w-1/3" />
                                            <div className="h-5 bg-black/[0.08] rounded w-2/3" />
                                            <div className="h-4 bg-black/[0.06] rounded w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (data.toners.length + data.printers.length + data.papers.length === 0) ? (
                            <div className="tc-card-flat p-12 text-center" data-testid="dealer-empty">
                                <Lock size={22} className="mx-auto mb-2 text-[#86868B]" />
                                <div className="text-[15px] font-semibold text-[#0A0A0B] mb-1">No D2D listings yet</div>
                                <div className="text-[13px] text-[#6E6E73]">
                                    Dealers can enable D2D on any toner, printer or paper listing from their supplier dashboard.
                                </div>
                            </div>
                        ) : (
                            <>
                                <Section title="Toners" kind="toner" items={data.toners} onBuy={onBuy} />
                                <Section title="Printers" kind="printer" items={data.printers} onBuy={onBuy} />
                                <Section title="Papers" kind="paper" items={data.papers} onBuy={onBuy} />
                            </>
                        )}
                    </div>
                )}
            </div>

            {order && (
                <OrderRequestDialog
                    product={{ ...order.p, price: Number(order.p.d2d_price ?? order.p.price ?? 0) }}
                    initialQty={1}
                    onClose={() => setOrder(null)}
                />
            )}
        </>
    );
}
