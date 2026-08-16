import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { PackageSearch, CheckCircle2, RotateCcw, MapPin, Truck, Store, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReturnPolicyBox from "../components/ReturnPolicyBox";
import BuyerGSTCard from "../components/BuyerGSTCard";

const STATUS_STYLE = {
    requested: "bg-emerald-50 text-emerald-700 border-emerald-200",
    accepted: "bg-blue-50 text-blue-700 border-blue-200",
    shipped: "bg-violet-50 text-violet-700 border-violet-200",
    delivered: "bg-teal-50 text-teal-700 border-teal-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABEL = {
    requested: "Confirmed · Paid",
    accepted: "Confirmed",
    shipped: "Dispatched",
    delivered: "Delivered",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
};

// Customer-facing progress timeline. Razorpay-paid orders skip the "Requested"
// stage entirely — a customer never sees pending, everything opens at Confirmed.
const TIMELINE = [
    { key: "accepted", label: "Confirmed" },
    { key: "shipped", label: "Dispatched" },
    { key: "delivered", label: "Delivered" },
];
const STAGE_INDEX = { requested: 0, accepted: 0, shipped: 1, delivered: 2, completed: 3 };

// Wave 105.7 — the customer paid `total + gst_amount + delivery_charge` at
// checkout (Razorpay). The dashboard MUST show this locked amount, not the
// GST-exclusive `total` column alone.
const paidTotal = (o) => {
    const base = Number(o?.total || 0);
    const gst = Number(o?.gst_amount || 0);
    const delivery = Number(o?.delivery_charge || 0);
    return Math.round((base + gst + delivery) * 100) / 100;
};

const formatOrderTime = (iso) => {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "—";
        const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
            .replace(/\s?am\b/i, " AM").replace(/\s?pm\b/i, " PM").trim();
        return `${date} · ${time}`;
    } catch { return "—"; }
};

const formatAddress = (o) => {
    const parts = [o.street_address, o.area, o.order_city, o.pincode, o.order_state].filter(Boolean);
    return parts.length ? parts.join(", ") : (o.delivery_address || "—");
};

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
                            <span className={`text-[10px] font-bold tracking-wide ${done ? "text-emerald-700" : "text-[#A1A1A6]"}`}>{s.label}</span>
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

// One row = one label + value pair. Uses an icon-first layout, min-width
// so the values in a card line up cleanly. Mobile stacks with the icon
// beside the value on a single line.
function DetailRow({ icon: Icon, label, children, testid }) {
    return (
        <div className="flex items-start gap-2.5" data-testid={testid}>
            <Icon size={14} className="shrink-0 mt-0.5 text-[#86868B]" />
            <div className="min-w-0 flex-1">
                <div className="text-[10.5px] tracking-[0.14em] uppercase font-bold text-[#86868B]">{label}</div>
                <div className="text-[13px] text-[#0A0A0B] font-semibold mt-0.5 leading-snug break-words">{children}</div>
            </div>
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
            {/* --- Header --- */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Buyer dashboard</div>
                    <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
                        Hello {user?.name}
                    </h1>
                    <div className="text-[14px] text-[#3a3a40] font-medium mt-1">{user?.city || "India"}</div>
                </div>
                <Button className="btn-cta" onClick={() => navigate("/search")} data-testid="customer-browse-btn">Browse toners</Button>
            </div>

            {/* --- Stat cards --- */}
            <div className="grid grid-cols-3 gap-3 mt-6 sm:mt-8">
                {[
                    { k: "Total", v: orders.length },
                    { k: "In progress", v: orders.filter(o => ["requested", "accepted", "shipped"].includes(o.status)).length },
                    { k: "Delivered", v: orders.filter(o => o.status === "delivered" || o.status === "completed").length },
                ].map((s) => (
                    <div key={s.k} className="tc-card-flat p-4">
                        <div className="font-mono text-2xl font-bold text-[#0A0A0B]">{s.v}</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase font-bold text-[#3a3a40] mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            <div className="mt-5">
                <BuyerGSTCard />
            </div>

            <h2 className="text-[#0A0A0B] mt-10 mb-3" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: 700 }}>My orders</h2>

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
                    <div className="font-bold text-[#0A0A0B] mt-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>No orders yet</div>
                    <div className="text-[13px] text-[#3a3a40] font-medium mt-1">Search for a toner model and pay online — your order will appear here.</div>
                </div>
            ) : (
                <div className="space-y-3" data-testid="customer-orders-list">
                    {orders.map((o) => {
                        const total = paidTotal(o);
                        const brand = o.listings?.brand || o.product_brand || "";
                        const model = o.listings?.model_number || o.product_model || "—";
                        const dealer = o.suppliers?.business_name || "—";
                        const dealerCity = o.suppliers?.city || "";
                        const isShipped = o.status === "shipped" || o.status === "delivered" || o.status === "completed";
                        return (
                            <div key={o.id} className="tc-card-flat p-4 sm:p-5" data-testid={`customer-order-row-${o.id}`}>
                                {/* Row 1 — order number + status */}
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <div className="text-[10.5px] tracking-[0.16em] uppercase font-bold text-[#86868B]" data-testid={`order-number-${o.id}`}>
                                            {o.order_number || `Order #${(o.id || "").slice(0, 8).toUpperCase()}`}
                                        </div>
                                        <div className="mt-1 text-[17px] font-bold text-[#0A0A0B] leading-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                            {brand} · {model}
                                        </div>
                                        <div className="text-[11.5px] text-[#3a3a40] font-semibold mt-0.5">
                                            {o.listings?.toner_type || ""}
                                            {o.listings?.toner_type ? " · " : ""}Qty {o.qty}
                                        </div>
                                    </div>
                                    <span
                                        className={`text-[10.5px] font-bold px-2.5 py-1 rounded-md border uppercase tracking-[0.08em] whitespace-nowrap ${STATUS_STYLE[o.status] || STATUS_STYLE.cancelled}`}
                                        data-testid={`order-status-${o.id}`}
                                    >
                                        {STATUS_LABEL[o.status] || o.status}
                                    </span>
                                </div>

                                {/* Row 2 — details grid: date, dealer, address, tracking */}
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                                    <DetailRow icon={Clock} label="Placed" testid={`order-placed-${o.id}`}>
                                        {formatOrderTime(o.created_at)}
                                    </DetailRow>
                                    <DetailRow icon={Store} label="Dealer" testid={`order-dealer-${o.id}`}>
                                        {dealer}{dealerCity ? ` · ${dealerCity}` : ""}
                                    </DetailRow>
                                    <DetailRow icon={MapPin} label="Delivery" testid={`order-address-${o.id}`}>
                                        {formatAddress(o)}
                                    </DetailRow>
                                    {isShipped && (o.courier_name || o.tracking_number) ? (
                                        <DetailRow icon={Truck} label="Tracking" testid={`order-shipping-${o.id}`}>
                                            {o.courier_name && <span>{o.courier_name}</span>}
                                            {o.courier_name && o.tracking_number && <span className="mx-1 text-[#86868B]">·</span>}
                                            {o.tracking_number && <span className="font-mono">{o.tracking_number}</span>}
                                        </DetailRow>
                                    ) : null}
                                </div>

                                {/* Row 3 — total paid */}
                                <div className="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-3">
                                    <div>
                                        <div className="text-[10.5px] tracking-[0.14em] uppercase font-bold text-[#86868B]">Total paid</div>
                                        <div className="text-[10.5px] text-[#3a3a40] font-medium mt-0.5" data-testid={`order-price-locked-${o.id}`}>
                                            Locked at checkout · incl. GST{Number(o.delivery_charge || 0) > 0 ? " + delivery" : ""}
                                        </div>
                                    </div>
                                    <div className="font-mono font-bold text-[22px] text-[#0A0A0B]" data-testid={`order-total-paid-${o.id}`}>
                                        ₹{total.toLocaleString("en-IN")}
                                    </div>
                                </div>

                                <OrderTimeline status={o.status} />

                                {/* GST invoice block */}
                                {(o.buyer_gst_number || o.suppliers?.gst_number) && (
                                    <div className="mt-4 bg-[#F4F4F6] border border-black/[0.04] rounded-[10px] p-3 text-[12px]" data-testid={`order-gst-${o.id}`}>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {o.buyer_gst_number && (
                                                <div><span className="text-[#86868B] font-semibold">Buyer GST</span><div className="font-mono font-bold text-[#0A0A0B]">{o.buyer_gst_number}</div></div>
                                            )}
                                            {o.suppliers?.gst_number && (
                                                <div><span className="text-[#86868B] font-semibold">Seller GST</span><div className="font-mono font-bold text-[#0A0A0B]">{o.suppliers.gst_number}</div></div>
                                            )}
                                        </div>
                                        <div className="text-[10.5px] text-[#3a3a40] font-medium mt-1.5">GST invoice to be issued by seller directly. TonersCart is a marketplace platform.</div>
                                    </div>
                                )}

                                <ReturnPolicyBox className="mt-4" />

                                {o.status === "shipped" && (
                                    <div className="mt-3 text-[12px] text-[#3a3a40] font-medium bg-[#F4F4F6] border border-black/[0.04] rounded-[10px] px-3 py-2.5" data-testid={`awaiting-delivery-${o.id}`}>
                                        Your order is on the way. You&apos;ll be asked to confirm receipt once it&apos;s marked delivered.
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
                        );
                    })}
                </div>
            )}
        </div>
    );
}

