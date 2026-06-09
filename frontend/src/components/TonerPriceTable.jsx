import React from "react";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** Compact dealer price-comparison table (sorted lowest total first by the API). */
export default function TonerPriceTable({ listings, firstRowRef }) {
    return (
        <div className="overflow-x-auto border border-[#E5E5EA] rounded-2xl bg-white" data-testid="toner-price-table">
            <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                    <tr className="text-[11px] uppercase tracking-[0.1em] text-[#86868B] border-b border-[#EEE] bg-[#FAFAFB]">
                        <th className="px-4 py-3 font-semibold">Dealer</th>
                        <th className="px-4 py-3 font-semibold">Price (ex GST)</th>
                        <th className="px-4 py-3 font-semibold">GST</th>
                        <th className="px-4 py-3 font-semibold">Total</th>
                        <th className="px-4 py-3 font-semibold">Delivery</th>
                        <th className="px-4 py-3" aria-label="Buy" />
                    </tr>
                </thead>
                <tbody>
                    {listings.map((l, i) => (
                        <tr
                            key={`${l.kind}-${l.id}`}
                            ref={i === 0 ? firstRowRef : null}
                            className={`border-b border-[#F2F2F4] ${i === 0 ? "bg-[#F2FBFC]" : ""}`}
                            data-testid={`price-row-${l.id}`}
                        >
                            <td className="px-4 py-3">
                                <div className="text-[13.5px] font-semibold text-[#0A0A0B]">{l.dealer_name}</div>
                                <div className="text-[11px] text-[#86868B]">
                                    {l.dealer_city || ""}{i === 0 ? `${l.dealer_city ? " · " : ""}Lowest price` : ""}
                                </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[13.5px] text-[#1D1D1F]">{inr(l.price)}</td>
                            <td className="px-4 py-3 text-[13px] text-[#6E6E73]">{l.gst_rate}%</td>
                            <td className="px-4 py-3 font-mono text-[15px] font-semibold text-[#0A0A0B]">{inr(l.total_price)}</td>
                            <td className="px-4 py-3 text-[12px] text-[#6E6E73]">
                                <div className="text-emerald-700 font-medium">Local: Free</div>
                                {l.intercity_delivery_charge > 0
                                    ? <div>Intercity: +{inr(l.intercity_delivery_charge)}</div>
                                    : <div>Intercity: on request</div>}
                            </td>
                            <td className="px-4 py-3">
                                <Link to={l.url} className="btn-pill-cta text-[12.5px] px-4 py-2 inline-flex items-center gap-1 whitespace-nowrap" data-testid={`price-buy-${l.id}`}>
                                    <ShoppingCart size={13} /> Buy
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
