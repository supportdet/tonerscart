import React from "react";
import { Truck } from "lucide-react";

// Shown on every dealer product upload form (toners, printers, papers,
// consumables, scanners). Delivery is system-defined — dealers do not set it.
// Wave 52 — clearer wording: dealer keeps the full charge, ships themselves.
export default function DeliveryPolicyNote() {
    return (
        <div className="rounded-xl border border-[#BFE3FB] bg-[#EAF6FF] px-4 py-3 flex items-start gap-2.5" data-testid="delivery-policy-note">
            <Truck size={16} className="text-[#0369A1] mt-0.5 shrink-0" />
            <p className="text-[12px] leading-relaxed text-[#0A4A63]">
                <strong>Delivery charges are set by TonersCart and added to the buyer&rsquo;s total at checkout</strong> —
                same-city delivery is free, intercity delivery is ₹100–₹350 depending on product type.
                You are responsible for shipping the order to the buyer using your preferred courier.
                The delivery charge collected from the buyer is passed to you in full to cover your shipping costs.
            </p>
        </div>
    );
}
