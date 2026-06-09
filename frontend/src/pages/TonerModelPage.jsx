import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Bell, CheckCircle2, Package } from "lucide-react";
import api from "../lib/api";
import PageMeta from "../components/PageMeta";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import RelatedRow from "../components/RelatedRow";
import CompatListingCard from "../components/CompatListingCard";

export default function TonerModelPage() {
    const params = useParams();
    const slug = params.slug || params.id;
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
        api.get(`/compat/toner-page/${slug}`)
            .then((r) => { if (active) setData(r.data); })
            .catch((e) => { if (active && e?.response?.status === 404) setNotFound(true); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [slug]);

    const submitNotify = async (e) => {
        e.preventDefault();
        if (!email.trim()) { toast.error("Enter your email"); return; }
        setSubmitting(true);
        try {
            // Reuse the notify capture, keyed by the first compatible printer (or the toner slug).
            const firstPrinter = data?.compatible_printers?.[0];
            await api.post("/compat/notify", {
                printer_slug: firstPrinter?.slug || `toner-${slug}`,
                printer_name: data?.toner?.model ? `${data.toner.brand} ${data.toner.model}` : slug,
                email: email.trim(),
            });
            setNotified(true);
            toast.success("We'll email you when stock is available.");
        } catch { toast.error("Couldn't save your request. Please try again."); }
        finally { setSubmitting(false); }
    };

    if (loading) {
        return <div className="tc-container py-20 text-center text-[#6E6E73]" data-testid="toner-loading">Loading…</div>;
    }
    if (notFound || !data) {
        return (
            <div className="tc-container py-20 text-center" data-testid="toner-notfound">
                <PageMeta title="Toner not found — TonersCart" description="This toner model was not found." path={`/toner/${slug}`} />
                <h1 className="text-2xl font-semibold text-[#0A0A0B]">Toner model not found</h1>
                <p className="mt-2 text-[#6E6E73]">We couldn't find this cartridge in our database.</p>
                <Link to="/search" className="inline-flex items-center gap-1 mt-5 text-[#00B7C7] font-semibold">Browse all products <ArrowRight size={16} /></Link>
            </div>
        );
    }

    const t = data.toner;
    const listings = data.listings || [];
    const printers = data.compatible_printers || [];
    const related = data.related || {};
    const title = `${t.brand} ${t.model} Price India — Buy from Verified Dealers | TonersCart`;
    const description = `Buy ${t.brand} ${t.model} at best price in India. Compare prices from verified dealers. GST invoice guaranteed. Pan-India delivery.`;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": `${t.brand} ${t.model}`,
        "brand": { "@type": "Brand", "name": t.brand },
        "category": t.type,
        "url": `https://www.tonerscart.com/toner/${t.slug}`,
        ...(listings.length > 0 ? {
            "offers": {
                "@type": "AggregateOffer",
                "priceCurrency": "INR",
                "lowPrice": String(Math.min(...listings.map((l) => Number(l.price) || 0))),
                "highPrice": String(Math.max(...listings.map((l) => Number(l.price) || 0))),
                "offerCount": listings.length,
                "availability": "https://schema.org/InStock",
            },
        } : {}),
    };

    return (
        <div className="bg-[#FBFBFC] min-h-screen" data-testid="toner-page">
            <PageMeta title={title} description={description} path={`/toner/${t.slug}`} jsonLd={jsonLd} />

            {/* Hero */}
            <section className="tc-hero tc-hero-home relative pt-10 pb-10">
                <div className="tc-container">
                    <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase text-white/70 font-semibold">
                        <Package size={13} /> {t.brand} · {t.type}
                    </div>
                    <h1 className="mt-2 text-white text-3xl sm:text-4xl" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }} data-testid="toner-h1">
                        {t.brand} {t.model} — Compatible Printers &amp; Verified Dealers
                    </h1>
                    <p className="mt-2 text-white/75 text-[14px] max-w-2xl">
                        Compare {t.model} prices from verified dealers across India — GST invoice on every order, pan-India delivery.
                    </p>
                </div>
            </section>

            <div className="tc-container py-10 space-y-10">
                {/* Compatible printers */}
                {printers.length > 0 && (
                    <section data-testid="toner-compatible-printers">
                        <h2 className="text-[18px] font-semibold text-[#0A0A0B] mb-3">Compatible printers</h2>
                        <div className="flex flex-wrap gap-2">
                            {printers.map((pr) => (
                                <Link key={pr.slug} to={pr.url} className="inline-flex items-center gap-1.5 bg-white border border-[#E5E5EA] rounded-full px-3 py-1.5 text-[13px] text-[#0A0A0B] hover:border-[#00B7C7]/60 hover:text-[#0A6E78] transition" data-testid="toner-compatible-printer-chip">
                                    <span className="font-semibold">{pr.full_name}</span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* Live dealer listings */}
                <section data-testid="toner-listings-section">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[18px] font-semibold text-[#0A0A0B]">Available from verified dealers</h2>
                        {listings.length > 0 && <span className="text-[12.5px] text-[#86868B]">{listings.length} listing{listings.length > 1 ? "s" : ""}</span>}
                    </div>
                    {listings.length === 0 ? (
                        <div className="text-[13.5px] text-[#6E6E73]" data-testid="toner-no-stock">No verified dealer has listed {t.model} yet — see the suggestions below, or get notified when stock arrives.</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="toner-listings-grid">
                            {listings.map((l) => <CompatListingCard l={l} key={`${l.kind}-${l.id}`} />)}
                        </div>
                    )}
                </section>

                {/* Related / You may also need */}
                {(related.same_printers_toners?.length > 0 || related.same_brand_toners?.length > 0) && (
                    <section className="space-y-6" data-testid="toner-related">
                        <h2 className="text-[18px] font-semibold text-[#0A0A0B]">You may also need</h2>
                        <RelatedRow
                            label="Compatible with same printers"
                            kind="toner"
                            testid="related-same-printers"
                            items={(related.same_printers_toners || []).map((x) => ({ brand: x.brand, title: x.model, subtitle: x.type, url: x.url }))}
                        />
                        <RelatedRow
                            label="From the same brand"
                            kind="toner"
                            testid="related-same-brand"
                            items={(related.same_brand_toners || []).map((x) => ({ brand: x.brand, title: x.model, subtitle: x.type, url: x.url }))}
                        />
                    </section>
                )}

                {/* Notify me — only when no dealer stock */}
                {listings.length === 0 && (
                    <section data-testid="toner-notify-section">
                        <div className="bg-white border border-[#E5E5EA] rounded-2xl p-8 text-center max-w-xl" data-testid="toner-notify-block">
                            <Bell size={26} className="mx-auto text-[#00B7C7]" />
                            <div className="mt-3 text-[16px] font-semibold text-[#0A0A0B]">Notify me when available</div>
                            <p className="mt-1 text-[13.5px] text-[#6E6E73]">Be the first to know when a verified dealer lists {t.brand} {t.model}.</p>
                            {notified ? (
                                <div className="mt-4 inline-flex items-center gap-2 text-[#0A6E78] font-semibold" data-testid="toner-notify-success">
                                    <CheckCircle2 size={18} /> You're on the list!
                                </div>
                            ) : (
                                <form onSubmit={submitNotify} className="mt-4 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                                    <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="tc-input-lg" data-testid="toner-notify-email" />
                                    <Button type="submit" className="btn-pill-cta whitespace-nowrap" disabled={submitting} data-testid="toner-notify-submit">
                                        {submitting ? "Saving…" : "Notify me"}
                                    </Button>
                                </form>
                            )}
                        </div>
                    </section>
                )}

                <Link to="/search" className="inline-flex items-center gap-1 text-[#00B7C7] font-semibold" data-testid="toner-browse-all">
                    Browse all products <ArrowRight size={16} />
                </Link>
            </div>
        </div>
    );
}
