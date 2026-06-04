import React, { useEffect, useState } from "react";
import { Eye, MapPin, Loader2, BarChart3 } from "lucide-react";
import api from "../lib/api";

/**
 * Basic listing-view analytics for the supplier dashboard.
 * Reads from GET /api/supplier/analytics/views which aggregates anonymous
 * product-detail views by city. Degrades gracefully to an empty state when
 * the listing_views table has not been migrated yet.
 */
export default function SupplierInsights() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        api.get("/supplier/analytics/views")
            .then((r) => { if (alive) setData(r.data || null); })
            .catch(() => { if (alive) setData(null); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    if (loading) {
        return (
            <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2" data-testid="insights-loading">
                <Loader2 size={16} className="animate-spin" /> Loading insights…
            </div>
        );
    }

    const total = data?.total_views || 0;
    const cities = Array.isArray(data?.by_city) ? data.by_city : [];
    const maxCount = cities.reduce((m, c) => Math.max(m, c.count || 0), 0) || 1;

    return (
        <div className="space-y-6" data-testid="supplier-insights">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="tc-card-flat p-5" data-testid="insight-total-views">
                    <div className="flex items-center gap-2 text-[#86868B]">
                        <Eye size={15} /><span className="text-[11px] tracking-[0.16em] uppercase font-semibold">Total views</span>
                    </div>
                    <div className="mt-2 text-[28px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}>
                        {total.toLocaleString("en-IN")}
                    </div>
                </div>
                <div className="tc-card-flat p-5" data-testid="insight-cities-count">
                    <div className="flex items-center gap-2 text-[#86868B]">
                        <MapPin size={15} /><span className="text-[11px] tracking-[0.16em] uppercase font-semibold">Cities reached</span>
                    </div>
                    <div className="mt-2 text-[28px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}>
                        {cities.length.toLocaleString("en-IN")}
                    </div>
                </div>
            </div>

            <div className="tc-card-flat p-5">
                <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={15} className="text-[#00B7C7]" />
                    <span className="text-[13px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                        Where your viewers are from
                    </span>
                </div>
                {cities.length === 0 ? (
                    <div className="text-[13px] text-[#6E6E73] py-6 text-center" data-testid="insights-empty">
                        No views recorded yet. As buyers open your listings, you&apos;ll see which cities they&apos;re browsing from here.
                    </div>
                ) : (
                    <div className="space-y-2.5" data-testid="insights-city-list">
                        {cities.map((c) => (
                            <div key={c.city || "unknown"} className="flex items-center gap-3" data-testid={`insight-city-${(c.city || "unknown").toLowerCase()}`}>
                                <div className="w-28 shrink-0 text-[12.5px] text-[#1D1D1F] truncate">{c.city || "Unknown"}</div>
                                <div className="flex-1 h-2.5 rounded-full bg-black/[0.06] overflow-hidden">
                                    <div className="h-full rounded-full bg-[#00B7C7]" style={{ width: `${Math.max(6, (c.count / maxCount) * 100)}%` }} />
                                </div>
                                <div className="w-10 shrink-0 text-right font-mono text-[12.5px] font-semibold text-[#0A0A0B]">{c.count}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
