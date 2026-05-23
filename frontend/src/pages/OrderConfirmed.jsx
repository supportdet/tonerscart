import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, MessageCircle, Package, MapPin, User, Clock, FileText } from "lucide-react";
import api from "../lib/api";
import ReturnPolicyBox from "../components/ReturnPolicyBox";

/** Dedicated order confirmation screen.
 *  Navigated to as `/order-confirmed/:id` (or `/order-confirmed?id=...`).
 *  The placing screen passes the order via React Router state for an
 *  instant render; we still re-fetch from `/orders/mine` for the
 *  authoritative copy (and to populate any field the placing screen
 *  didn't have, like GST joins). */
export default function OrderConfirmed() {
    const { id: idParam } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const passed = location.state?.order;
    const [order, setOrder] = useState(passed || null);
    const [loading, setLoading] = useState(!passed);

    const queryId = new URLSearchParams(location.search).get("id");
    const orderId = idParam || passed?.id || queryId;

    useEffect(() => {
        if (!orderId) return;
        let mounted = true;
        (async () => {
            try {
                const { data } = await api.get("/orders/mine");
                const match = (Array.isArray(data) ? data : []).find((o) => o.id === orderId);
                if (mounted && match) setOrder(match);
            } catch (_e) {
                // best-effort enrichment; passed state still renders
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [orderId]);

    if (!orderId) {
        return (
            <div className="tc-container py-16 max-w-xl text-center" data-testid="order-confirmed-missing">
                <p className="text-[14px] text-[#6E6E73]">No order reference provided.</p>
                <button onClick={() => navigate("/search")} className="btn-cta mt-4">Browse toners</button>
            </div>
        );
    }

    const shortId = String(orderId).slice(0, 8).toUpperCase();
    const brand = order?.listings?.brand || order?.brand || "";
    const model = order?.listings?.model_number || order?.model_number || "";
    const qty = order?.qty || 1;
    const total = order?.total ?? order?.unit_price ?? 0;
    const sellerBiz = order?.suppliers?.business_name || order?.supplier_name || "Seller";
    const sellerCity = order?.suppliers?.city || order?.supplier_city || "";
    const buyerGst = order?.buyer_gst_number;
    const sellerGst = order?.suppliers?.gst_number || order?.supplier_gst_number;

    const waText = `Hi, I just placed order #${shortId} on TonersCart and need help.`;
    const waHref = `https://wa.me/919742270585?text=${encodeURIComponent(waText)}`;

    return (
        <div className="bg-white min-h-[70vh]" data-testid="order-confirmed-page">
            <div className="tc-container py-12 sm:py-16 max-w-3xl">
                {/* Hero — animated green check */}
                <div className="flex flex-col items-center text-center">
                    <div className="tc-check-burst" data-testid="order-confirmed-check">
                        <CheckCircle2 size={48} className="text-white" strokeWidth={2.2} />
                    </div>
                    <div className="mt-5 text-[10px] tracking-[0.22em] uppercase font-semibold text-emerald-700">Order placed</div>
                    <h1 className="mt-3 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                        Your order is confirmed
                    </h1>
                    <p className="mt-2 text-[14.5px] text-[#6E6E73] max-w-lg">
                        Your seller will contact you within 24 hours.
                    </p>
                    <div className="mt-4 font-mono text-[12px] text-[#86868B]" data-testid="order-confirmed-id">
                        Order ID <span className="font-bold text-[#0A0A0B] tracking-wider">#{shortId}</span>
                    </div>
                </div>

                {/* Summary card */}
                {loading && !order ? (
                    <div className="mt-10 tc-card-flat p-8 text-center text-[#6E6E73]" data-testid="order-confirmed-loading">Loading order…</div>
                ) : (
                    <div className="mt-10 tc-card-flat p-5 sm:p-7" data-testid="order-confirmed-summary">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Info icon={Package} label="Product" value={brand && model ? `${brand} · ${model}` : "—"} testid="oc-product" />
                            <Info icon={FileText} label="Quantity" value={String(qty)} testid="oc-qty" />
                            <Info icon={User}   label="Seller" value={sellerCity ? `${sellerBiz} · ${sellerCity}` : sellerBiz} testid="oc-seller" />
                            <Info icon={MapPin} label="Delivery" value={order?.delivery_address || "—"} testid="oc-address" />
                        </div>

                        <div className="mt-5 pt-5 border-t border-black/[0.06] flex items-end justify-between flex-wrap gap-2">
                            <div>
                                <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">Total</div>
                                <div className="font-mono text-[28px] font-bold text-[#0A0A0B] leading-none mt-1">₹{Number(total).toLocaleString("en-IN")}</div>
                                <div className="text-[11px] text-[#86868B] mt-1" data-testid="oc-price-locked">Price locked at order time</div>
                            </div>
                            <div className="inline-flex items-center gap-2 text-[12.5px] text-[#3a3a40]" data-testid="oc-dispatch-eta">
                                <Clock size={13} className="text-[#00B7C7]" /> Dispatch within 2 business days
                            </div>
                        </div>

                        {(buyerGst || sellerGst) && (
                            <div className="mt-5 bg-[#F4F4F6] border border-black/[0.04] rounded-[10px] p-3 text-[12px]" data-testid="oc-gst">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {buyerGst && <div><span className="text-[#86868B]">Buyer GST</span><div className="font-mono font-semibold text-[#0A0A0B]">{buyerGst}</div></div>}
                                    {sellerGst && <div><span className="text-[#86868B]">Seller GST</span><div className="font-mono font-semibold text-[#0A0A0B]">{sellerGst}</div></div>}
                                </div>
                                <div className="text-[10.5px] text-[#6E6E73] mt-1.5">GST invoice to be issued by seller directly. TonersCart is a marketplace platform.</div>
                            </div>
                        )}
                    </div>
                )}

                {/* CTA row */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#25D366] hover:bg-[#1FB855] text-white font-semibold text-[14px] transition" data-testid="oc-whatsapp-btn">
                        <MessageCircle size={16} /> Chat with support
                    </a>
                    <Link to="/customer" className="btn-cta inline-flex items-center justify-center gap-2 h-12" data-testid="oc-track-btn">
                        Track your order
                    </Link>
                </div>

                <div className="mt-6">
                    <ReturnPolicyBox />
                </div>
            </div>
        </div>
    );
}

function Info({ icon: Icon, label, value, testid }) {
    return (
        <div data-testid={testid}>
            <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">
                <Icon size={11} className="text-[#00B7C7]" /> {label}
            </div>
            <div className="mt-1 text-[14px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.005em" }}>
                {value || "—"}
            </div>
        </div>
    );
}
