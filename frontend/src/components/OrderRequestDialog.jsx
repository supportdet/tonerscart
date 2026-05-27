import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { INDIAN_STATES } from "../lib/listingConstants";
import { Lock, Minus, Plus } from "lucide-react";
import PhonePrefixInput from "./PhonePrefixInput";

export default function OrderRequestDialog({ product, initialQty = 1, onClose }) {
    const navigate = useNavigate();
    const { user, login, signupCustomer } = useAuth();
    const { city: appCity } = useCity();
    const [qty, setQty] = useState(initialQty);
    const [name, setName] = useState(user?.name || "");
    const [phone, setPhone] = useState(user?.phone || "");
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

    const ensureAuth = async () => {
        if (user) return;
        try {
            await signupCustomer({
                email: authEmail.trim(), password: authPassword,
                name: name.trim(), phone: phone.trim(), city: orderCity || "",
            });
        } catch (err) {
            const msg = (err?.response?.data?.detail || err?.message || "").toLowerCase();
            if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
                await login(authEmail.trim(), authPassword);
            } else { throw err; }
        }
    };

    // Delivery preview
    const buyerCity = (orderCity || "").trim().toLowerCase();
    const dealerCity = (product?.city || "").trim().toLowerCase();
    const sameCity = buyerCity && dealerCity && buyerCity === dealerCity;
    const intercityCharge = Number(product?.intercity_delivery_charge || 0);
    const deliveryCharge = sameCity ? 0 : intercityCharge;
    const fullAddress = [streetAddress, area, orderCity && pincode ? `${orderCity} - ${pincode}` : (orderCity || pincode), orderState].filter(Boolean).join(", ");

    const submit = async () => {
        if (!name.trim() || !phone.trim()) { toast.error("Name and phone are required"); return; }
        if (!streetAddress.trim() || !area.trim() || !orderCity.trim() || !orderState.trim() || !pincode.trim()) {
            toast.error("All address fields are required"); return;
        }
        if (!/^\d{6}$/.test(pincode.trim())) { toast.error("Enter a valid 6-digit pincode"); return; }
        if (qty < 1 || qty > product.stock) { toast.error(`Quantity must be between 1 and ${product.stock}`); return; }
        if (user && user.role === "admin") { toast.error("Admins cannot place orders"); return; }
        if (!user && (!authEmail.trim() || !authPassword || authPassword.length < 6)) {
            toast.error("Email and a 6+ character password are required to place the order"); return;
        }
        const phoneRaw = phone.replace(/^\+?91[\s-]?/, "").replace(/\D/g, "");
        if (phoneRaw.length !== 10) { toast.error("Enter a valid 10-digit phone"); return; }
        const phoneFull = `+91 ${phoneRaw}`;
        setLoading(true);
        try {
            await ensureAuth();
            const { data: created } = await api.post("/orders", {
                listing_id: product.id,
                qty: Number(qty),
                customer_name: name,
                customer_phone: phoneFull,
                delivery_address: fullAddress,
                notes,
                street_address: streetAddress,
                area,
                order_city: orderCity,
                order_state: orderState,
                pincode,
                delivery_charge: deliveryCharge,
            });
            toast.success("Order placed — supplier will confirm shortly");
            onClose?.();
            const enriched = {
                ...created,
                listings: {
                    brand: product.brand,
                    model_number: product.model_number,
                    toner_type: product.toner_type,
                    image_url: product.image_url,
                },
                suppliers: {
                    business_name: product.supplier_name,
                    city: product.city,
                },
                supplier_name: product.supplier_name,
                supplier_city: product.city,
            };
            navigate(`/order-confirmed/${created?.id || ""}`, { state: { order: enriched } });
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    const dec = () => setQty((q) => Math.max(1, Number(q) - 1));
    const inc = () => setQty((q) => Math.min(product.stock, Number(q) + 1));
    const lineTotal = Number(qty) * Number(product.price);
    const total = (lineTotal + deliveryCharge).toLocaleString("en-IN");

    return (
        <Dialog open onOpenChange={(o) => !o && onClose?.()}>
            <DialogContent className="p-0 max-w-md gap-0 overflow-hidden" data-testid="order-request-dialog">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-black/[0.06]">
                    <DialogTitle className="text-[#0A0A0B] text-[17px] font-semibold tracking-tight">Place order</DialogTitle>
                    <DialogDescription className="text-[12px] text-[#6E6E73] truncate">
                        <span className="font-mono text-[#0A0A0B]">{product.brand} {product.model_number}</span> · {product.toner_type || "Original"} · {product.supplier_name} ({product.city})
                    </DialogDescription>
                </DialogHeader>

                <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                    {/* Quantity + price strip */}
                    <div className="flex items-center justify-between gap-3 bg-black/[0.03] rounded-lg p-2.5">
                        <div>
                            <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[#86868B]">Unit · stock</div>
                            <div className="font-mono text-[13px] text-[#0A0A0B]">₹{Number(product.price).toLocaleString("en-IN")} · <span className="text-emerald-700 font-semibold">{product.stock} avail</span></div>
                        </div>
                        <div className="tc-qty">
                            <button type="button" onClick={dec} disabled={qty <= 1}><Minus size={13} /></button>
                            <span data-testid="order-qty-value">{qty}</span>
                            <button type="button" onClick={inc} disabled={qty >= product.stock}><Plus size={13} /></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        <div>
                            <Label className="text-[12px]">Your name</Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="order-name-input" className="h-9 text-[13px]" />
                        </div>
                        <div>
                            <Label className="text-[12px]">Phone</Label>
                            <PhonePrefixInput value={phone} onChange={setPhone} size="sm" required testId="order-phone-input" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div>
                            <Label className="text-[12px]">Street address / House no.</Label>
                            <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} required placeholder="#245, 12th Cross" className="h-9 text-[13px]" data-testid="order-street-input" />
                        </div>
                        <div>
                            <Label className="text-[12px]">Area / Locality</Label>
                            <Input value={area} onChange={(e) => setArea(e.target.value)} required placeholder="HSR Layout Sector 7" className="h-9 text-[13px]" data-testid="order-area-input" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <Label className="text-[12px]">City</Label>
                                <Input list="ord-cities" value={orderCity} onChange={(e) => setOrderCity(e.target.value)} required placeholder="Bangalore" className="h-9 text-[13px]" data-testid="order-city-input" />
                                <datalist id="ord-cities">
                                    {KNOWN_CITIES.map((c) => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                            <div>
                                <Label className="text-[12px]">State</Label>
                                <Input list="ord-states" value={orderState} onChange={(e) => setOrderState(e.target.value)} required placeholder="Karnataka" className="h-9 text-[13px]" data-testid="order-state-input" />
                                <datalist id="ord-states">
                                    {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                            <div>
                                <Label className="text-[12px]">Pincode</Label>
                                <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} placeholder="560034" className="h-9 text-[13px]" data-testid="order-pincode-input" />
                            </div>
                        </div>
                    </div>

                    {/* Delivery preview */}
                    {orderCity && (
                        <div className="text-[12px] rounded-md px-3 py-2 border" data-testid="order-delivery-preview">
                            {sameCity ? (
                                <span className="text-emerald-700 font-semibold">✅ Free delivery within {product.city}</span>
                            ) : intercityCharge > 0 ? (
                                <span className="text-[#0A0A0B]">🚚 Intercity delivery: <strong>+₹{intercityCharge.toLocaleString("en-IN")}</strong></span>
                            ) : (
                                <span className="text-orange-700">⚠️ Delivery only within {product.city || "dealer city"} — confirm with supplier</span>
                            )}
                        </div>
                    )}

                    <div>
                        <Label className="text-[12px]">Notes (optional)</Label>
                        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions" data-testid="order-notes-input" className="h-9 text-[13px]" />
                    </div>

                    {!user && (
                        <div className="pt-2 mt-1 border-t border-black/[0.06]">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0A0A0B] flex items-center gap-1.5">
                                <Lock size={11} /> Sign in or create an account
                            </div>
                            <p className="text-[11px] text-[#6E6E73] mt-0.5">New here? Account is created instantly. Already registered? Same email + password — we sign you in.</p>
                            <div className="grid grid-cols-2 gap-2.5 mt-2">
                                <div>
                                    <Label className="text-[12px]">Email</Label>
                                    <Input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@company.com" data-testid="order-auth-email" className="h-9 text-[13px]" />
                                </div>
                                <div>
                                    <Label className="text-[12px]">Password</Label>
                                    <Input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="6+ characters" data-testid="order-auth-password" className="h-9 text-[13px]" />
                                </div>
                            </div>
                            <div className="mt-2 text-[11px] text-[#6E6E73]">
                                Prefer full sign-in? <button type="button" onClick={() => { onClose?.(); navigate("/login"); }} className="text-[#00B7C7] hover:underline font-semibold" data-testid="order-go-login">Go to login</button> · <button type="button" onClick={() => { onClose?.(); navigate("/register"); }} className="text-[#00B7C7] hover:underline font-semibold" data-testid="order-go-register">Create account</button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="px-5 py-3 border-t border-black/[0.06] bg-black/[0.02] flex sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                        <span className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">Estimated total</span>
                        <span className="font-mono text-[16px] font-bold text-[#0A0A0B]">₹{total}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} data-testid="order-cancel-btn">Cancel</Button>
                        <Button className="btn-cta" size="sm" onClick={submit} disabled={loading} data-testid="order-submit-btn">{loading ? "Placing…" : "Place order"}</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
