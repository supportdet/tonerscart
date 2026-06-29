import React from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta";
import { MapPin, Mail, Clock, Sparkles, Target, Users, Shield, Award, Phone } from "lucide-react";

export default function About() {
    return (
        <div className="bg-white min-h-screen" data-testid="about-page">
            <PageMeta
                title="About TonersCart — India's Verified Printer Marketplace"
                description="TonersCart Private Limited is India's digital marketplace connecting verified printer-toner suppliers with buyers — from large organisations to individual customers — across the country. Headquartered in Bangalore, Karnataka."
                path="/about"
            />

            <section className="tc-hero relative pb-16">
                <div className="tc-hero-grid" />
                <div className="tc-container relative pt-12 sm:pt-16">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="tc-strip" />
                        <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">About us</span>
                    </div>
                    <h1 className="text-white max-w-4xl" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(32px, 4.6vw, 60px)", lineHeight: 1.05, letterSpacing: "-0.03em", fontWeight: 300 }}>
                        India&apos;s digital marketplace for <span className="text-[#00B7C7]" style={{ fontWeight: 500 }}>printers</span>, <span className="text-[#E6007E]" style={{ fontWeight: 500 }}>toners</span> &amp; <span className="text-[#F5C400]" style={{ fontWeight: 500 }}>MFDs</span>.
                    </h1>
                    <p className="text-white/70 mt-6 text-[15px] sm:text-[17px] max-w-2xl">
                        Verified suppliers. Real stock. Better prices. Smarter procurement for every business across India.
                    </p>
                </div>
            </section>

            <section className="tc-container py-12 sm:py-16">
                <div className="grid md:grid-cols-2 gap-8 sm:gap-12">
                    <div>
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mb-3">Our story</div>
                        <h2 className="text-[#0A0A0B] text-[26px] sm:text-[32px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                            Why we built TonersCart
                        </h2>
                        <div className="space-y-4 mt-5 text-[14.5px] text-[#3a3a40] leading-relaxed">
                            <p>India&apos;s printer-supplies market has been fragmented for decades — buyers chase calls and quotes, dealers waste days on price discovery, and inventory data lives nowhere except scattered chats and offline ledgers.</p>
                            <p>TonersCart brings that fragmented market online: real stock from <strong>verified suppliers</strong>, transparent prices, GST-compliant invoicing handled by the seller, and a clean dashboard for both sides of the transaction.</p>
                            <p>We don&apos;t hold inventory. We don&apos;t mark up prices. We connect verified dealers with serious buyers — businesses and individuals alike — and take a transparent referral fee only on completed orders.</p>
                        </div>
                    </div>

                    <div>
                        <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mb-3">Our mission</div>
                        <h2 className="text-[#0A0A0B] text-[26px] sm:text-[32px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                            India&apos;s digital marketplace for printers, toners and MFDs.
                        </h2>
                        <ul className="mt-5 space-y-4 text-[14.5px] text-[#3a3a40]">
                            {[
                                { Icon: Target,   t: "Transparent pricing",  d: "No middlemen markup. Buyers see the dealer's price, the platform referral fee, and zero hidden fees." },
                                { Icon: Shield,   t: "Verified suppliers",   d: "Every dealer is KYC-verified — GST, PAN, address proof, AI-checked business documents." },
                                { Icon: Sparkles, t: "Real stock, real time", d: "Live inventory from dealers, not stale catalogues. Orders are placed against actual on-shelf stock." },
                                { Icon: Users,    t: "Built for everyone",       d: "GST invoicing, bulk orders, MPS sourcing, fleet management — built for offices, businesses and homes alike." },
                            ].map(({ Icon, t, d }, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <span className="mt-0.5 w-9 h-9 grid place-items-center rounded-lg bg-[#FFFBEB] border border-[#F5E5A6] text-[#8C6A00]"><Icon size={16} /></span>
                                    <div>
                                        <div className="font-semibold text-[#0A0A0B]">{t}</div>
                                        <div className="text-[13.5px] text-[#6E6E73] mt-1">{d}</div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <section className="bg-[#FAFAFB] border-t border-black/[0.05]">
                <div className="tc-container py-12 sm:py-14">
                    <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mb-3">Company</div>
                    <h2 className="text-[#0A0A0B] text-[26px] sm:text-[32px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.02em" }}>
                        TonersCart Private Limited
                    </h2>
                    <p className="text-[14.5px] text-[#3a3a40] max-w-3xl mt-4 leading-relaxed">
                        TonersCart is operated by <strong>TonersCart Private Limited</strong>, an independent, Bangalore-headquartered private limited company building digital infrastructure for India&apos;s print-supply trade. We bring print-industry expertise and product engineering together to move legacy procurement online.
                    </p>
                    <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white border border-black/[0.06] rounded-2xl p-5">
                            <MapPin size={18} className="text-[#00B7C7]" />
                            <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mt-3">Head office</div>
                            <div className="text-[14.5px] font-semibold text-[#0A0A0B] mt-1">Bangalore, Karnataka</div>
                            <div className="text-[13px] text-[#6E6E73] mt-1">560043, India</div>
                        </div>
                        <div className="bg-white border border-black/[0.06] rounded-2xl p-5">
                            <Mail size={18} className="text-[#E6007E]" />
                            <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mt-3">Email</div>
                            <a href="mailto:support@tonerscart.com" className="block text-[14.5px] font-semibold text-[#0A0A0B] mt-1 hover:underline" data-testid="about-email">support@tonerscart.com</a>
                            <div className="block text-[12px] text-[#6E6E73] mt-1.5">For grievances: <a href="mailto:support@tonerscart.com" className="font-semibold hover:underline">support@tonerscart.com</a> · response within 48 hours</div>
                        </div>
                        <div className="bg-white border border-black/[0.06] rounded-2xl p-5">
                            <Phone size={18} className="text-[#0A8754]" />
                            <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mt-3">Phone</div>
                            <a href="tel:+918884546789" className="block text-[14.5px] font-semibold text-[#0A0A0B] mt-1 hover:underline" data-testid="about-phone">+91 88845 46789</a>
                            <div className="block text-[12px] text-[#6E6E73] mt-1.5">Sales &amp; support · Mon–Sat</div>
                        </div>
                        <div className="bg-white border border-black/[0.06] rounded-2xl p-5">
                            <Clock size={18} className="text-[#F5C400]" />
                            <div className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[#86868B] mt-3">Support hours</div>
                            <div className="text-[14.5px] font-semibold text-[#0A0A0B] mt-1">Mon&ndash;Sat · 9 AM &ndash; 7 PM IST</div>
                            <div className="text-[13px] text-[#6E6E73] mt-1">Response within 48 hours</div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="tc-container py-12 sm:py-16 text-center">
                <Award className="mx-auto text-[#F5C400]" size={28} />
                <h2 className="mt-3 text-[#0A0A0B] text-[26px] sm:text-[32px]" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, letterSpacing: "-0.02em" }}>
                    Ready to buy or sell smarter?
                </h2>
                <p className="text-[14.5px] text-[#6E6E73] mt-2 max-w-xl mx-auto">Join the dealers and buyers transacting on TonersCart every day.</p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <Link to="/search" className="btn-cta" data-testid="about-cta-search">Browse toners</Link>
                    <Link to="/sell" className="btn-light" data-testid="about-cta-sell">Become a seller</Link>
                </div>
            </section>
        </div>
    );
}
