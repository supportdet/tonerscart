import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Lock, Minus, Plus } from "lucide-react";

export default function OrderRequestDialog({ product, initialQty = 1, onClose }) {
    const navigate = useNavigate();
    const { user, login, signupCustomer } = useAuth();
    const [qty, setQty] = useState(initialQty);
    const [name, setName] = useState(user?.name || "");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState(user?.phone || "");
    const [notes, setNotes] = useState("");
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const ensureAuth = async () => {
        if (user) return;
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

    const submit = async () => {
        if (!name.trim() || !address.trim() || !phone.trim()) { toast.error("Name, phone and delivery address are required"); return; }
        if (qty < 1 || qty > product.stock) { toast.error(`Quantity must be between 1 and ${product.stock}`); return; }
        if (user && user.role === "admin") { toast.error("Admins cannot place orders"); return; }
        if (!user && (!authEmail.trim() || !authPassword || authPassword.length < 6)) {
            toast.error("Email and a 6+ character password are required to place the order");
            return;
        }
        setLoading(true);
        try {
            await ensureAuth();
            const { data: created } = await api.post("/orders", {
                listing_id: product.id,
                qty: Number(qty),
                customer_name: name,
                customer_phone: phone,
                delivery_address: address,
                notes,
            });
            toast.success("Order request sent to supplier");
            onClose?.();
            // Enrich with the joined fields the OrderConfirmed page expects
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
    const total = (Number(qty) * Number(product.price)).toLocaleString("en-IN");

    return (
        <Dialog open onOpenChange={(o) => !o && onClose?.()}>
            <DialogContent className="p-0 max-w-md gap-0 overflow-hidden" data-testid="order-request-dialog">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-black/[0.06]">
                    <DialogTitle className="text-[#0A0A0B] text-[17px] font-semibold tracking-tight">Request order</DialogTitle>
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
                            <div className="flex items-center">
                                <span className="h-9 inline-flex items-center px-2.5 rounded-l-md border-y border-l border-[#E8E8EC] bg-[#F4F4F6] text-[12.5px] font-semibold text-[#0A0A0B] select-none">+91</span>
                                <Input
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={phone.replace(/^\+?91[\s-]?/, "").replace(/\D/g, "")}
                                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                                    required
                                    data-testid="order-phone-input"
                                    className="h-9 text-[13px] rounded-l-none"
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <Label className="text-[12px]">Delivery address</Label>
                        <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="Full address with PIN code" data-testid="order-address-input" className="text-[13px]" />
                    </div>
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
                        <Button className="btn-cta" size="sm" onClick={submit} disabled={loading} data-testid="order-submit-btn">{loading ? "Sending…" : "Send request"}</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
