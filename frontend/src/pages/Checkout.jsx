import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { CheckCircle2, ShoppingBag, Lock } from "lucide-react";

export default function Checkout() {
    const { user, login, signupCustomer } = useAuth();
    const { items, subtotal, count, clear } = useCart();
    const navigate = useNavigate();
    const [name, setName] = useState(user?.name || "");
    const [phone, setPhone] = useState(user?.phone || "");
    const [address, setAddress] = useState("");
    const [notes, setNotes] = useState("");
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const ensureAuth = async () => {
        if (user) return;
        // Quick sign-up; if email already exists, fall through to sign-in.
        try {
            await signupCustomer({
                email: authEmail.trim(),
                password: authPassword,
                name: name.trim(),
                phone: phone.trim(),
                city: "",
            });
        } catch (err) {
            const msg = (err?.response?.data?.detail || err?.message || "").toLowerCase();
            if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
                await login(authEmail.trim(), authPassword);
            } else {
                throw err;
            }
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        if (items.length === 0) { toast.error("Cart is empty"); return; }
        if (!name.trim() || !phone.trim() || !address.trim()) {
            toast.error("Name, phone and delivery address are required");
            return;
        }
        if (user && user.role && user.role !== "customer") {
            toast.error("Sign in with a buyer account to place order requests");
            return;
        }
        if (!user && (!authEmail.trim() || !authPassword || authPassword.length < 6)) {
            toast.error("Email and a 6+ character password are required to place the order");
            return;
        }
        setLoading(true);
        try {
            await ensureAuth();
            for (const it of items) {
                await api.post("/orders", {
                    listing_id: it.id,
                    qty: it.qty,
                    customer_name: name,
                    customer_phone: phone,
                    delivery_address: address,
                    notes,
                });
            }
            clear();
            toast.success(`${items.length} order ${items.length === 1 ? "request" : "requests"} sent to suppliers`);
            navigate("/customer");
        } catch (err) {
            toast.error(formatApiError(err));
        } finally { setLoading(false); }
    };

    if (items.length === 0) {
        return (
            <div className="tc-container py-16 text-center" data-testid="checkout-empty">
                <ShoppingBag className="mx-auto text-[#D2D2D7]" size={42} />
                <div className="mt-3 font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Your cart is empty</div>
                <Button onClick={() => navigate("/search")} className="btn-cta mt-5">Browse toners</Button>
            </div>
        );
    }

    return (
        <div className="tc-hero relative pb-16" data-testid="checkout-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Checkout</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 52px)", lineHeight: 1.12, letterSpacing: "-0.025em", fontWeight: 300 }}>
                    Confirm delivery details
                </h1>
                <p className="text-white/65 mt-3 max-w-lg text-[14px]">
                    Suppliers receive your request and confirm pricing and delivery directly with you. No payment is taken online.
                </p>

                <div className="grid lg:grid-cols-12 gap-6 mt-8 text-[#0A0A0B]">
                    <form onSubmit={submit} className="lg:col-span-7 bg-white border border-black/[0.06] rounded-2xl p-5 sm:p-7 space-y-4">
                        <div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B]">Buyer details</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><Label>Your name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="checkout-name" /></div>
                            <div><Label>Contact phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+91-..." data-testid="checkout-phone" /></div>
                        </div>
                        <div><Label>Delivery address</Label><Textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="Full address with PIN code" data-testid="checkout-address" /></div>
                        <div><Label>Notes for suppliers (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions" data-testid="checkout-notes" /></div>

                        {!user && (
                            <div className="pt-3 border-t border-black/[0.06]">
                                <div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B] flex items-center gap-2">
                                    <Lock size={12} /> Quick sign-in
                                </div>
                                <p className="text-[12px] text-[#6E6E73] mt-1">We create a buyer account in one tap so suppliers can reach you. No OTP, no friction.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                    <div><Label>Email</Label><Input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required placeholder="you@company.com" data-testid="checkout-auth-email" /></div>
                                    <div><Label>Password</Label><Input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required minLength={6} placeholder="6+ characters" data-testid="checkout-auth-password" /></div>
                                </div>
                                <p className="text-[11px] text-[#86868B] mt-2">Already have an account? Use the same email & password — we&apos;ll sign you in automatically.</p>
                            </div>
                        )}

                        <div className="flex items-center gap-2 text-[12.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2.5">
                            <CheckCircle2 size={14} className="shrink-0" /> One request will be sent per supplier. They confirm and ship directly.
                        </div>
                        <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="checkout-submit">
                            {loading ? "Sending requests…" : `Send ${count} order ${count === 1 ? "request" : "requests"}`}
                        </Button>
                    </form>

                    <aside className="lg:col-span-5 bg-white border border-black/[0.06] rounded-2xl p-5">
                        <div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B] mb-3">Items ({count})</div>
                        <div className="divide-y divide-black/[0.06]">
                            {items.map((it) => (
                                <div key={it.id} className="py-2.5 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-mono text-[13px] font-semibold text-[#0A0A0B] truncate">{it.product.brand} {it.product.model_number}</div>
                                        <div className="text-[11px] text-[#6E6E73] truncate">{it.product.supplier_name || "Supplier"} · ×{it.qty}</div>
                                    </div>
                                    <div className="font-mono text-[13px] font-semibold text-[#0A0A0B]">₹{(Number(it.product.price) * it.qty).toLocaleString("en-IN")}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-black/[0.06] flex items-center justify-between">
                            <span className="text-[12px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Subtotal</span>
                            <span className="font-mono text-[20px] font-semibold text-[#0A0A0B]">₹{subtotal.toLocaleString("en-IN")}</span>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
