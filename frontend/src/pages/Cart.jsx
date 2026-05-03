import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "../context/CartContext";
import TonerCartridge from "../components/TonerCartridge";

export default function Cart() {
    const { items, setQty, remove, subtotal, count } = useCart();
    const navigate = useNavigate();

    return (
        <div className="tc-hero relative pb-16" data-testid="cart-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Your cart</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 52px)", lineHeight: 1.12, letterSpacing: "-0.025em", fontWeight: 300 }}>
                    {count > 0 ? `${count} ${count === 1 ? "item" : "items"} ready to request` : "Your cart is empty"}
                </h1>

                {items.length === 0 ? (
                    <div className="mt-10 max-w-md">
                        <p className="text-white/65 text-[15px]">Browse the catalog and add a few toner listings — you can send all your order requests to suppliers in one go.</p>
                        <Link to="/search" className="btn-cta inline-flex items-center gap-2 mt-6" data-testid="cart-go-browse">
                            Browse toners <ArrowRight size={14} />
                        </Link>
                    </div>
                ) : (
                    <div className="grid lg:grid-cols-12 gap-6 mt-8">
                        <div className="lg:col-span-8 space-y-3">
                            {items.map((it) => {
                                const p = it.product;
                                const tone = p.toner_type === "Original" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : p.toner_type === "Compatible" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200";
                                return (
                                    <div key={it.id} className="bg-white border border-black/[0.06] rounded-2xl p-4 flex gap-4 items-start text-[#0A0A0B]" data-testid={`cart-row-${it.id}`}>
                                        <div className="w-24 h-20 rounded-xl bg-[#F2F3F5] grid place-items-center overflow-hidden shrink-0">
                                            {p.image_url ? (
                                                <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <TonerCartridge color={p.color || "Black"} brand={p.brand} model={p.model_number} type={p.toner_type || "Original"} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{p.brand}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-[0.08em] ${tone}`}>{p.toner_type || "Original"}</span>
                                            </div>
                                            <div className="font-mono text-[16px] font-semibold text-[#0A0A0B]">{p.model_number}</div>
                                            <div className="text-[12px] text-[#6E6E73] truncate">{p.supplier_name || "Supplier"} · {p.city}</div>

                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                <div className="tc-qty">
                                                    <button type="button" onClick={() => setQty(it.id, it.qty - 1)} disabled={it.qty <= 1}><Minus size={14} /></button>
                                                    <span data-testid={`cart-qty-${it.id}`}>{it.qty}</span>
                                                    <button type="button" onClick={() => setQty(it.id, it.qty + 1)} disabled={p.stock != null && it.qty >= p.stock}><Plus size={14} /></button>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="font-mono text-[15px] font-semibold text-[#0A0A0B]">₹{(Number(p.price) * it.qty).toLocaleString("en-IN")}</div>
                                                    <button onClick={() => remove(it.id)} className="text-[12px] text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid={`cart-remove-${it.id}`}>
                                                        <Trash2 size={12} /> Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <aside className="lg:col-span-4 self-start lg:sticky lg:top-24">
                            <div className="bg-white border border-black/[0.06] rounded-2xl p-5 text-[#0A0A0B]">
                                <div className="flex items-center gap-2 mb-3">
                                    <ShoppingBag size={14} className="text-[#0A0A0B]" />
                                    <span className="text-[12px] font-semibold text-[#0A0A0B] tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Order summary</span>
                                </div>
                                <div className="text-[13px] text-[#6E6E73] flex justify-between"><span>Items</span><span className="font-mono text-[#0A0A0B]">{count}</span></div>
                                <div className="text-[13px] text-[#6E6E73] flex justify-between mt-1"><span>Subtotal</span><span className="font-mono text-[#0A0A0B]">₹{subtotal.toLocaleString("en-IN")}</span></div>
                                <div className="text-[11px] text-[#86868B] mt-3">Final pricing is confirmed by each supplier on accept. No payment online.</div>
                                <button onClick={() => navigate("/checkout")} className="btn-cta w-full mt-5 inline-flex items-center justify-center gap-2" data-testid="cart-checkout-btn">
                                    Proceed to checkout <ArrowRight size={14} />
                                </button>
                                <button onClick={() => navigate("/search")} className="btn-light w-full mt-2" data-testid="cart-keep-shopping-btn">Keep shopping</button>
                            </div>
                        </aside>
                    </div>
                )}
            </div>
        </div>
    );
}
