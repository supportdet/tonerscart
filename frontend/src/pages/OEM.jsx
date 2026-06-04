import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import PageMeta from "../components/PageMeta";
import { Loader2, Building2, ShieldCheck, Sparkles, Mail, BadgeCheck, Package } from "lucide-react";

const ACCENT = "#6d4c41";

const CAT_LABEL = { toner: "Toner", printer: "Printer", paper: "Paper", other: "Product" };

function ProductCard({ product, brand, onEnquire }) {
    return (
        <div
            className="rounded-[18px] overflow-hidden flex flex-col text-left"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
            data-testid={`oem-product-${product.id}`}
        >
            <div className="aspect-[4/3] w-full bg-white/[0.06] flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                    <Package size={28} className="text-white/30" />
                )}
            </div>
            <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] tracking-[0.14em] uppercase font-semibold px-2 py-0.5 rounded-full" style={{ background: `${ACCENT}40`, color: "#E6D4CB" }}>
                        {CAT_LABEL[product.category] || "Product"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300" data-testid="oem-official-brand-badge">
                        <BadgeCheck size={12} /> Official Brand
                    </span>
                </div>
                <div className="text-[15px] font-semibold text-white leading-tight">{product.name}</div>
                {product.model_number && <div className="text-[12px] text-white/55 mt-0.5">Model: {product.model_number}</div>}
                {product.description && <div className="text-[12.5px] text-white/65 mt-2 leading-relaxed line-clamp-3">{product.description}</div>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px] text-white/60">
                    {product.moq && <span>MOQ: <strong className="text-white/80">{product.moq}</strong></span>}
                    {product.price_note && <span>{product.price_note}</span>}
                </div>
                <div className="flex-1" />
                <button
                    onClick={() => onEnquire(product, brand)}
                    className="mt-4 h-10 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-2"
                    style={{ background: "#FFC107", color: "#0A0A0B" }}
                    data-testid={`oem-enquire-btn-${product.id}`}
                >
                    <Mail size={14} /> Enquire
                </button>
            </div>
        </div>
    );
}

export default function OEM() {
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);

    // apply form
    const [open, setOpen] = useState(false);
    const [company, setCompany] = useState("");
    const [brand, setBrand] = useState("");
    const [contact, setContact] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [products, setProducts] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    // enquiry modal
    const [enq, setEnq] = useState(null); // { product, brand }
    const [eName, setEName] = useState("");
    const [eEmail, setEEmail] = useState("");
    const [ePhone, setEPhone] = useState("");
    const [eMsg, setEMsg] = useState("");
    const [eSending, setESending] = useState(false);
    const [eDone, setEDone] = useState(false);

    useEffect(() => {
        let active = true;
        api.get("/oem/public")
            .then(({ data }) => { if (active) setPartners(data.partners || []); })
            .catch(() => { if (active) setPartners([]); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    const hasProducts = partners.length > 0;

    const submit = async (e) => {
        e.preventDefault();
        if (!company.trim() || !brand.trim() || !contact.trim() || !products.trim()) {
            toast.error("Please fill all required fields");
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error("Please enter a valid email"); return; }
        const cleanedPhone = phone.replace(/\D/g, "").slice(-10);
        if (cleanedPhone.length !== 10) { toast.error("Please enter a valid 10-digit mobile number"); return; }

        setSubmitting(true);
        try {
            await api.post("/oem/apply", {
                company: company.trim(),
                brand: brand.trim(),
                contact_name: contact.trim(),
                email: email.trim(),
                phone: `+91${cleanedPhone}`,
                products_note: products.trim(),
            });
            setDone(true);
            toast.success("OEM application received");
        } catch {
            toast.error("Could not submit. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const openEnquiry = (product, b) => { setEnq({ product, brand: b }); setEDone(false); };

    const sendEnquiry = async (e) => {
        e.preventDefault();
        if (!eName.trim()) { toast.error("Please enter your name"); return; }
        if (!/^\S+@\S+\.\S+$/.test(eEmail)) { toast.error("Please enter a valid email"); return; }
        setESending(true);
        try {
            await api.post("/oem/enquire", {
                product_id: enq.product.id,
                name: eName.trim(),
                email: eEmail.trim(),
                phone: ePhone.trim(),
                message: eMsg.trim(),
            });
            setEDone(true);
            toast.success("Enquiry sent to the brand");
        } catch {
            toast.error("Could not send enquiry. Please try again.");
        } finally {
            setESending(false);
        }
    };

    return (
        <>
            <PageMeta title="OEM Marketplace · TonersCart" description="Discover products directly from verified manufacturers. Official brands, verified authenticity." />
            <div className="min-h-[80vh]" style={{ background: "#0A0A0B", color: "#F5F5F7" }} data-testid="oem-page">
                {/* Hero */}
                <div className="tc-container max-w-[1100px] py-16 sm:py-20 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-[0.18em] uppercase font-semibold mb-6" style={{ background: `${ACCENT}26`, color: "#D7C2B8" }}>
                        <Sparkles size={11} /> OEM Marketplace
                    </div>
                    <h1 className="mb-5" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(34px, 6vw, 64px)", fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1.05 }} data-testid="oem-heading">
                        OEM Partner Showcase
                    </h1>
                    <p className="text-[16px] sm:text-[17px] text-white/70 max-w-[640px] mx-auto leading-relaxed mb-10" data-testid="oem-subheading">
                        Products direct from verified manufacturers — official brands, verified authenticity. Enquire directly with the brand.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                        <button onClick={() => setOpen(true)} className="h-12 px-7 rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2" style={{ background: "#FFC107", color: "#0A0A0B" }} data-testid="oem-apply-btn">
                            Apply to showcase
                        </button>
                        <a href="mailto:support@tonerscart.com" className="h-12 px-6 rounded-xl text-[13.5px] font-medium inline-flex items-center justify-center gap-2 text-white/85 hover:text-white" style={{ border: "1px solid rgba(255,255,255,0.18)" }} data-testid="oem-contact-mail">
                            <Mail size={14} /> Contact support
                        </a>
                    </div>
                    <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12.5px] text-white/55 max-w-[760px] mx-auto">
                        <div className="flex items-center gap-2 justify-center"><ShieldCheck size={14} /> Verified manufacturers only</div>
                        <div className="flex items-center gap-2 justify-center"><BadgeCheck size={14} /> Official brand products</div>
                        <div className="flex items-center gap-2 justify-center"><Building2 size={14} /> Direct dealer reach</div>
                    </div>
                </div>

                {/* Showcase */}
                <div className="tc-container max-w-[1100px] pb-20">
                    {loading ? (
                        <div className="py-16 text-center text-white/55 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading showcase…</div>
                    ) : hasProducts ? (
                        <div className="space-y-12">
                            {partners.map((p) => (
                                <div key={p.id} data-testid={`oem-brand-${p.id}`}>
                                    <div className="flex items-center gap-3 mb-5">
                                        {p.logo_url ? (
                                            <img src={p.logo_url} alt={p.brand} className="w-10 h-10 rounded-lg object-cover" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg grid place-items-center" style={{ background: `${ACCENT}33`, color: "#D7C2B8" }}><Building2 size={16} /></div>
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-[20px] font-semibold text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>{p.brand}</h2>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 px-2 py-0.5 rounded-full bg-emerald-400/10"><BadgeCheck size={11} /> Official Brand</span>
                                            </div>
                                            {p.company && p.company !== p.brand && <div className="text-[12px] text-white/50">{p.company}</div>}
                                        </div>
                                    </div>
                                    {/* Verified Manufacturer trust strip */}
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-5 text-[12px] text-white/60" data-testid={`oem-trust-strip-${p.id}`}>
                                        <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium"><ShieldCheck size={13} /> Verified Manufacturer</span>
                                        <span className="inline-flex items-center gap-1.5"><BadgeCheck size={13} /> Official brand products</span>
                                        <span className="inline-flex items-center gap-1.5"><Building2 size={13} /> Direct from the brand</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {p.products.map((pr) => (
                                            <ProductCard key={pr.id} product={pr} brand={p.brand} onEnquire={openEnquiry} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[20px] p-10 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.18)" }} data-testid="oem-empty">
                            <div className="w-12 h-12 mx-auto rounded-xl grid place-items-center mb-4" style={{ background: `${ACCENT}33`, color: "#D7C2B8" }}><Building2 size={20} /></div>
                            <h3 className="text-[18px] font-semibold text-white mb-2">No brands showcasing yet</h3>
                            <p className="text-[13.5px] text-white/55 max-w-[460px] mx-auto mb-6">Be the first verified manufacturer to showcase products directly to dealers across India.</p>
                            <button onClick={() => setOpen(true)} className="h-11 px-6 rounded-xl text-[13.5px] font-semibold inline-flex items-center justify-center gap-2" style={{ background: "#FFC107", color: "#0A0A0B" }} data-testid="oem-empty-apply-btn">
                                Apply to showcase
                            </button>
                        </div>
                    )}
                </div>

                {/* Apply form modal */}
                {open && (
                    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => !submitting && setOpen(false)} data-testid="oem-modal">
                        <div className="bg-white text-[#0A0A0B] rounded-[20px] w-full max-w-[560px] max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 sm:p-8">
                                {done ? (
                                    <div className="text-center py-6" data-testid="oem-success">
                                        <div className="text-[40px] mb-3" style={{ color: ACCENT }}>✓</div>
                                        <h2 className="text-[20px] font-semibold mb-2">Application received</h2>
                                        <p className="text-[14px] text-[#6E6E73] mb-6">Once approved you'll get an email with login details to add your products.</p>
                                        <button onClick={() => { setOpen(false); setDone(false); }} className="text-[13px] font-semibold underline hover:text-[#00B7C7]" data-testid="oem-close">Close</button>
                                    </div>
                                ) : (
                                    <form onSubmit={submit} className="space-y-3.5" data-testid="oem-form">
                                        <h2 className="text-[20px] font-semibold mb-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>OEM Partner Application</h2>
                                        <p className="text-[13px] text-[#6E6E73] mb-4">Share a few details. After admin approval you'll receive login access to manage products.</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Company name *</label>
                                                <input value={company} onChange={(e) => setCompany(e.target.value)} required className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-company" />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Brand *</label>
                                                <input value={brand} onChange={(e) => setBrand(e.target.value)} required className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-brand" />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Contact person *</label>
                                                <input value={contact} onChange={(e) => setContact(e.target.value)} required className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-contact" />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Phone *</label>
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex h-11 items-center px-3 rounded-xl border border-[#D2D2D7] bg-[#F5F5F7] text-[14px] font-medium text-[#6E6E73]">+91</span>
                                                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={10} className="flex-1 h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-phone" />
                                                </div>
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-[12px] font-medium mb-1">Email *</label>
                                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-email" />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="block text-[12px] font-medium mb-1">Products you offer *</label>
                                                <textarea rows={3} value={products} onChange={(e) => setProducts(e.target.value)} required placeholder="e.g. Compatible toner cartridges for HP, Canon, Brother. MOQ 100 pcs." className="w-full px-3 py-2.5 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B] resize-none" data-testid="oem-products" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            <button type="button" onClick={() => setOpen(false)} className="flex-1 h-11 rounded-xl text-[13px] font-semibold border border-[#D2D2D7] hover:bg-black/[0.04]" data-testid="oem-cancel">Cancel</button>
                                            <button type="submit" disabled={submitting} className="flex-1 h-11 rounded-xl text-[13px] font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: ACCENT }} data-testid="oem-submit">
                                                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                                                {submitting ? "Submitting…" : "Submit application"}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Enquiry modal */}
                {enq && (
                    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => !eSending && setEnq(null)} data-testid="oem-enquiry-modal">
                        <div className="bg-white text-[#0A0A0B] rounded-[20px] w-full max-w-[480px] max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 sm:p-8">
                                {eDone ? (
                                    <div className="text-center py-6" data-testid="oem-enquiry-success">
                                        <div className="text-[40px] mb-3 text-emerald-600">✓</div>
                                        <h2 className="text-[20px] font-semibold mb-2">Enquiry sent</h2>
                                        <p className="text-[14px] text-[#6E6E73] mb-6">{enq.brand} will reach out to you directly.</p>
                                        <button onClick={() => setEnq(null)} className="text-[13px] font-semibold underline hover:text-[#00B7C7]" data-testid="oem-enquiry-close">Close</button>
                                    </div>
                                ) : (
                                    <form onSubmit={sendEnquiry} className="space-y-3.5" data-testid="oem-enquiry-form">
                                        <h2 className="text-[19px] font-semibold mb-0.5" style={{ fontFamily: "'Montserrat', sans-serif" }}>Enquire about {enq.product.name}</h2>
                                        <p className="text-[13px] text-[#6E6E73] mb-3">From <strong>{enq.brand}</strong> · sent directly to the brand.</p>
                                        <div>
                                            <label className="block text-[12px] font-medium mb-1">Your name *</label>
                                            <input value={eName} onChange={(e) => setEName(e.target.value)} required className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-enquiry-name" />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Email *</label>
                                                <input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} required className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-enquiry-email" />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-medium mb-1">Phone</label>
                                                <input value={ePhone} onChange={(e) => setEPhone(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B]" data-testid="oem-enquiry-phone" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[12px] font-medium mb-1">Message</label>
                                            <textarea rows={3} value={eMsg} onChange={(e) => setEMsg(e.target.value)} placeholder="Quantity, delivery city, timeline…" className="w-full px-3 py-2.5 rounded-xl border border-[#D2D2D7] text-[14px] focus:outline-none focus:border-[#0A0A0B] resize-none" data-testid="oem-enquiry-message" />
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <button type="button" onClick={() => setEnq(null)} className="flex-1 h-11 rounded-xl text-[13px] font-semibold border border-[#D2D2D7] hover:bg-black/[0.04]" data-testid="oem-enquiry-cancel">Cancel</button>
                                            <button type="submit" disabled={eSending} className="flex-1 h-11 rounded-xl text-[13px] font-semibold text-[#0A0A0B] inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "#FFC107" }} data-testid="oem-enquiry-submit">
                                                {eSending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                                                {eSending ? "Sending…" : "Send enquiry"}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
