import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Lock } from "lucide-react";

export default function OrderRequestDialog({ product, initialQty = 1, onClose }) {
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
            await api.post("/orders", {
                listing_id: product.id,
                qty: Number(qty),
                customer_name: name,
                customer_phone: phone,
                delivery_address: address,
                notes,
            });
            toast.success("Order request sent to supplier");
            onClose?.();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose?.()}>
            <DialogContent className="max-w-lg" data-testid="order-request-dialog">
                <DialogHeader>
                    <DialogTitle className="text-[#0A0A0B]">Request order</DialogTitle>
                    <DialogDescription>
                        <span className="font-mono">{product.brand} {product.model_number}</span> · {product.toner_type || "Original"} · from {product.supplier_name} ({product.city})
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm flex items-center justify-between">
                        <div>
                            <div className="tc-eyebrow">Unit price</div>
                            <div className="font-mono text-lg text-[#0A0A0B] font-semibold">₹{Number(product.price).toLocaleString('en-IN')}</div>
                        </div>
                        <div className="text-right">
                            <div className="tc-eyebrow">Available stock</div>
                            <div className="font-semibold text-emerald-700">{product.stock} units</div>
                        </div>
                    </div>

                    <div><Label htmlFor="name">Your name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required data-testid="order-name-input" /></div>
                    <div><Label htmlFor="qty">Quantity</Label><Input id="qty" type="number" min={1} max={product.stock} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="order-qty-input" /></div>
                    <div><Label htmlFor="addr">Delivery address</Label><Textarea id="addr" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full delivery address with PIN code" data-testid="order-address-input" /></div>
                    <div><Label htmlFor="phone">Contact phone</Label><Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91-..." data-testid="order-phone-input" /></div>
                    <div><Label htmlFor="notes">Notes (optional)</Label><Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions" data-testid="order-notes-input" /></div>

                    {!user && (
                        <div className="pt-3 border-t border-slate-100">
                            <div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B] flex items-center gap-2">
                                <Lock size={12} /> Quick sign-in
                            </div>
                            <p className="text-[11px] text-[#6E6E73] mt-1">We&apos;ll create a buyer account in one tap. Already have one? Use the same details — we&apos;ll sign you in automatically.</p>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <div><Label>Email</Label><Input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@company.com" data-testid="order-auth-email" /></div>
                                <div><Label>Password</Label><Input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="6+ characters" data-testid="order-auth-password" /></div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="text-sm text-slate-500">Estimated total</div>
                        <div className="font-mono text-xl text-[#0A0A0B] font-bold">₹{(Number(qty) * Number(product.price)).toLocaleString('en-IN')}</div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} data-testid="order-cancel-btn">Cancel</Button>
                    <Button className="btn-cta" onClick={submit} disabled={loading} data-testid="order-submit-btn">{loading ? "Sending…" : "Send request"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
