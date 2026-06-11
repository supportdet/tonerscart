import React from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta";

export const TERMS_VERSION = "2.1";

export default function Terms() {
    return (
        <div className="bg-white" data-testid="terms-page">
            <PageMeta title="Terms of Service — TonersCart" description="Read the Terms of Service for TonersCart Private Limited — India's verified marketplace for printers, toners, papers and consumables." path="/terms" />
            <div className="tc-container py-12 sm:py-16 max-w-3xl">
                <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Legal</div>
                <h1 className="mt-3 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                    Terms of Service
                </h1>
                <p className="text-[12.5px] text-[#86868B] mt-2">Version {TERMS_VERSION} · Last updated: June 2026</p>
                <p className="text-[13px] text-[#3a3a40] mt-3 max-w-2xl" data-testid="terms-attribution">
                    These Terms govern your use of the TonersCart platform, operated by <strong>TonersCart Private Limited</strong>, a company incorporated under the Companies Act, 2013, having its registered office in Bangalore, Karnataka, India (&ldquo;TonersCart&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;the Platform&rdquo;).
                </p>

                <div className="prose mt-8 text-[#1D1D1F] text-[14.5px] leading-[1.75]" style={{ fontFamily: "'Inter', sans-serif" }}>
                    <Section title="1. About TonersCart & Acceptance">
                        TonersCart Private Limited operates an India-focused online marketplace connecting
                        verified third-party suppliers of printer toners, printers, papers and related consumables with buyers.
                        By accessing or using the Platform, registering an account, or placing an order, you confirm that you
                        have read, understood and agree to be bound by these Terms and our{" "}
                        <Link to="/privacy" className="text-[#00B7C7] hover:underline">Privacy Policy</Link>. If you do not agree, please do not use the Platform.
                    </Section>

                    <Section title="2. Nature of the Platform — Intermediary, Not Seller">
                        TonersCart is an <strong>intermediary</strong> within the meaning of the Information Technology Act, 2000.
                        We are a technology marketplace and are <strong>not the seller, manufacturer, importer or distributor</strong>
                        of any product listed. Sellers independently list, price, describe, warrant, invoice and dispatch their own
                        goods. The contract of sale for any order is formed <strong>directly between the buyer and the seller</strong>.
                        TonersCart only facilitates discovery, communication and order coordination.
                    </Section>

                    <Section title="3. Regulatory Compliance">
                        The Platform operates in compliance with applicable Indian laws, including:
                        <List items={[
                            "Information Technology Act, 2000",
                            "Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021",
                            "Consumer Protection Act, 2019",
                            "Consumer Protection (E-Commerce) Rules, 2020",
                            "Central Goods and Services Tax Act, 2017 and applicable GST legislation",
                            "Indian Contract Act, 1872",
                        ]} />
                    </Section>

                    <Section title="4. User Eligibility">
                        You must be at least <strong>18 years of age</strong> and competent to contract under the Indian Contract Act, 1872.
                        Business and government/corporate users must provide a <strong>valid GSTIN</strong> and any other registration details
                        we reasonably require. You are responsible for the accuracy of the information you provide and for maintaining the
                        confidentiality of your account credentials.
                    </Section>

                    <Section title="5. Marketplace Rules">
                        Sellers list, price, warrant and fulfil their own products and must hold all licences required to sell them.
                        TonersCart facilitates the transaction only. Sellers must issue a <strong>GST-compliant invoice</strong> directly to
                        the buyer for every order, maintain accurate stock and descriptions, and dispatch within the stated timeline.
                    </Section>

                    <Section title="6. Order Policy">
                        When a buyer places an order, the request is routed to the seller, who confirms availability and delivery.
                        Stock is reserved against the seller&apos;s inventory at the moment the order is created. A seller may decline an
                        order where stock is genuinely unavailable, in which case any amount collected is refunded.
                    </Section>

                    <Section title="7. Pricing Policy">
                        <strong>Prices are locked at the time of order placement and do not change thereafter.</strong> The unit price and
                        total recorded against an order are the seller&apos;s listed price at the exact moment of order creation. Sellers
                        may revise public listing prices at any time; orders already placed are unaffected.
                    </Section>

                    <Section title="8. Payment Policy">
                        Orders with a value <strong>under ₹1,50,000</strong> may be paid online through our payment partner
                        <strong> Razorpay</strong>. Orders <strong>above ₹1,50,000</strong> are processed on a <strong>deal basis</strong>, where
                        payment terms are coordinated between the buyer, seller and TonersCart. Payment data is handled per RBI guidelines
                        and is never stored on our servers.
                    </Section>

                    <Section title="9. Commission Structure">
                        TonersCart charges sellers a commission on successful orders, deducted from the seller&apos;s payout. The buyer-facing
                        price is unaffected. Commission is charged on the order <strong>bill value, excluding GST / taxes</strong>. Tiers by order value:
                        <List items={[
                            "Under ₹15,000 → 12%",
                            "₹15,000 to ₹30,000 → 10%",
                            "₹30,000 to ₹75,000 → 8%",
                            "₹75,000 to ₹1,00,000 → 6%",
                            "₹1,00,000 and above → 5%",
                        ]} />
                    </Section>

                    <Section title="10. Returns & Refunds">
                        Buyers may request a return for <strong>unopened toner cartridges within 7 days</strong> of delivery, and for
                        <strong> dead-on-arrival (DOA) printers within 3 days</strong> of delivery. Returns are subject to seller verification
                        in coordination with TonersCart support. Approved refunds are processed to the original payment method.
                    </Section>

                    <Section title="11. Dispute Resolution">
                        For any dispute, contact <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a> within
                        <strong> 48 hours</strong> of the event. TonersCart will first attempt good-faith <strong>mediation</strong> between buyer and
                        seller. Unresolved disputes are subject to the governing law and jurisdiction in clause 17.
                    </Section>

                    <Section title="12. Prohibited Activities">
                        The following are strictly prohibited and are grounds for suspension or termination:
                        <List items={[
                            "Listing or selling counterfeit, pirated or otherwise unauthorised goods",
                            "Soliciting or completing off-platform deals to bypass commission",
                            "Scraping, crawling or unauthorised automated access to the Platform",
                            "Spam, phishing, harassment or abuse of other users",
                            "Posting fake, misleading or fraudulent listings or reviews",
                            "Any activity that violates applicable law",
                        ]} />
                    </Section>

                    <Section title="13. Intellectual Property">
                        All intellectual property in the Platform — including software, design, trademarks, logos, content and databases —
                        is owned by or licensed to <strong>TonersCart Private Limited</strong>. You may not copy, reproduce or create derivative
                        works without our prior written consent. Product names and brand marks belong to their respective owners.
                    </Section>

                    <Section title="14. Limitation of Liability">
                        To the maximum extent permitted by law, TonersCart&apos;s aggregate liability for any claim arising from or relating to
                        the Platform or an order is <strong>limited to the commission actually received by TonersCart on the underlying order</strong>.
                        We are not liable for indirect, incidental, special or consequential damages.
                    </Section>

                    <Section title="15. Intermediary Liability Disclaimer">
                        As an intermediary, TonersCart is <strong>not liable for the acts, omissions, products or content of sellers or other
                        users</strong>, in accordance with <strong>Section 79 of the Information Technology Act, 2000</strong> and the Intermediary
                        Guidelines, 2021. We act on valid takedown and grievance requests as required by law.
                    </Section>

                    <Section title="16. Account Termination">
                        We may suspend or terminate your account, with or without notice, for breach of these Terms, suspected fraud, or to
                        comply with law. You may close your account at any time by contacting support; certain records are retained as required
                        by law (see our Privacy Policy).
                    </Section>

                    <Section title="17. Governing Law & Jurisdiction">
                        These Terms are governed by the laws of India. The governing jurisdiction is the State of <strong>Karnataka, India</strong>,
                        and the courts at <strong>Bangalore</strong> shall have exclusive jurisdiction over any dispute.
                    </Section>

                    <Section title="18. Grievance Officer">
                        In accordance with the IT (Intermediary Guidelines) Rules, 2021, grievances may be addressed to our Grievance Officer:
                        <br />
                        <strong>Grievance Officer:</strong> Rohit Sairam, TonersCart Private Limited,
                        Email: <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>,
                        Phone: <a href="tel:+918884546789" className="text-[#00B7C7] hover:underline">+91 88845 46789</a>,
                        Response time: <strong>48 hours</strong>.
                    </Section>

                    <Section title="19. Amendments">
                        We may update these Terms from time to time. Material changes will be notified to registered users by email, and
                        continued use of the Platform after the effective date constitutes acceptance of the revised Terms.
                    </Section>

                    <Section title="20. Contact">
                        Questions about these Terms? Email <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>.
                        TonersCart Private Limited, Bangalore, Karnataka, India. See also our <Link to="/privacy" className="text-[#00B7C7] hover:underline">Privacy Policy</Link>.
                    </Section>

                    <Section title="21. Nodal Officer">
                        In accordance with the Consumer Protection (E-Commerce) Rules, 2020, the Nodal Officer of TonersCart Private Limited is:
                        <br />
                        <strong>Nodal Officer:</strong> Rohit Sairam, TonersCart Private Limited, Bangalore, Karnataka, India,
                        Email: <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>,
                        Phone: <a href="tel:+918884546789" className="text-[#00B7C7] hover:underline">+91 88845 46789</a>,
                        Response time: <strong>48 hours</strong>.
                    </Section>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div className="mt-8">
            <h2 className="text-[#0A0A0B] text-[18px] font-semibold mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>{title}</h2>
            <div>{children}</div>
        </div>
    );
}

function List({ items }) {
    return (
        <ul className="list-disc pl-5 mt-2 space-y-1">
            {items.map((it) => <li key={it}>{it}</li>)}
        </ul>
    );
}
