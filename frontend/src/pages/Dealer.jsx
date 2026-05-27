import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Search as SearchIcon, Lock, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageMeta from "../components/PageMeta";
import TonerCartridge from "../components/TonerCartridge";
import OrderRequestDialog from "../components/OrderRequestDialog";

const ACCENT = "#607d8b";

function D2DCard({ p, canSeeD2D, onBuy }) {
    const d2dPrice = Number(p.d2d_price ?? 0);
    const list = Number(p.price ?? 0);
    const savings = d2dPrice && list ? Math.max(0, list - d2dPrice) : 0;
    return (
        <div className="tc-product-card relative" data-testid={`d2d-card-${p.id}`}>
            <div className="absolute top-3 left-3 z-10">
                <span
                    className="inline-block text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded-md text-white"
                    style={{ background: ACCENT }}
                    data-testid={`d2d-badge-${p.id}`}
                >
                    D2D Price
                </span>
            </div>
            <Link to={`/toner/${p.id}`} className="tc-product-img block">
                <span className="tc-product-img-label">{p.brand}</span>
                {p.image_url ? (
                    <img src={p.image_url} alt={`${p.brand} ${p.model_number}`} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                    <TonerCartridge color={p.color || "Black"} brand={p.brand} model={p.model_number} type={p.toner_type || "Original"} />
                )}
            </Link>
            <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{p.brand}</div>
                <Link to={`/toner/${p.id}`} className="font-mono text-[18px] font-semibold text-[#0A0A0B] tracking-tight hover:text-[#00B7C7] transition">{p.model_number}</Link>
                <div className="text-[13px] text-[#1D1D1F] truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                    {p.supplier_name || "—"}
                </div>
                <div className="text-[12px] text-[#6E6E73] flex items-center gap-1">
                    <MapPin size={11} /> {p.city}
                </div>

                <div className="mt-2 pt-3 border-t border-black/[0.05]">
                    {canSeeD2D ? (
                        <>
                            <div className="text-[10px] tracking-[0.14em] uppercase font-semibold" style={{ color: ACCENT }}>D2D Price</div>
                            <div className="flex items-end gap-2">
                                <div className="font-mono text-[20px] font-semibold text-[#0A0A0B]">₹{d2dPrice.toLocaleString("en-IN")}</div>
                                {list > 0 && (
                                    <div className="text-[12px] text-[#86868B] line-through pb-0.5">₹{list.toLocaleString("en-IN")}</div>
                                )}
                            </div>
                            {savings > 0 && (
                                <div className="text-[11.5px] text-emerald-600 font-medium mt-0.5">Save ₹{savings.toLocaleString("en-IN")}</div>
                            )}
                            <button
                                onClick={() => onBuy(p)}
                                className="mt-3 w-full h-10 rounded-xl text-[13px] font-semibold text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                                style={{ background: ACCENT }}
                                disabled={p.stock <= 0}
                                data-testid={`d2d-order-${p.id}`}
                            >
                                <ShoppingCart size={13} /> {p.stock > 0 ? "Place D2D order" : "Out of stock"}
                            </button>
                        </>
                    ) : (
                        <div className="text-center py-1">
                            <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#86868B] mb-1.5">
                                <Lock size={12} /> D2D price hidden
                            </div>
                            <div className="text-[12px] text-[#6E6E73]">
                                Visible to approved dealers only.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Dealer() {
    const { user } = useAuth();
    const [q, setQ] = useState("");
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orderProduct, setOrderProduct] = useState(null);

    // Only approved suppliers should see D2D prices / place orders.
    const canSeeD2D = !!user && user.role === "supplier";

    useEffect(() => {
        let cancelled = false;
        const fetch = async () => {
            setLoading(true);
            try {
                const r = await api.get("/listings/search", { params: { d2d_only: true, q: q || undefined, limit: 200 } });
                if (!cancelled) setProducts(Array.isArray(r.data) ? r.data : []);
            } catch {
                if (!cancelled) setProducts([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetch();
        return () => { cancelled = true; };
    }, [q]);

    const visible = useMemo(() => products.filter((p) => p.d2d_enabled), [products]);

    const onBuy = (p) => {
        if (!canSeeD2D) {
            toast.info("Sign in as an approved dealer to place D2D orders");
            return;
        }
        setOrderProduct(p);
    };

    return (
        <>
            <PageMeta title="Dealer to Dealer · TonersCart" description="Exclusive dealer-to-dealer pricing across India's toner network." />
            <div className="min-h-[80vh] bg-[#F5F5F7] py-10 sm:py-14">
                <div className="tc-container">
                    <div className="mb-6 sm:mb-8">
                        <div
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-[0.18em] uppercase font-semibold mb-3"
                            style={{ background: `${ACCENT}1A`, color: ACCENT }}
                        >
                            Dealer to Dealer
                        </div>
                        <h1
                            className="text-[#0A0A0B]"
                            style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 400, letterSpacing: "-0.02em" }}
                            data-testid="dealer-title"
                        >
                            Exclusive dealer pricing
                        </h1>
                        <p className="text-[14.5px] text-[#6E6E73] mt-2 max-w-[560px]">
                            Buy from fellow approved dealers at preferential prices. Only verified suppliers can view and place D2D orders.
                        </p>
                    </div>

                    {/* Search */}
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

                    {!canSeeD2D && (
                        <div
                            className="mb-6 rounded-2xl px-5 py-4 flex items-start gap-3 text-[13px]"
                            style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}33`, color: "#37474F" }}
                            data-testid="dealer-locked-banner"
                        >
                            <Lock size={16} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
                            <div>
                                <div className="font-semibold mb-0.5">D2D pricing is restricted</div>
                                <div className="text-[#52606D]">
                                    Only approved dealers can see D2D prices and place D2D orders. <Link to="/sell" className="underline font-medium">Apply to sell on TonersCart →</Link>
                                </div>
                            </div>
                        </div>
                    )}

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
                    ) : visible.length === 0 ? (
                        <div className="tc-card-flat p-12 text-center" data-testid="dealer-empty">
                            <div className="text-[15px] font-semibold text-[#0A0A0B] mb-1">No D2D listings yet</div>
                            <div className="text-[13px] text-[#6E6E73]">
                                Dealers can enable D2D on their listings from the supplier dashboard.
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="dealer-grid">
                            {visible.map((p) => (
                                <D2DCard key={p.id} p={p} canSeeD2D={canSeeD2D} onBuy={onBuy} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {orderProduct && (
                <OrderRequestDialog
                    product={{
                        ...orderProduct,
                        // Override the price the dialog uses to the D2D price.
                        price: Number(orderProduct.d2d_price ?? orderProduct.price ?? 0),
                    }}
                    initialQty={1}
                    onClose={() => setOrderProduct(null)}
                />
            )}
        </>
    );
}
