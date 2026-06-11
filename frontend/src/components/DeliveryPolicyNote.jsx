import React from "react";
import { Truck } from "lucide-react";

// Shown on every dealer product upload form (toners, printers, papers,
// consumables, scanners). Delivery is system-defined — dealers do not set it.
export default function DeliveryPolicyNote() {
    return (
        <div className="rounded-xl border border-[#BFE3FB] bg-[#EAF6FF] px-4 py-3 flex items-start gap-2.5" data-testid="delivery-policy-note">
            <Truck size={16} className="text-[#0369A1] mt-0.5 shrink-0" />
            <p className="text-[12px] leading-relaxed text-[#0A4A63]">
                <strong>Delivery charges are handled by TonersCart.</strong> Same-city delivery is free.
                For intercity orders, a flat delivery charge (₹100–₹350 depending on product type) is added to the
                buyer&apos;s total at checkout. This charge is passed directly to you to cover shipping costs.
                Your commission is calculated only on the product price, not on delivery charges.
            </p>
        </div>
    );
}
