import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, ShieldCheck, ShoppingCart, Loader2, Tag, AlertCircle, Building2, Phone } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageMeta from "../components/PageMeta";
import TonerCartridge from "../components/TonerCartridge";
import OrderRequestDialog from "../components/OrderRequestDialog";
import VerifiedBadge from "../components/VerifiedBadge";

const ACCENT = "#607d8b";

function fmtINR(n) { return `₹${Number(n || 0).toLocaleString("en-IN")}`; }

/**
 * Dedicated dealer-only product page reached from the D2D marketplace.
 *
 * Why this page exists separately from /toner/:id, /printer/:id, /paper/:id:
 *   • Shows WHOLESALE D2D pricing — never the customer-facing GST-inclusive
 *     price. Wrong pricing on the customer detail page risks dealers paying
 *     the retail figure.
 *   • Gated to verified (approved) suppliers via backend (403 for everyone
 *     else). The page also redirects guests to /login and non-dealers to the
 *     /dealer marketplace gate.
 *   • Dealer-specific copy: D2D terms, supplier identity (B2B trust signal),
 *     "Place dealer order" flow. The buy flow reuses OrderRequestDialog with
 *     a d2d=true hint so the backend can mark the order as a B2B txn.
 */
export default function D2DProductDetail() {
    const { kind, id } = useParams();
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [buyOpen, setBuyOpen] = useState(false);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            navigate(`/login?next=${encodeURIComponent(`/d2d/${kind}/${id}`)}`);
            return;
        }
        let cancelled = false;
        api.get(`/d2d/listing/${kind}/${id}`, { timeout: 10000 })
            .then((r) => { if (!cancelled) setData(r.data); })
            .catch((e) => { if (!cancelled) setErr(formatApiError(e) || "Unable to load D2D listing"); });
        return () => { cancelled = true; };
    }, [kind, id, user, authLoading, navigate]);

    if (authLoading || (!data && !err)) {
        return (
            <div className="tc-container py-16 text-center" data-testid="d2d-detail-loading">
                <Loader2 className="animate-spin mx-auto text-[#86868B]" size={28} />
                <p className="text-[13px] text-[#86868B] mt-3">Loading dealer pricing…</p>
            </div>
        );
    }

    if (err) {
        return (
            <div className="tc-container py-12 max-w-xl mx-auto" data-testid="d2d-detail-error">
                <PageMeta title="D2D listing — TonersCart" description="Dealer-to-dealer wholesale pricing on TonersCart." />
                <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6 text-center">
                    <AlertCircle className="mx-auto text-red-600 mb-2" size={24} />
                    <h2 className="text-[17px] font-semibold text-[#0A0A0B] mb-1">Can&apos;t open this D2D listing</h2>
                    <p className="text-[13px] text-[#6E6E73] mb-4">{err}</p>
                    <Link to="/dealer" className="tc-btn tc-btn-primary inline-flex items-center gap-1.5" data-testid="d2d-detail-back-link">
                        <ArrowLeft size={14} /> Back to D2D marketplace
                    </Link>
                </div>
            </div>
        );
    }

    const list = Number(data.price ?? data.price_per_ream ?? 0);
    const d2d = Number(data.d2d_price ?? 0);
    const savings = list && d2d ? Math.max(0, list - d2d) : 0;
    const savingsPct = list ? Math.round((savings / list) * 100) : 0;
    const gstRate = Number(data.gst_rate || 18);
    const d2dIncl = d2d ? Math.round(d2d * (1 + gstRate / 100)) : 0;

    const title = kind === "paper"
        ? `${data.brand} · ${data.size} · ${data.gsm} GSM`
        : `${data.brand} ${data.model_number}`;

    return (
        <div className="tc-container py-6 sm:py-10" data-testid="d2d-detail-page">
            <PageMeta title={`${title} — Dealer Price`} description={`Wholesale dealer-to-dealer pricing on TonersCart for ${title}.`} />

            <Link to="/dealer" className="inline-flex items-center gap-1.5 text-[12.5px] text-[#6E6E73] hover:text-[#0A0A0B] mb-4" data-testid="d2d-detail-back-link">
                <ArrowLeft size={14} /> All D2D listings
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Visual */}
                <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAFB] aspect-square overflow-hidden flex items-center justify-center relative">
                    <span
                        className="absolute top-4 left-4 inline-block text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1.5 rounded-md text-white"
                        style={{ background: ACCENT }}
                        data-testid="d2d-detail-badge"
                    >
                        D2D · Dealer Price
                    </span>
                    {kind === "printer" && data.image_url ? (
                        <img src={data.image_url} alt={title} className="w-full h-full object-contain p-6" />
                    ) : kind === "toner" ? (
                        <TonerCartridge color={data.color || "Black"} brand={data.brand} model={data.model_number} type={data.toner_type || "Original"} />
                    ) : (
                        <div className="text-center">
                            <div className="text-[12px] tracking-[0.18em] uppercase font-semibold text-[#86868B] mb-2">{data.size || "—"}</div>
                            <div className="text-[44px] font-bold text-[#0A0A0B]">{data.gsm || "—"}<span className="text-[16px] font-medium text-[#86868B] ml-1">GSM</span></div>
                        </div>
                    )}
                </div>

                {/* Detail */}
                <div>
                    <div className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#86868B] mb-1">{data.brand}</div>
                    <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-[#0A0A0B] leading-[1.15]" data-testid="d2d-detail-title">{title}</h1>

                    {/* Wholesale price block */}
                    <div className="mt-5 rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(96,125,139,0.08), rgba(96,125,139,0.02))", border: `1px solid ${ACCENT}33` }}>
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="font-mono text-[34px] font-bold text-[#0A0A0B]" data-testid="d2d-price-base">{fmtINR(d2d)}</span>
                            <span className="text-[12px] text-[#6E6E73]">base / per unit · excl. GST</span>
                        </div>
                        <div className="text-[13px] text-[#3a3a40] mt-1.5">
                            With {gstRate}% GST: <strong className="font-mono" data-testid="d2d-price-incl">{fmtINR(d2dIncl)}</strong>
                        </div>
                        {savings > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                                <span className="line-through text-[#86868B] font-mono" data-testid="d2d-list-price">{fmtINR(list)}</span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200 font-semibold" data-testid="d2d-savings">
                                    <Tag size={11} /> Save {fmtINR(savings)} ({savingsPct}% off list)
                                </span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => setBuyOpen(true)}
                            disabled={data.is_own_listing || Number(data.stock || 0) <= 0}
                            className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl text-white text-[14px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                            style={{ background: ACCENT }}
                            data-testid="d2d-place-order-btn"
                        >
                            <ShoppingCart size={16} />
                            {data.is_own_listing ? "Your own listing" : Number(data.stock || 0) <= 0 ? "Out of stock" : "Place dealer order"}
                        </button>
                    </div>

                    {/* Supplier identity (B2B trust block) */}
                    <div className="mt-5 rounded-xl border border-black/[0.06] bg-white p-4" data-testid="d2d-supplier-block">
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B] mb-2">Selling dealer</div>
                        <div className="flex items-center gap-2 text-[14px] font-semibold text-[#0A0A0B]">
                            <Building2 size={14} className="text-[#86868B]" />
                            <span data-testid="d2d-supplier-name">{data.supplier?.business_name || "—"}</span>
                            <VerifiedBadge />
                        </div>
                        <div className="mt-1.5 text-[12.5px] text-[#6E6E73] flex flex-wrap gap-x-4 gap-y-1">
                            {data.supplier?.city && <span className="inline-flex items-center gap-1"><MapPin size={11} />{data.supplier.city}{data.supplier?.state ? `, ${data.supplier.state}` : ""}</span>}
                            {data.supplier?.phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{data.supplier.phone}</span>}
                        </div>
                    </div>

                    {/* Spec grid */}
                    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                        <Spec label="Stock" value={`${data.stock ?? 0} units`} />
                        <Spec label="GST" value={`${gstRate}%`} />
                        {kind === "toner" && <Spec label="Toner type" value={data.toner_type || "—"} />}
                        {kind === "toner" && <Spec label="Page yield" value={data.page_yield ? `${data.page_yield} pages` : "—"} />}
                        {kind === "toner" && <Spec label="Suitable for" value={data.compatible_models || "—"} wide />}
                        {kind === "printer" && <Spec label="Type" value={data.category || "—"} />}
                        {kind === "printer" && <Spec label="Print speed" value={data.print_speed_ppm ? `${data.print_speed_ppm} ppm` : "—"} />}
                        {kind === "printer" && <Spec label="Connectivity" value={(data.connectivity || []).join(", ") || "—"} wide />}
                        {kind === "paper" && <Spec label="GSM" value={data.gsm || "—"} />}
                        {kind === "paper" && <Spec label="Reams / box" value={data.reams_per_box || "—"} />}
                    </div>

                    {/* D2D terms */}
                    <div className="mt-6 rounded-xl border border-black/[0.06] bg-[#FAFAFB] p-4 text-[12.5px] text-[#3a3a40] leading-relaxed" data-testid="d2d-terms-block">
                        <div className="flex items-center gap-1.5 mb-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>
                            <ShieldCheck size={14} className="text-[#607d8b]" /> Dealer-to-Dealer terms
                        </div>
                        <ul className="space-y-1.5 list-disc pl-5">
                            <li>D2D pricing is wholesale — applies only to approved TonersCart dealers. Re-sale to end customers is at your sole discretion.</li>
                            <li>GST is charged on top of the base D2D price; tax invoice is issued by the selling dealer.</li>
                            <li>Delivery charges, return policy and warranty are governed by the selling dealer&apos;s standard B2B terms.</li>
                            <li>TonersCart referral fee on D2D transactions is computed on the base price only — see <Link to="/terms" className="underline">Terms § 9 Referral Fee</Link>.</li>
                            <li>Disputes are routed through the platform&apos;s dealer-only grievance channel; standard customer return windows do not apply.</li>
                        </ul>
                    </div>
                </div>
            </div>

            {buyOpen && data && (
                <OrderRequestDialog
                    product={{
                        kind,
                        id: data.id,
                        title,
                        brand: data.brand,
                        model_number: data.model_number,
                        price: d2d,
                        gst_rate: gstRate,
                        stock: data.stock,
                        d2d: true,
                        supplier: data.supplier,
                    }}
                    onClose={() => setBuyOpen(false)}
                />
            )}
        </div>
    );
}

function Spec({ label, value, wide }) {
    return (
        <div className={wide ? "col-span-2" : ""}>
            <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">{label}</div>
            <div className="text-[13.5px] text-[#0A0A0B] mt-0.5">{value}</div>
        </div>
    );
}
