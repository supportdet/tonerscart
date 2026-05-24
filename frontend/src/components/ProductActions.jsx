import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

/**
 * Two buyer actions for a product (toner or printer):
 *  - Download Brochure → opens signed PDF in a new tab (only if listing has spec_pdf_url)
 *  - Get Quotation     → sends a quotation email to the signed-in buyer
 *
 * Both buttons redirect to /login if the user is not signed in.
 */
export default function ProductActions({ listing, listingType = "toner", qty = 1, compact = false }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [busy, setBusy] = useState(false);
    const [quoteBusy, setQuoteBusy] = useState(false);

    const hasBrochure = !!listing?.spec_pdf_url;

    const requireLogin = (next) => {
        toast.message("Please sign in to continue");
        navigate(`/login?next=${encodeURIComponent(next || "/search")}`);
    };

    const downloadBrochure = async () => {
        if (!user) return requireLogin(window.location.pathname + window.location.search);
        if (!hasBrochure) return;
        setBusy(true);
        try {
            const { data } = await api.get(`/listings/${listing.id}/brochure`, {
                params: { listing_type: listingType },
            });
            if (data?.url) {
                window.open(data.url, "_blank", "noopener,noreferrer");
            } else {
                toast.error("Brochure unavailable");
            }
        } catch (err) {
            toast.error(formatApiError(err) || "Could not fetch brochure");
        } finally {
            setBusy(false);
        }
    };

    const getQuotation = async () => {
        if (!user) return requireLogin(window.location.pathname + window.location.search);
        setQuoteBusy(true);
        try {
            const { data } = await api.post("/quotation", {
                listing_id: listing.id,
                listing_type: listingType,
                qty: Math.max(1, Number(qty) || 1),
            });
            toast.success(`Quotation sent to your email${data?.email ? ` (${data.email})` : ""}`);
        } catch (err) {
            toast.error(formatApiError(err) || "Could not send quotation");
        } finally {
            setQuoteBusy(false);
        }
    };

    const btnBase = compact
        ? "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 text-[11.5px] font-semibold rounded-lg border transition"
        : "inline-flex items-center justify-center gap-1.5 h-9 px-3 text-[12.5px] font-semibold rounded-lg border transition";

    return (
        <div className="grid grid-cols-2 gap-2" data-testid={`product-actions-${listing.id}`}>
            <button
                type="button"
                onClick={downloadBrochure}
                disabled={!hasBrochure || busy}
                title={hasBrochure ? "Download brochure" : "Brochure not available"}
                className={`${btnBase} ${hasBrochure ? "bg-white text-[#0A0A0B] border-[#D2D2D7] hover:border-[#0A0A0B]" : "bg-[#F4F4F6] text-[#86868B] border-[#E5E5EA] cursor-not-allowed"}`}
                data-testid={`brochure-btn-${listing.id}`}
            >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                Brochure
            </button>
            <button
                type="button"
                onClick={getQuotation}
                disabled={quoteBusy}
                className={`${btnBase} bg-[#0A0A0B] text-white border-[#0A0A0B] hover:bg-[#1D1D1F]`}
                data-testid={`quotation-btn-${listing.id}`}
            >
                {quoteBusy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />}
                Quotation
            </button>
        </div>
    );
}
