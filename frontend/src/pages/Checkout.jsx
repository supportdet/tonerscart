import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { INDIAN_STATES } from "../lib/listingConstants";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { CheckCircle2, ShoppingBag, Lock, ArrowRight, ChevronLeft } from "lucide-react";
import PhonePrefixInput from "../components/PhonePrefixInput";
import { computeCartDelivery } from "../lib/delivery";
import { inclGstPrice } from "../lib/listingConstants";

export default function Checkout() {
    const { user, login, signupCustomer } = useAuth();
    const { items, subtotal, subtotalIncl, count, clear } = useCart();
    const { city: appCity } = useCity();
    const navigate = useNavigate();
    const [step, setStep] = useState(1); // 1 = details, 2 = summary
    const [name, setName] = useState(user?.name || "");
    const [phone, setPhone] = useState((user?.phone || "").replace(/^\+?91[\s-]?/, "").replace(/\D/g, ""));
    // Structured address
    const [streetAddress, setStreetAddress] = useState("");
    const [area, setArea] = useState("");
    const [orderCity, setOrderCity] = useState(appCity || "");
    const [orderState, setOrderState] = useState("");
    const [pincode, setPincode] = useState("");
    const [notes, setNotes] = useState("");
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [policyAgreed, setPolicyAgreed] = useState(false);

    // System-defined delivery: free same-city, flat intercity rate per category,
    // charged ONCE per dealer. GST is per item on the base price.
    const delivery = useMemo(() => computeCartDelivery(items, orderCity), [items, orderCity]);
    const deliveryBreakdown = useMemo(() => {
        return items.map((it) => {
            const d = delivery.perItem[it.id] || {};
            const rate = Number(it.product?.gst_rate ?? 18);
            const lineBase = Number(it.product?.price || 0) * it.qty;
            const lineGst = Math.round((lineBase * rate) / 100);
            return {
                id: it.id,
                sameCity: !!d.sameCity,
                dealerCity: d.dealerCity || it.product?.city || "",
                bears: !!d.bears,
                charge: Number(d.charge || 0),
                rate, lineBase, lineGst,
            };
        });
    }, [items, delivery]);
    const totalDelivery = delivery.total;
    // GST = inclusive total − base. Computing it this way guarantees that
    // breakdown (Items subtotal + GST + Delivery) ALWAYS reconciles to the
    // same incl-GST total that was shown on cards / detail / cart — no
    // per-line rounding drift across screens.
    const totalGst = Math.max(0, subtotalIncl - subtotal);
    const grandTotal = subtotalIncl + totalDelivery;

    const fullAddress = [streetAddress, area, orderCity && pincode ? `${orderCity} - ${pincode}` : (orderCity || pincode), orderState].filter(Boolean).join(", ");

    const validateStep1 = () => {
        if (items.length === 0) { toast.error("Cart is empty"); return false; }
        if (!name.trim() || !phone) { toast.error("Name and phone are required"); return false; }
        if (phone.length !== 10) { toast.error("Enter a valid 10-digit phone"); return false; }
        if (!streetAddress.trim() || !area.trim() || !orderCity.trim() || !orderState.trim() || !pincode.trim()) {
            toast.error("All address fields are required");
            return false;
        }
        if (!/^\d{6}$/.test(pincode.trim())) { toast.error("Enter a valid 6-digit pincode"); return false; }
        if (user && user.role && user.role !== "customer") {
            toast.error("Sign in with a buyer account to place order requests");
            return false;
        }
        if (!user && (!authEmail.trim() || !authPassword || authPassword.length < 6)) {
            toast.error("Email and a 6+ character password are required to place the order");
            return false;
        }
        return true;
    };

    const ensureAuth = async () => {
        if (user) return;
        const phoneFull = phone ? `+91 ${phone}` : "";
        try {
            await signupCustomer({
                email: authEmail.trim(), password: authPassword,
                name: name.trim(), phone: phoneFull, city: orderCity || "",
            });
        } catch (err) {
            const msg = (err?.response?.data?.detail || err?.message || "").toLowerCase();
            if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
                await login(authEmail.trim(), authPassword);
            } else { throw err; }
        }
    };

    const placeOrder = async () => {
        if (!policyAgreed) {
            toast.error("Please accept TonersCart's terms to place your order");
            return;
        }
        setLoading(true);
        try {
            await ensureAuth();
            const phoneFull = `+91 ${phone}`;
            const createdOrders = [];
            for (const it of items) {
                const breakdown = deliveryBreakdown.find((d) => d.id === it.id);
                const { data: created } = await api.post("/orders", {
                    listing_id: it.id,
                    listing_kind: it.product?.kind || "toner",
                    qty: it.qty,
                    customer_name: name,
                    customer_phone: phoneFull,
                    delivery_address: fullAddress,
                    notes,
                    street_address: streetAddress,
                    area,
                    order_city: orderCity,
                    order_state: orderState,
                    pincode,
                    charge_delivery: !!breakdown?.bears,
                    delivery_charge: Number(breakdown?.charge || 0),
                    gst_rate: Number(breakdown?.rate ?? 18),
                    gst_amount: Number(breakdown?.lineGst || 0),
                });
                if (created) createdOrders.push({ created, product: it.product });
            }
            clear();
            toast.success(`${items.length} order ${items.length === 1 ? "request" : "requests"} sent to suppliers`);
            if (createdOrders.length === 1) {
                const { created, product } = createdOrders[0];
                const enriched = {
                    ...created,
                    listings: { brand: product.brand, model_number: product.model_number, toner_type: product.toner_type, image_url: product.image_url },
                    suppliers: { business_name: product.supplier_name, city: product.city },
                    supplier_name: product.supplier_name,
                    supplier_city: product.city,
                };
                navigate(`/order-confirmed/${created.id}`, { state: { order: enriched } });
            } else {
                navigate("/customer");
            }
        } catch (err) {
            toast.error(formatApiError(err));
        } finally { setLoading(false); }
    };

    // Wave 105.4 — Razorpay Standard Checkout. Loads the checkout.js script
    // once, creates a Razorpay order server-side, opens the modal, and on
    // success verifies the signature on our backend BEFORE creating the
    // marketplace order rows via the existing placeOrder() path.
    const loadRazorpayScript = () => new Promise((resolve) => {
        if (window.Razorpay) return resolve(true);
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.body.appendChild(s);
    });

    const payWithRazorpay = async () => {
        if (!policyAgreed) { toast.error("Please accept TonersCart's terms to continue"); return; }
        if (!validateStep1()) return;
        setLoading(true);
        try {
            await ensureAuth();
            const ok = await loadRazorpayScript();
            if (!ok) { toast.error("Payment gateway couldn't load. Check your connection and retry."); return; }

            // Create Razorpay order on our backend (grandTotal ₹ → paise)
            const amountPaise = Math.round(grandTotal * 100);
            const receipt = `tc_${Date.now().toString(36)}`.slice(0, 40);
            const { data: rpOrder } = await api.post("/payments/create-order", {
                amount: amountPaise, currency: "INR", receipt,
            });

            const rzp = new window.Razorpay({
                key: rpOrder.key_id || process.env.REACT_APP_RAZORPAY_KEY_ID,
                amount: rpOrder.amount,
                currency: rpOrder.currency,
                order_id: rpOrder.order_id,
                name: "TonersCart",
                description: `${items.length} item${items.length > 1 ? "s" : ""} · order`,
                prefill: {
                    name: name || (user?.name || ""),
                    email: authEmail || (user?.email || ""),
                    contact: `+91${phone}`,
                },
                theme: { color: "#00B7C7" },
                modal: {
                    ondismiss: () => {
                        setLoading(false);
                        toast.info("Payment cancelled. Your cart is safe.");
                    },
                },
                handler: async (resp) => {
                    try {
                        // Server-side signature verify (never trust the browser here)
                        await api.post("/payments/verify-payment", {
                            razorpay_order_id: resp.razorpay_order_id,
                            razorpay_payment_id: resp.razorpay_payment_id,
                            razorpay_signature: resp.razorpay_signature,
                        });
                        // Signature good — now create the marketplace order rows.
                        await placeOrder();
                    } catch (err) {
                        toast.error(`Payment recorded but order creation failed: ${formatApiError(err)}. Please contact support with payment ID ${resp.razorpay_payment_id}.`);
                        setLoading(false);
                    }
                },
            });
            rzp.on("payment.failed", (resp) => {
                setLoading(false);
                const reason = resp?.error?.description || "Payment failed";
                toast.error(`${reason}. You can retry.`);
            });
            rzp.open();
        } catch (err) {
            toast.error(formatApiError(err));
            setLoading(false);
        }
    };

    const proceedToSummary = (e) => {
        e.preventDefault();
        if (validateStep1()) setStep(2);
    };

    if (items.length === 0) {
        return (
            <div className="tc-container tc-checkout-safe py-16 text-center w-full max-w-full" data-testid="checkout-empty">
                <ShoppingBag className="mx-auto text-[#D2D2D7]" size={42} />
                <div className="mt-3 font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Your cart is empty</div>
                <Button onClick={() => navigate("/search")} className="btn-cta mt-5">Browse toners</Button>
            </div>
        );
    }

    return (
        <div className="tc-hero tc-checkout-safe relative pb-16 w-full max-w-full" data-testid="checkout-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Checkout · Step {step} of 2</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 52px)", lineHeight: 1.12, letterSpacing: "-0.025em", fontWeight: 300 }}>
                    {step === 1 ? "Confirm delivery details" : "Review your order"}
                </h1>
                <p className="text-white/65 mt-3 max-w-lg text-[14px]">
                    {step === 1
                        ? "Confirm your delivery details. On the next step you can pay online (UPI / cards / netbanking via Razorpay) or send an offline order request."
                        : "Verify your items, delivery and total. Pay online for instant confirmation, or send a request to the supplier."}
                </p>

                <div className="grid lg:grid-cols-12 gap-6 mt-8 text-[#0A0A0B] min-w-0">
                    {step === 1 ? (
                        <form onSubmit={proceedToSummary} className="lg:col-span-7 min-w-0 bg-white border border-black/[0.06] rounded-2xl p-4 sm:p-8 space-y-7">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Buyer details</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-1.5"><Label className="text-[12.5px] font-medium text-[#3a3a40]">Your name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Full name" className="h-11" data-testid="checkout-name" /></div>
                                <div className="space-y-1.5"><Label className="text-[12.5px] font-medium text-[#3a3a40]">Contact phone</Label><PhonePrefixInput value={phone} onChange={setPhone} required testId="checkout-phone" /></div>
                            </div>

                            <div className="pt-1">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B] mb-4">Delivery address</div>
                                <div className="grid grid-cols-1 gap-5">
                                    <div className="space-y-1.5">
                                        <Label className="text-[12.5px] font-medium text-[#3a3a40]">Street address / House no.</Label>
                                        <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} required placeholder="e.g. #245, 12th Cross, Indiranagar" className="h-11" data-testid="checkout-street" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[12.5px] font-medium text-[#3a3a40]">Area / Locality</Label>
                                        <Input value={area} onChange={(e) => setArea(e.target.value)} required placeholder="e.g. HSR Layout Sector 7" className="h-11" data-testid="checkout-area" />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[12.5px] font-medium text-[#3a3a40]">City</Label>
                                            <Input list="ck-cities" value={orderCity} onChange={(e) => setOrderCity(e.target.value)} required placeholder="Bangalore" className="h-11" data-testid="checkout-city" />
                                            <datalist id="ck-cities">
                                                {KNOWN_CITIES.map((c) => <option key={c} value={c} />)}
                                            </datalist>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[12.5px] font-medium text-[#3a3a40]">State</Label>
                                            <Input list="ck-states" value={orderState} onChange={(e) => setOrderState(e.target.value)} required placeholder="Karnataka" className="h-11" data-testid="checkout-state" />
                                            <datalist id="ck-states">
                                                {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
                                            </datalist>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[12.5px] font-medium text-[#3a3a40]">Pincode</Label>
                                            <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} placeholder="560034" className="h-11" data-testid="checkout-pincode" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5"><Label className="text-[12.5px] font-medium text-[#3a3a40]">Notes for suppliers (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions" data-testid="checkout-notes" /></div>

                            {!user && (
                                <div className="pt-6 border-t border-black/[0.06]">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B] flex items-center gap-2">
                                        <Lock size={12} /> Quick sign-in
                                    </div>
                                    <p className="text-[12.5px] text-[#6E6E73] mt-1.5">We create a buyer account in one tap so suppliers can reach you. No OTP, no friction.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
                                        <div className="space-y-1.5"><Label className="text-[12.5px] font-medium text-[#3a3a40]">Email</Label><Input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required placeholder="you@company.com" className="h-11" data-testid="checkout-auth-email" /></div>
                                        <div className="space-y-1.5"><Label className="text-[12.5px] font-medium text-[#3a3a40]">Password</Label><Input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required minLength={6} placeholder="6+ characters" className="h-11" data-testid="checkout-auth-password" /></div>
                                    </div>
                                    <p className="text-[11.5px] text-[#86868B] mt-2.5">Already have an account? Use the same email &amp; password — we&apos;ll sign you in automatically.</p>
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-[12.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <CheckCircle2 size={14} className="shrink-0" /> Next: review your order summary, then confirm.
                            </div>
                            <Button type="submit" className="btn-cta w-full h-12 inline-flex items-center justify-center gap-2" data-testid="checkout-continue-btn">
                                Continue to review <ArrowRight size={14} />
                            </Button>
                        </form>
                    ) : (
                        <div className="lg:col-span-7 min-w-0 bg-white border border-black/[0.06] rounded-2xl p-5 sm:p-7 space-y-4" data-testid="checkout-summary">
                            <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 text-[12px] text-[#6E6E73] hover:text-[#0A0A0B]" data-testid="checkout-back-btn">
                                <ChevronLeft size={13} /> Edit details
                            </button>

                            <div>
                                <div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B]">Shipping to</div>
                                <div className="text-[14px] text-[#0A0A0B] mt-1" data-testid="summary-address">{fullAddress}</div>
                                <div className="text-[12px] text-[#6E6E73] mt-0.5">{name} · +91 {phone}</div>
                            </div>

                            <div className="border-t border-black/[0.06] pt-4">
                                <div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B] mb-2">Items</div>
                                <div className="divide-y divide-black/[0.06]">
                                    {items.map((it) => {
                                        const br = deliveryBreakdown.find((d) => d.id === it.id);
                                        const lineTotal = inclGstPrice(it.product?.price, it.product?.gst_rate) * it.qty;
                                        return (
                                            <div key={it.id} className="py-3" data-testid={`summary-item-${it.id}`}>
                                                <div className="flex items-center justify-between gap-3 min-w-0">
                                                    <div className="min-w-0">
                                                        <div className="font-mono text-[13.5px] font-semibold text-[#0A0A0B] truncate">{it.product.brand} {it.product.model_number}</div>
                                                        <div className="text-[11.5px] text-[#6E6E73] truncate">{it.product.supplier_name || "Supplier"}{it.product.city ? ` · ${it.product.city}` : ""} · ×{it.qty} · incl. GST</div>
                                                    </div>
                                                    <div className="font-mono text-[14px] font-semibold text-[#0A0A0B] shrink-0">₹{lineTotal.toLocaleString("en-IN")}</div>
                                                </div>
                                                <div className="mt-1 text-[11.5px]">
                                                    {br?.sameCity ? (
                                                        <span className="text-emerald-700 font-semibold">✅ Free delivery within {br.dealerCity}</span>
                                                    ) : br?.bears ? (
                                                        <span className="text-[#6E6E73]">🚚 Intercity delivery: +₹{Number(br.charge).toLocaleString("en-IN")} (charged once for this dealer)</span>
                                                    ) : (
                                                        <span className="text-[#6E6E73]">🚚 Intercity — delivery charged once with this dealer&apos;s order</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="border-t border-black/[0.06] pt-4 space-y-1.5">
                                <div className="flex items-center justify-between text-[13px]">
                                    <span className="text-[#6E6E73]">Items subtotal (base)</span>
                                    <span className="font-mono text-[#0A0A0B]" data-testid="summary-base">₹{subtotal.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex items-center justify-between text-[13px]">
                                    <span className="text-[#6E6E73]">GST</span>
                                    <span className="font-mono text-[#0A0A0B]" data-testid="summary-gst">₹{totalGst.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex items-center justify-between text-[13px]">
                                    <span className="text-[#6E6E73]">{totalDelivery > 0 ? "Intercity delivery" : "Delivery"}</span>
                                    <span className="font-mono text-[#0A0A0B]" data-testid="summary-delivery">{totalDelivery > 0 ? `₹${totalDelivery.toLocaleString("en-IN")}` : "Free"}</span>
                                </div>
                                <div className="text-[11.5px] text-[#86868B]">Same-city delivery is free. Intercity is a flat charge per dealer (₹100–₹350 by product type), charged once per dealer.</div>
                                <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                                    <span className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#0A0A0B]">Total payable</span>
                                    <span className="font-mono text-[24px] font-bold text-[#0A0A0B]" data-testid="summary-total">₹{grandTotal.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="text-[11.5px] text-[#6E6E73] pt-1">Dispatched within 2 business days. Delivery within same city included. Intercity delivery charges applied where applicable.</div>
                            </div>

                            <div className="space-y-2 pt-2">
                                {/* Policy agreement gate */}
                                <label
                                    className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E8E8EC] cursor-pointer hover:bg-[#EEEEF1] transition"
                                    data-testid="policy-agreement-block"
                                >
                                    <input
                                        type="checkbox"
                                        checked={policyAgreed}
                                        onChange={(e) => setPolicyAgreed(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 accent-[#0A0A0B] flex-shrink-0"
                                        data-testid="policy-agreement-checkbox"
                                    />
                                    <div className="text-[12px] text-[#3a3a40] leading-[1.55]">
                                        <strong className="text-[#0A0A0B]">I agree to TonersCart's terms and policies.</strong>{" "}
                                        TonersCart is an intermediary marketplace — the GST invoice is raised directly by the supplier, delivery is handled by the supplier within 2 business days, and any disputes are resolved via <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline" onClick={(e) => e.stopPropagation()}>support@tonerscart.com</a> within 48 hours.
                                    </div>
                                </label>

                                <button
                                    type="button"
                                    onClick={payWithRazorpay}
                                    disabled={loading}
                                    className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F5C400] hover:bg-[#F5C400]/90 text-[#0A0A0B] font-semibold text-[14px] border border-[#F5C400] disabled:opacity-60 disabled:cursor-not-allowed transition"
                                    data-testid="proceed-to-payment-btn"
                                >
                                    <Lock size={14} /> {loading ? "Opening payment…" : `Pay Now ₹${grandTotal.toLocaleString("en-IN")}`}
                                </button>
                                <div className="text-[11.5px] text-[#6E6E73] text-center">Secure payment via Razorpay · UPI, cards, netbanking</div>
                                <Button
                                    type="button"
                                    onClick={placeOrder}
                                    disabled={loading}
                                    title="Send an offline order request — supplier will contact you to arrange payment"
                                    className="btn-cta w-full inline-flex items-center justify-center gap-2"
                                    data-testid="place-order-request-btn"
                                >
                                    {loading ? "Placing…" : `Send Order Request — ₹${grandTotal.toLocaleString("en-IN")}`}
                                </Button>
                                <div className="text-[11.5px] text-[#6E6E73] text-center mt-1.5" data-testid="place-order-disabled-hint">
                                    Prefer to pay offline? Send a request and the supplier will contact you directly.
                                </div>
                            </div>
                        </div>
                    )}

                    <aside className="lg:col-span-5 min-w-0 bg-white border border-black/[0.06] rounded-2xl p-4 sm:p-5">
                        <div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B] mb-3">Items ({count})</div>
                        <div className="divide-y divide-black/[0.06]">
                            {items.map((it) => {
                                const inclPerUnit = inclGstPrice(it.product?.price, it.product?.gst_rate);
                                return (
                                    <div key={it.id} className="py-2.5 flex items-center justify-between gap-3 min-w-0">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-mono text-[13px] font-semibold text-[#0A0A0B] truncate">{it.product.brand} {it.product.model_number}</div>
                                            <div className="text-[11px] text-[#6E6E73] truncate">{it.product.supplier_name || "Supplier"} · ×{it.qty} · incl. GST</div>
                                        </div>
                                        <div className="font-mono text-[13px] font-semibold text-[#0A0A0B] shrink-0">₹{(inclPerUnit * it.qty).toLocaleString("en-IN")}</div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-3 pt-3 border-t border-black/[0.06] flex items-center justify-between">
                            <span className="text-[12px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Items (incl. GST)</span>
                            <span className="font-mono text-[20px] font-semibold text-[#0A0A0B]" data-testid="aside-items-incl">₹{subtotalIncl.toLocaleString("en-IN")}</span>
                        </div>
                        {step === 2 && totalDelivery > 0 && (
                            <div className="mt-1 flex items-center justify-between text-[12.5px]">
                                <span className="text-[#6E6E73]">+ delivery</span>
                                <span className="font-mono text-[#0A0A0B]">₹{totalDelivery.toLocaleString("en-IN")}</span>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}
