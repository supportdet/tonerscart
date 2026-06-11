import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { PackageSearch, CheckCircle2, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReturnPolicyBox from "../components/ReturnPolicyBox";
import BuyerGSTCard from "../components/BuyerGSTCard";

const STATUS_STYLE = {
    requested: "bg-amber-50 text-amber-700 border-amber-200",
    accepted: "bg-blue-50 text-blue-700 border-blue-200",
    shipped: "bg-violet-50 text-violet-700 border-violet-200",
    delivered: "bg-teal-50 text-teal-700 border-teal-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABEL = {
    requested: "Requested",
    accepted: "Confirmed",
    shipped: "Dispatched",
    delivered: "Delivered",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
};

// Customer-facing progress timeline. The 4 happy-path stages; "completed" is the
// terminal success state (shown as a filled Delivered + a "Completed" chip).
const TIMELINE = [
    { key: "requested", label: "Requested" },
    { key: "accepted", label: "Confirmed" },
    { key: "shipped", label: "Dispatched" },
    { key: "delivered", label: "Delivered" },
];
const STAGE_INDEX = { requested: 0, accepted: 1, shipped: 2, delivered: 3, completed: 4 };

function OrderTimeline({ status }) {
    if (status === "rejected" || status === "cancelled") return null;
    const current = STAGE_INDEX[status] ?? 0;
    return (
        <div className="mt-4 flex items-center" data-testid="order-timeline">
            {TIMELINE.map((s, i) => {
                const done = i <= current;
                return (
                    <React.Fragment key={s.key}>
                        <div className="flex flex-col items-center gap-1.5 min-w-0">
                            <div className={`w-3 h-3 rounded-full border-2 ${done ? "bg-emerald-500 border-emerald-500" : "bg-white border-[#D2D2D7]"}`} data-testid={`timeline-dot-${s.key}`} />
                            <span className={`text-[10px] font-semibold tracking-wide ${done ? "text-emerald-700" : "text-[#A1A1A6]"}`}>{s.label}</span>
                        </div>
                        {i < TIMELINE.length - 1 && (
                            <div className={`flex-1 h-[2px] mx-1 mb-4 ${i < current ? "bg-emerald-500" : "bg-[#E5E5EA]"}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

export default function CustomerDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addItem } = useCart();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reorderingId, setReorderingId] = useState(null);

    const load = async () => {
        try { const r = await api.get("/orders/mine"); setOrders(Array.isArray(r.data) ? r.data : []); }
        catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const confirmReceived = async (orderId) => {
        if (!window.confirm("Confirm that you have received this order? This will complete the order.")) return;
        try {
            await api.put(`/orders/${orderId}/status`, { status: "completed" });
            toast.success("Thanks for confirming — order completed!");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const reorder = async (order) => {
        const listingId = order.listings?.id || order.listing_id;
        if (!listingId) { toast.error("Cannot reorder — product not found"); return; }
        setReorderingId(order.id);
        try {
            const { data } = await api.get(`/listings/${listingId}`);
            const product = {
                id: data.id,
                kind: "toner",
                price: data.price,
                stock: data.stock,
                brand: data.brand,
                model_number: data.model_number,
                color: data.color,
                toner_type: data.toner_type,
                image_url: data.image_url,
                supplier_id: data.supplier_id,
                supplier_name: data.supplier_name,
                city: data.supplier_city || data.city,
                gst_rate: data.gst_rate ?? 18,
            };
            addItem(product, order.qty || 1);
            toast.success("Added to cart");
            navigate("/cart");
        } catch (e) {
            const status = e?.response?.status;
            if (status === 404) toast.error("This product is no longer available");
            else if (status === 410) toast.error(e?.response?.data?.detail || "Out of stock");
            else toast.error(formatApiError(e));
        } finally {
            setReorderingId(null);
        }
    };

    return (
        <div className="tc-container py-8 sm:py-10" data-testid="customer-dashboard">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Buyer dashboard</div>
                    <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                        Hello {user?.name}
                    </h1>
                    <div className="text-[14px] text-[#6E6E73] mt-1">{user?.city || "India"}</div>
                </div>
                <Button className="btn-cta" onClick={() => navigate("/search")} data-testid="customer-browse-btn">Browse toners</Button>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6 sm:mt-8">
                {[
                    { k: "Total", v: orders.length },
                    { k: "In progress", v: orders.filter(o => ["requested", "accepted", "shipped"].includes(o.status)).length },
                    { k: "Delivered", v: orders.filter(o => o.status === "delivered").length },
                ].map((s) => (
                    <div key={s.k} className="tc-card-flat p-4">
                        <div className="font-mono text-2xl font-semibold text-[#0A0A0B]">{s.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73] mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            <div className="mt-5">
                <BuyerGSTCard />
            </div>

            <h2 className="text-[#0A0A0B] mt-10 mb-3" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 500 }}>My orders</h2>
            {loading ? (
                <div className="space-y-3" data-testid="customer-orders-skeleton">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="tc-card-flat p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-2/3" />
                                    <Skeleton className="h-3 w-1/3" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-16" />
                                    <Skeleton className="h-6 w-24" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="tc-card-flat p-12 text-center" data-testid="customer-empty-state">
                    <PackageSearch className="mx-auto text-[#D2D2D7]" size={42} />
                    <div className="font-semibold text-[#0A0A0B] mt-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>No orders yet</div>
                    <div className="text-[13px] text-[#6E6E73] mt-1">Search for a toner model and send your first order request.</div>
                </div>
            ) : (
                <div className="space-y-3" data-testid="customer-orders-list">
                    {orders.map((o) => (
                        <div key={o.id} className="tc-card-flat p-4 sm:p-5" data-testid={`customer-order-row-${o.id}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[#86868B]" data-testid={`order-number-${o.id}`}>{o.order_number || `Order #${(o.id || "").slice(0, 8).toUpperCase()}`}</div>
                                    <div className="font-mono font-semibold text-[#0A0A0B] text-[15px]">{o.listings?.brand} · {o.listings?.model_number || "—"}</div>
                                    <div className="text-[11.5px] text-[#86868B] mt-0.5">{o.listings?.toner_type || ""} · Qty {o.qty}</div>
                                    <div className="text-[12px] text-[#3a3a40] mt-1">Seller: <span className="font-semibold text-[#0A0A0B]">{o.suppliers?.business_name || "—"}</span>{o.suppliers?.city ? ` · ${o.suppliers.city}` : ""}</div>
                                    {(o.status === "shipped" || o.status === "delivered" || o.status === "completed") && (o.courier_name || o.tracking_number) && (
                                        <div className="text-[11.5px] text-[#3a3a40] mt-1" data-testid={`order-shipping-${o.id}`}>
                                            {o.courier_name && <span>Courier: <span className="font-semibold text-[#0A0A0B]">{o.courier_name}</span></span>}
                                            {o.courier_name && o.tracking_number && <span> · </span>}
                                            {o.tracking_number && <span className="font-mono">Tracking: {o.tracking_number}</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className={`text-[10.5px] font-bold px-2 py-1 rounded-md border uppercase tracking-[0.08em] ${STATUS_STYLE[o.status] || STATUS_STYLE.cancelled}`} data-testid={`order-status-${o.id}`}>{STATUS_LABEL[o.status] || o.status}</span>
                                    <div className="font-mono font-bold text-[18px] text-[#0A0A0B] mt-2">₹{Number(o.total).toLocaleString('en-IN')}</div>
                                    <div className="text-[10.5px] text-[#86868B] mt-0.5" data-testid={`order-price-locked-${o.id}`}>Price locked at order time</div>
                                </div>
                            </div>

                            <OrderTimeline status={o.status} />

                            {/* GST invoice block */}
                            {(o.buyer_gst_number || o.suppliers?.gst_number) && (
                                <div className="mt-3 bg-[#F4F4F6] border border-black/[0.04] rounded-[10px] p-3 text-[12px]" data-testid={`order-gst-${o.id}`}>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {o.buyer_gst_number && (
                                            <div><span className="text-[#86868B]">Buyer GST</span><div className="font-mono font-semibold text-[#0A0A0B]">{o.buyer_gst_number}</div></div>
                                        )}
                                        {o.suppliers?.gst_number && (
                                            <div><span className="text-[#86868B]">Seller GST</span><div className="font-mono font-semibold text-[#0A0A0B]">{o.suppliers.gst_number}</div></div>
                                        )}
                                    </div>
                                    <div className="text-[10.5px] text-[#6E6E73] mt-1.5">GST invoice to be issued by seller directly. TonersCart is a marketplace platform.</div>
                                </div>
                            )}

                            <ReturnPolicyBox className="mt-4" />

                            {o.status === "shipped" && (
                                <div className="mt-3 text-[12px] text-[#6E6E73] bg-[#F4F4F6] border border-black/[0.04] rounded-[10px] px-3 py-2.5" data-testid={`awaiting-delivery-${o.id}`}>
                                    Your order is on the way. You will be asked to confirm receipt once the seller marks it delivered.
                                </div>
                            )}

                            {o.status === "delivered" && (
                                <button
                                    onClick={() => confirmReceived(o.id)}
                                    className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold transition"
                                    data-testid={`confirm-received-${o.id}`}
                                >
                                    <CheckCircle2 size={15} /> Confirm you received your order
                                </button>
                            )}

                            {(o.status === "completed" || o.status === "delivered" || o.status === "cancelled") && (
                                <button
                                    onClick={() => reorder(o)}
                                    disabled={reorderingId === o.id}
                                    className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-[#FFF8E0] text-[#0A0A0B] border border-[#F5C400] text-[13px] font-semibold transition disabled:opacity-60"
                                    data-testid={`reorder-${o.id}`}
                                >
                                    <RotateCcw size={14} /> {reorderingId === o.id ? "Adding…" : "Reorder this product"}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
