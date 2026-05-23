import React from "react";
import { MessageCircle } from "lucide-react";

/** Floating WhatsApp enquiry button used on toner/printer listing cards.
 *  - Desktop: visible on card hover (`group-hover:opacity-100`)
 *  - Mobile : always visible (`opacity-100 sm:opacity-0`)
 */
export default function WhatsAppEnquiry({ brand = "", model = "", className = "", size = "sm" }) {
    const text = `Hi, I'm interested in ${brand} ${model} on TonersCart`.trim();
    const href = `https://wa.me/919742270585?text=${encodeURIComponent(text)}`;
    const height = size === "lg" ? "h-9 text-[12.5px] px-3" : "h-7 text-[11.5px] px-2.5";
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1.5 rounded-full bg-[#25D366] hover:bg-[#1FB855] text-white font-semibold transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${height} ${className}`}
            data-testid={`whatsapp-enquiry-${brand}-${model}`.replace(/\s+/g, "-")}
            title="Chat on WhatsApp"
        >
            <MessageCircle size={size === "lg" ? 14 : 12} /> WhatsApp
        </a>
    );
}
