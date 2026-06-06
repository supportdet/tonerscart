import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Store, Loader2, PackageSearch } from "lucide-react";
import api from "../lib/api";
import PageMeta from "../components/PageMeta";

const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

const SECTIONS = [
    { key: "toners", label: "Toners", route: (id) => `/toner/${id}`, price: (r) => r.price, sub: (r) => r.toner_type },
    { key: "printers", label: "Printers", route: (id) => `/printer/${id}`, price: (r) => r.price, sub: (r) => r.category },
    { key: "papers", label: "Papers", route: (id) => `/paper/${id}`, price: (r) => r.price_per_ream, sub: (r) => [r.size, r.gsm ? `${r.gsm} GSM` : ""].filter(Boolean).join(" · ") },
    { key: "consumables", label: "Consumables", route: (id) => `/consumable/${id}`, price: (r) => r.price, sub: (r) => r.subcategory },
];

function ProductCard({ row, section }) {
    const img = row.image_url || (Array.isArray(row.image_urls) ? row.image_urls[0] : null);
    return (
        <Link to={section.route(row.id)} className="group block rounded-xl border border-black/[0.06] bg-white overflow-hidden hover:shadow-[0_12px_30px_-18px_rgba(10,10,11,0.25)] hover:border-black/[0.12] transition" data-testid={`store-card-${row.id}`}>
            <div className="aspect-[4/3] bg-[#F5F5F7] grid place-items-center overflow-hidden">
                {img ? (
                    <img src={img} alt={`${row.brand} ${row.model_number || ""}`} className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform" />
                ) : (
                    <PackageSearch size={28} className="text-[#C8C8CD]" />
                )}
            </div>
            <div className="p-3">
                <div className="text-[13px] text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}>
                    {row.brand} {row.model_number || ""}
                </div>
                {section.sub(row) ? <div className="text-[11.5px] text-[#86868B] truncate mt-0.5 capitalize">{section.sub(row)}</div> : null}
                <div className="text-[14px] text-[#0A0A0B] mt-1.5" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>{money(section.price(row))}</div>
            </div>
        </Link>
    );
}

export default function DealerStore() {
    const { supplierId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            setErr(false);
            try {
                const r = await api.get(`/suppliers/${supplierId}/storefront`);
                if (alive) setData(r.data);
            } catch {
                if (alive) setErr(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [supplierId]);

    if (loading) {
        return <div className="min-h-[60vh] grid place-items-center" data-testid="store-loading"><Loader2 className="animate-spin text-[#86868B]" /></div>;
    }
    if (err || !data) {
        return (
            <div className="min-h-[60vh] grid place-items-center text-center px-6" data-testid="store-error">
                <div>
                    <Store size={32} className="mx-auto text-[#C8C8CD]" />
                    <p className="mt-3 text-[15px] text-[#0A0A0B]">Dealer not found</p>
                    <button onClick={() => navigate("/search")} className="mt-4 h-10 px-5 rounded-xl bg-[#0A0A0B] text-white text-[13px] font-semibold" data-testid="store-browse-all">Browse marketplace</button>
                </div>
            </div>
        );
    }

    const s = data.supplier || {};
    const total = SECTIONS.reduce((n, sec) => n + (data.counts?.[sec.key] || 0), 0);

    return (
        <div className="min-h-screen bg-[#FBFBFC]" data-testid="dealer-store-page">
            <PageMeta title={`${s.business_name} — Dealer store`} description={`Browse ${total} products from ${s.business_name}${s.city ? `, ${s.city}` : ""} on TonersCart.`} path={`/store/${supplierId}`} />

            <div className="tc-container py-6">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[13px] text-[#6E6E73] hover:text-[#0A0A0B] transition" data-testid="store-back-btn">
                    <ArrowLeft size={15} /> Back
                </button>

                {/* Dealer header */}
                <div className="mt-4 flex items-center gap-4 bg-white border border-black/[0.06] rounded-2xl p-5 shadow-[0_10px_30px_-22px_rgba(10,10,11,0.25)]" data-testid="store-header">
                    <div className="w-16 h-16 rounded-xl bg-[#F5F5F7] grid place-items-center overflow-hidden shrink-0">
                        {s.logo_url ? <img src={s.logo_url} alt={s.business_name} className="w-full h-full object-contain" /> : <Store size={26} className="text-[#B6B6BC]" />}
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-[20px] sm:text-[24px] text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, letterSpacing: "-0.02em" }} data-testid="store-name">{s.business_name}</h1>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12.5px] text-[#6E6E73]">
                            {(s.city || s.state) && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {[s.city, s.state].filter(Boolean).join(", ")}</span>}
                            <span data-testid="store-total-count">{total} {total === 1 ? "product" : "products"}</span>
                        </div>
                        {s.tagline ? <p className="text-[12.5px] text-[#86868B] mt-1 truncate">{s.tagline}</p> : null}
                    </div>
                </div>

                {/* Sections */}
                {total === 0 ? (
                    <div className="mt-10 text-center text-[#6E6E73] text-[14px]" data-testid="store-empty">This dealer has no listings in stock right now. Please check back soon.</div>
                ) : (
                    SECTIONS.filter((sec) => (data[sec.key] || []).length > 0).map((sec) => (
                        <div key={sec.key} className="mt-9" data-testid={`store-section-${sec.key}`}>
                            <div className="flex items-baseline gap-3 mb-3">
                                <h2 className="text-[15px] text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>{sec.label}</h2>
                                <span className="text-[12px] text-[#86868B]">{data[sec.key].length}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                                {data[sec.key].map((row) => <ProductCard key={row.id} row={row} section={sec} />)}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
