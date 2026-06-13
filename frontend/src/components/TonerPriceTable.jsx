import React from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, MapPin, Award, Package } from "lucide-react";
import { DELIVERY_RATES } from "../lib/delivery";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/**
 * Hybrid dealer listings view used on `/toner/:slug`.
 *  • Cheapest listing → featured card (with placeholder image ~80px, distinct
 *    highlight, prominent Buy Now).
 *  • Remaining listings → compact image-less rows below.
 *
 * Listings are pre-sorted lowest total first by the API.
 */
export default function TonerPriceTable({ listings, firstRowRef }) {
    if (!listings || listings.length === 0) return null;
    const [featured, ...rest] = listings;

    return (
        <div className="space-y-4" data-testid="toner-price-table">
            {/* Featured cheapest listing — distinct emerald card */}
            <article
                ref={firstRowRef}
                className="relative bg-white border-2 border-emerald-300 rounded-2xl p-4 sm:p-5 shadow-[0_4px_18px_-6px_rgba(16,185,129,0.18)] overflow-hidden"
                data-testid={`price-featured-${featured.id}`}
            >
                <div className="absolute top-0 left-4 sm:left-5 inline-flex items-center gap-1 bg-emerald-500 text-white text-[10px] tracking-[0.16em] uppercase font-bold px-2.5 py-1 rounded-b-md">
                    <Award size={11} /> Lowest price
                </div>

                <div className="mt-4 flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
                    {/* Small placeholder image (~80px) */}
                    <div className="shrink-0 w-20 h-20 rounded-xl bg-gradient-to-br from-[#F2FBFC] to-[#E0F4F6] border border-[#C2EFF5] grid place-items-center" aria-hidden="true">
                        {featured.image_url ? (
                            <img src={featured.image_url} alt="" className="w-full h-full object-cover rounded-xl" loading="lazy" />
                        ) : (
                            <Package size={28} className="text-[#0A6E78]/60" />
                        )}
                    </div>

                    {/* Dealer info + price */}
                    <div className="flex-1 min-w-0 w-full">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[15.5px] font-semibold text-[#0A0A0B] truncate">{featured.dealer_name}</div>
                                {featured.dealer_city ? (
                                    <div className="text-[12px] text-[#6E6E73] mt-0.5 inline-flex items-center gap-1">
                                        <MapPin size={11} /> {featured.dealer_city}
                                    </div>
                                ) : null}
                                <div className="mt-1 text-[11px] text-emerald-700 font-medium">
                                    Local delivery: Free · Intercity: +{inr(DELIVERY_RATES.toner)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-[22px] font-bold text-[#0A0A0B] leading-none" data-testid={`price-featured-total-${featured.id}`}>
                                    {inr(featured.total_price)}
                                </div>
                                <div className="text-[10.5px] text-[#86868B] mt-1">
                                    incl. {featured.gst_rate}% GST · base {inr(featured.price)}
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            <Link
                                to={featured.url}
                                className="btn-pill-cta inline-flex items-center gap-1.5 px-5 py-2 text-[13.5px] whitespace-nowrap"
                                data-testid={`price-buy-${featured.id}`}
                            >
                                <ShoppingCart size={14} /> Buy now
                            </Link>
                            <Link
                                to={featured.url}
                                className="inline-flex items-center text-[12.5px] font-semibold text-[#0A6E78] hover:text-[#00838f] px-2 py-2"
                                data-testid={`price-view-${featured.id}`}
                            >
                                View details
                            </Link>
                        </div>
                    </div>
                </div>
            </article>

            {/* Remaining listings — compact rows, no images */}
            {rest.length > 0 && (
                <div className="bg-white border border-[#E5E5EA] rounded-2xl overflow-hidden" data-testid="toner-other-listings">
                    <div className="px-4 py-2.5 border-b border-[#EEE] bg-[#FAFAFB]">
                        <div className="text-[11px] tracking-[0.12em] uppercase text-[#86868B] font-semibold">
                            Other verified dealers ({rest.length})
                        </div>
                    </div>
                    <ul>
                        {rest.map((l) => (
                            <li
                                key={`${l.kind}-${l.id}`}
                                className="px-4 py-3 border-b border-[#F2F2F4] last:border-b-0 flex flex-wrap items-center gap-3 hover:bg-[#FBFBFC] transition"
                                data-testid={`price-row-${l.id}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13.5px] font-semibold text-[#0A0A0B] truncate">{l.dealer_name}</div>
                                    <div className="text-[11px] text-[#86868B] truncate">
                                        {l.dealer_city || ""}{l.dealer_city ? " · " : ""}incl. {l.gst_rate}% GST · base {inr(l.price)}
                                    </div>
                                </div>
                                <div className="font-mono text-[15px] font-semibold text-[#0A0A0B] text-right shrink-0" data-testid={`price-total-${l.id}`}>
                                    {inr(l.total_price)}
                                </div>
                                <Link
                                    to={l.url}
                                    className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0A6E78] hover:text-[#00838f] border border-[#C2EFF5] bg-[#ECFBFD] hover:bg-[#D6F5F9] rounded-full px-3 py-1.5 whitespace-nowrap"
                                    data-testid={`price-buy-${l.id}`}
                                >
                                    <ShoppingCart size={12} /> Buy
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
