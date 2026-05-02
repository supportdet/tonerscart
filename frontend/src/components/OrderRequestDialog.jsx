import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function OrderRequestDialog({ product, onClose }) {
    const { user } = useAuth();
    const [qty, setQty] = useState(1);
    const [address, setAddress] = useState(user?.company ? `${user.company}, ${user.city || ""}` : "");
    const [phone, setPhone] = useState(user?.phone || "");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!address.trim() || !phone.trim()) { toast.error("Delivery address and contact phone are required"); return; }
        if (qty < 1 || qty > product.stock) { toast.error(`Quantity must be between 1 and ${product.stock}`); return; }
        setLoading(true);
        try {
            await api.post("/orders", {
                product_id: product.id, quantity: Number(qty),
                delivery_address: address, contact_phone: phone, notes,
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
                    <DialogTitle className="text-[#0E0F12]">Request order</DialogTitle>
                    <DialogDescription>
                        <span className="font-mono">{product.brand} {product.model_number}</span> · {product.toner_type || "Original"} · from {product.supplier_company || product.supplier_name} ({product.city})
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm flex items-center justify-between">
                        <div>
                            <div className="tc-eyebrow">Unit price</div>
                            <div className="font-mono text-lg text-[#0E0F12] font-semibold">₹{product.price.toLocaleString('en-IN')}</div>
                        </div>
                        <div className="text-right">
                            <div className="tc-eyebrow">Available stock</div>
                            <div className="font-semibold text-emerald-700">{product.stock} units</div>
                        </div>
                    </div>

                    <div><Label htmlFor="qty">Quantity</Label><Input id="qty" type="number" min={1} max={product.stock} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="order-qty-input" /></div>
                    <div><Label htmlFor="addr">Delivery address</Label><Textarea id="addr" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full delivery address with PIN code" data-testid="order-address-input" /></div>
                    <div><Label htmlFor="phone">Contact phone</Label><Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91-..." data-testid="order-phone-input" /></div>
                    <div><Label htmlFor="notes">Notes (optional)</Label><Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions" data-testid="order-notes-input" /></div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="text-sm text-slate-500">Estimated total</div>
                        <div className="font-mono text-xl text-[#0E0F12] font-bold">₹{(Number(qty) * product.price).toLocaleString('en-IN')}</div>
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
