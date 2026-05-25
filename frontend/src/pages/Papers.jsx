import React, { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useNavigate } from "react-router-dom";
import { Loader2, Package, Search, MapPin } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import PageMeta from "../components/PageMeta";
import { formatApiError } from "../lib/api";

const SIZES = ["A4", "A3", "A5", "Letter"];
const GSMS = [70, 75, 80, 90, 100, 120];

const fmtMoney = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

export default function Papers() {
    const { city: appCity } = useCity();
    const { user } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        brand: "", size: "", gsm: "", city: appCity || "",
    });

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.brand) params.brand = filters.brand;
            if (filters.size) params.size = filters.size;
            if (filters.gsm) params.gsm = Number(filters.gsm);
            if (filters.city) params.city = filters.city;
            const { data } = await api.get("/papers", { params });
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.city]);

    const requestOrder = (p) => {
        if (!user) {
            toast.message("Please sign in to place a paper order");
            window.location.href = "/login";
            return;
        }
        toast.message("Paper order requests open soon — supplier contact details below.");
    };

    return (
        <div className="bg-[#FAFAFB] min-h-screen pb-20" data-testid="papers-page">
            <PageMeta
                title="Buy A4 & A3 Papers Online India — Verified Paper Suppliers | TonersCart"
                description="Buy A4, A3, A5 and Letter-size papers in bulk from verified suppliers across India. Compare GSM, price per ream and box from real stock."
                path="/papers"
            />
            <div className="tc-container py-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#6E6E73]">Buy Papers</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                    A4 / A3 papers from verified suppliers
                </h1>

                {/* Filters */}
                <div className="mt-6 flex flex-wrap gap-3 items-center bg-white border border-black/[0.06] rounded-xl p-3 shadow-sm">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                        <Input value={filters.brand} onChange={(e) => setFilters({ ...filters, brand: e.target.value })} placeholder="Brand…" className="pl-9" data-testid="papers-brand-input" />
                    </div>
                    <select value={filters.size} onChange={(e) => setFilters({ ...filters, size: e.target.value })} className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]" data-testid="papers-size-select">
                        <option value="">All sizes</option>
                        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={filters.gsm} onChange={(e) => setFilters({ ...filters, gsm: e.target.value })} className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]" data-testid="papers-gsm-select">
                        <option value="">All GSM</option>
                        {GSMS.map((g) => <option key={g} value={g}>{g} GSM</option>)}
                    </select>
                    <select value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[13px]" data-testid="papers-city-select">
                        <option value="">All cities</option>
                        {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Button onClick={load} className="btn-cta" data-testid="papers-apply-btn">Apply</Button>
                </div>

                {/* Results */}
                {loading ? (
                    <div className="py-20 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading papers…</div>
                ) : rows.length === 0 ? (
                    <div className="mt-10 bg-white border border-black/[0.06] rounded-2xl p-10 text-center" data-testid="papers-empty">
                        <Package size={28} className="mx-auto text-[#86868B]" />
                        <div className="mt-3 text-[15px] font-semibold text-[#0A0A0B]">No paper listings yet</div>
                        <div className="mt-1 text-[12.5px] text-[#6E6E73]">Suppliers are onboarding. Check back soon or contact us for bulk needs.</div>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rows.map((p) => (
                            <PaperCard key={p.id} p={p} onRequest={requestOrder} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function PaperCard({ p, onRequest }) {
    const pricePerBox = Number(p.price_per_ream) * Number(p.reams_per_box || 1);
    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl p-4 shadow-sm" data-testid={`paper-card-${p.id}`}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#86868B]">{p.brand}</div>
                    <div className="font-semibold text-[15px] text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.size} · {p.gsm} GSM</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{p.stock} boxes</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                <div>
                    <div className="text-[10.5px] uppercase tracking-wider text-[#86868B]">Per ream</div>
                    <div className="font-mono font-semibold text-[#0A0A0B]">{fmtMoney(p.price_per_ream)}</div>
                </div>
                <div>
                    <div className="text-[10.5px] uppercase tracking-wider text-[#86868B]">Per box ({p.reams_per_box})</div>
                    <div className="font-mono font-semibold text-[#0A0A0B]">{fmtMoney(pricePerBox)}</div>
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6E6E73]">
                <span className="inline-flex items-center gap-1"><MapPin size={11} /> {p.supplier_city || p.city || "—"}</span>
                <span>{p.supplier_name}</span>
            </div>
            <Button onClick={() => onRequest(p)} className="btn-cta w-full mt-3 text-[13px]" data-testid={`paper-request-${p.id}`}>Request Order</Button>
        </div>
    );
}
