import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import api from "../lib/api";
import TonerCartridge from "./TonerCartridge";
import ProductPlaceholder from "./ProductPlaceholder";
import { extractBrand } from "../lib/brands";

/**
 * "You may also need" — horizontal row of related, in-stock dealer products on
 * the product detail pages (toner / printer / consumable / scanner).
 * Data: GET /api/related/{kind}/{id}
 */
export default function RelatedProducts({ kind, id }) {
    const [items, setItems] = useState([]);

    useEffect(() => {
        let alive = true;
        setItems([]);
        api.get(`/related/${kind}/${id}`)
            .then((r) => { if (alive) setItems(Array.isArray(r.data?.items) ? r.data.items : []); })
            .catch(() => { /* non-blocking */ });
        return () => { alive = false; };
    }, [kind, id]);

    if (items.length === 0) return null;

    return (
        <section className="mt-12" data-testid="related-products">
            <h2 className="text-[18px] font-semibold text-[#0A0A0B] mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                You may also need
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
                {items.map((it) => {
                    return (
                        <Link
                            to={it.url}
                            key={`${it.kind}-${it.id}`}
                            className="shrink-0 w-[200px] tc-product-card overflow-hidden flex flex-col hover:opacity-95"
                            data-testid="related-product-card"
                        >
                            <div className="tc-product-img relative" style={{ height: 116 }}>
                                <span className="tc-product-img-label">{extractBrand(it.brand)}</span>
                                {it.image_url ? (
                                    <img src={it.image_url} alt={it.title} className="w-full h-full object-cover" loading="lazy" />
                                ) : it.kind === "toner" ? (
                                    <TonerCartridge brand={it.brand} />
                                ) : ["printer", "consumable", "scanner"].includes(it.kind) ? (
                                    <ProductPlaceholder kind={it.kind} brand={it.brand} />
                                ) : (
                                    <div className="w-full h-full grid place-items-center"><FileText size={36} className="text-[#C7C7CC]" /></div>
                                )}
                            </div>
                            <div className="p-3 flex flex-col gap-1 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[#86868B] truncate">{extractBrand(it.brand)}</span>
                                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-[0.06em] bg-slate-100 text-slate-700 border-slate-200">{it.kind}</span>
                                </div>
                                <div className="text-[13.5px] font-bold text-[#0A0A0B] leading-snug min-h-[34px]"
                                    style={{ fontFamily: "'Montserrat', sans-serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                    {it.title}
                                </div>
                                <div className="font-mono text-[14px] font-semibold text-[#0A0A0B]" data-testid="related-product-price">
                                    ₹{Number(it.price || 0).toLocaleString("en-IN")}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
