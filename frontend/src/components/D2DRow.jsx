import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";

// Wave 12 — Reusable Dealer-to-Dealer toggle + price input.
// Works for all product types via configurable PUT endpoint.
//
// Usage:
//   <D2DRow listing={l} endpoint={`/supplier/printers/${l.id}`} onChanged={load} />

export default function D2DRow({ listing, endpoint, onChanged }) {
    const [enabled, setEnabled] = useState(!!listing.d2d_enabled);
    const [price, setPrice] = useState(listing.d2d_price != null ? String(listing.d2d_price) : "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setEnabled(!!listing.d2d_enabled);
        setPrice(listing.d2d_price != null ? String(listing.d2d_price) : "");
    }, [listing.id, listing.d2d_enabled, listing.d2d_price]);

    const patch = async (body) => {
        setSaving(true);
        try {
            await api.put(endpoint, body);
            toast.success("D2D updated");
            onChanged?.();
        } catch (e) {
            const msg = e?.response?.data?.detail || e?.message || "Could not update";
            toast.error(typeof msg === "string" ? msg : "Could not update");
            // Revert local toggle if server rejected
            setEnabled(!!listing.d2d_enabled);
        } finally {
            setSaving(false);
        }
    };

    const toggle = () => {
        const next = !enabled;
        if (next && (!price || Number(price) <= 0)) {
            toast.error("Set a D2D price (₹) first, then enable.");
            return;
        }
        setEnabled(next);
        patch({ d2d_enabled: next, ...(next && price ? { d2d_price: Number(price) } : {}) });
    };

    const savePrice = () => {
        const n = Number(price);
        if (!n || n <= 0) return;
        if (n === Number(listing.d2d_price ?? 0)) return;
        patch({ d2d_price: n });
    };

    return (
        <div className="mt-3 pt-3 border-t border-black/[0.05]" data-testid={`d2d-row-${listing.id}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-[11.5px] font-semibold text-[#0A0A0B] inline-flex items-center gap-1.5">
                    Dealer to Dealer
                    <span
                        className="cursor-help text-[#86868B]"
                        title="Set a special price visible only to verified dealers on TonersCart. Buyers never see this price."
                    >
                        ⓘ
                    </span>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer" data-testid={`d2d-toggle-${listing.id}`}>
                    <span className="text-[11px] text-[#6E6E73]">{enabled ? "On" : "Off"}</span>
                    <span
                        role="switch"
                        aria-checked={enabled}
                        onClick={toggle}
                        className={`relative inline-block w-9 h-5 rounded-full transition-colors ${enabled ? "bg-[#607d8b]" : "bg-[#D2D2D7]"}`}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                            style={{ left: enabled ? "calc(100% - 18px)" : "2px" }}
                        />
                    </span>
                </label>
            </div>
            <div className="flex items-center gap-2">
                <div className="text-[11px] text-[#6E6E73] shrink-0">D2D Price (₹)</div>
                <input
                    type="number"
                    min="0"
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    onBlur={savePrice}
                    placeholder="Lower than list"
                    className="h-8 flex-1 px-2 text-[12px] rounded border border-[#D2D2D7] bg-white font-mono focus:outline-none focus:border-[#607d8b]"
                    data-testid={`d2d-price-input-${listing.id}`}
                    disabled={saving}
                />
            </div>
        </div>
    );
}

// Reusable explainer card — drop above the listings list per tab.
export function D2DExplainer() {
    return (
        <div
            className="mb-5 rounded-2xl p-4 border"
            style={{ background: "#607d8b08", borderColor: "#607d8b33" }}
            data-testid="d2d-explainer-card"
        >
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: "#607d8b1A", color: "#607d8b" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 6v6c0 5 3.4 9.5 8 10 4.6-.5 8-5 8-10V6l-8-4z"/></svg>
                </div>
                <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#0A0A0B] mb-0.5">What is Dealer to Dealer?</div>
                    <p className="text-[12.5px] text-[#52606D] leading-relaxed">
                        Set a special price for fellow verified dealers. Toggle <strong>On</strong> per listing and enter a D2D price — your regular buyers won't see this rate. Only approved dealers on TonersCart's verified network can view and purchase at D2D pricing.
                    </p>
                </div>
            </div>
        </div>
    );
}
