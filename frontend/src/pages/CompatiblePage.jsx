import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Bell, CheckCircle2, Printer as PrinterIcon } from "lucide-react";
import api from "../lib/api";
import PageMeta from "../components/PageMeta";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import RelatedRow from "../components/RelatedRow";
import CompatListingCard from "../components/CompatListingCard";

export default function CompatiblePage() {
    const { slug } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [email, setEmail] = useState("");
    const [notified, setNotified] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setNotFound(false);
        api.get(`/compat/printer/${slug}`)
            .then((r) => { if (active) setData(r.data); })
            .catch((e) => { if (active) { if (e?.response?.status === 404) setNotFound(true); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [slug]);

    const submitNotify = async (e) => {
        e.preventDefault();
        if (!email.trim()) { toast.error("Enter your email"); return; }
        setSubmitting(true);
        try {
            await api.post("/compat/notify", {
                printer_slug: slug,
                printer_name: data?.printer?.full_name || "",
                email: email.trim(),
            });
            setNotified(true);
            toast.success("We'll email you when stock is available.");
        } catch { toast.error("Couldn't save your request. Please try again."); }
        finally { setSubmitting(false); }
    };

    if (loading) {
        return <div className="tc-container py-20 text-center text-[#6E6E73]" data-testid="compatible-loading">Loading…</div>;
    }
    if (notFound || !data) {
        return (
            <div className="tc-container py-20 text-center" data-testid="compatible-notfound">
                <PageMeta title="Printer not found — TonersCart" description="This printer model was not found." path={`/compatible/${slug}`} />
                <h1 className="text-2xl font-semibold text-[#0A0A0B]">Printer model not found</h1>
                <p className="mt-2 text-[#6E6E73]">We couldn't find this model in our compatibility database.</p>
                <Link to="/search" className="inline-flex items-center gap-1 mt-5 text-[#00B7C7] font-semibold">Browse all products <ArrowRight size={16} /></Link>
            </div>
        );
    }

    const p = data.printer;
    const listings = data.listings || [];
    const toners = data.compatible_toners || [];
    const related = data.related || {};
    const title = `Compatible Toners & Consumables for ${p.full_name} — TonersCart`;
    const description = `Find verified compatible toners, drums and consumables for ${p.full_name}. Compare prices from verified dealers. GST invoice on every order.`;

    const jsonLd = listings.length > 0 ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": title,
        "itemListElement": listings.slice(0, 20).map((l, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "item": {
                "@type": "Product",
                "name": l.title || `${l.brand} ${l.model_number}`,
                "brand": { "@type": "Brand", "name": l.brand || p.brand },
                "url": `https://www.tonerscart.com${l.url}`,
                "offers": {
                    "@type": "Offer",
                    "priceCurrency": "INR",
                    "price": String(l.price || 0),
                    "availability": (l.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                },
            },
        })),
    } : {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "description": description,
    };

    return (
        <div className="bg-[#FBFBFC] min-h-screen" data-testid="compatible-page">
            <PageMeta title={title} description={description} path={`/compatible/${slug}`} jsonLd={jsonLd} />

            {/* Hero */}
            <section className="tc-hero tc-hero-home relative pt-10 pb-10">
                <div className="tc-container">
                    <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase text-white/70 font-semibold">
                        <PrinterIcon size={13} /> {p.brand} · {p.type === "mfd" ? "Multifunction" : p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                    </div>
                    <h1 className="mt-2 text-white text-3xl sm:text-4xl" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }} data-testid="compatible-h1">
                        Compatible products for {p.full_name}
                    </h1>
                    <p className="mt-2 text-white/75 text-[14px] max-w-2xl">
                        Verified compatible toners, drums and consumables from trusted dealers — with GST invoice and pan-India delivery.
                    </p>
                </div>
            </section>

            <div className="tc-container py-10 space-y-10">
                {/* Known compatible cartridge models — each chip links to its
                    SEO model page (/toner/:slug for laser toners,
                    /consumable/:slug for inks, drums, ribbons, etc.) */}
                {toners.length > 0 && (
                    <section data-testid="compatible-toner-models">
                        <h2 className="text-[18px] font-semibold text-[#0A0A0B] mb-3">Compatible cartridge models</h2>
                        <div className="flex flex-wrap gap-2">
                            {toners.map((t) => {
                                const tType = (t.type || "").toLowerCase().trim();
                                const isToner = tType === "toner";
                                const slug = t.slug || t.model;
                                const to = isToner ? `/toner/${slug}` : `/consumable/${slug}`;
                                return (
                                    <Link
                                        key={t.model}
                                        to={to}
                                        className="inline-flex items-center gap-1.5 bg-white border border-[#E5E5EA] rounded-full px-3 py-1.5 text-[13px] text-[#0A0A0B] hover:border-[#00B7C7]/60 hover:text-[#0A6E78] transition"
                                        data-testid="compatible-cartridge-chip"
                                    >
                                        <span className="font-semibold">{t.model}</span>
                                        <span className="text-[#86868B] text-[11.5px] uppercase">{t.type}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Live dealer listings */}
                <section data-testid="compatible-listings-section">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[18px] font-semibold text-[#0A0A0B]">Available from verified dealers</h2>
                        {listings.length > 0 && <span className="text-[12.5px] text-[#86868B]">{listings.length} product{listings.length > 1 ? "s" : ""}</span>}
                    </div>
                    {listings.length === 0 ? (
                        <div className="text-[13.5px] text-[#6E6E73]" data-testid="compatible-no-stock">No verified dealer has listed a compatible product yet — see the suggestions below, or get notified when stock arrives.</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="compatible-listings-grid">
                            {listings.map((l) => <CompatListingCard l={l} key={`${l.kind}-${l.id}`} />)}
                        </div>
                    )}
                </section>

                {/* Related / You may also need */}
                {(related.same_brand_printers?.length > 0 || related.compatible_toner_models?.length > 0) && (
                    <section className="space-y-6" data-testid="compatible-related">
                        <h2 className="text-[18px] font-semibold text-[#0A0A0B]">You may also need</h2>
                        <RelatedRow
                            label="Compatible cartridges"
                            kind="toner"
                            testid="related-compatible-cartridges"
                            items={related.compatible_toner_models || []}
                        />
                        <RelatedRow
                            label={`More ${p.brand} printers`}
                            kind="printer"
                            testid="related-same-brand-printers"
                            items={related.same_brand_printers || []}
                        />
                    </section>
                )}

                {/* Notify me — only when no dealer stock */}
                {listings.length === 0 && (
                    <section data-testid="compatible-notify-section">
                        <div className="bg-white border border-[#E5E5EA] rounded-2xl p-8 text-center max-w-xl" data-testid="compatible-notify-block">
                            <Bell size={26} className="mx-auto text-[#00B7C7]" />
                            <div className="mt-3 text-[16px] font-semibold text-[#0A0A0B]">Notify me when available</div>
                            <p className="mt-1 text-[13.5px] text-[#6E6E73]">Be the first to know when a verified dealer lists a compatible product for the {p.full_name}.</p>
                            {notified ? (
                                <div className="mt-4 inline-flex items-center gap-2 text-[#0A6E78] font-semibold" data-testid="compatible-notify-success">
                                    <CheckCircle2 size={18} /> You're on the list!
                                </div>
                            ) : (
                                <form onSubmit={submitNotify} className="mt-4 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                                    <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="tc-input-lg" data-testid="compatible-notify-email" />
                                    <Button type="submit" className="btn-pill-cta whitespace-nowrap" disabled={submitting} data-testid="compatible-notify-submit">
                                        {submitting ? "Saving…" : "Notify me"}
                                    </Button>
                                </form>
                            )}
                        </div>
                    </section>
                )}

                <Link to="/search" className="inline-flex items-center gap-1 text-[#00B7C7] font-semibold" data-testid="compatible-browse-all">
                    Browse all products <ArrowRight size={16} />
                </Link>
            </div>
        </div>
    );
}
