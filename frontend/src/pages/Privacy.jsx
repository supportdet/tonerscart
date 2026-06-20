import React from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta";

export const PRIVACY_VERSION = "2.1";

export default function Privacy() {
    return (
        <div className="bg-white" data-testid="privacy-page">
            <PageMeta title="Privacy Policy — TonersCart" description="How TonersCart Private Limited collects, uses and protects your data in compliance with the DPDPA 2023 and IT Rules 2021." path="/privacy" />
            <div className="tc-container py-12 sm:py-16 max-w-3xl">
                <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Legal</div>
                <h1 className="mt-3 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                    Privacy Policy
                </h1>
                <p className="text-[12.5px] text-[#86868B] mt-2">Version {PRIVACY_VERSION} · Last updated: June 2026</p>
                <p className="text-[13px] text-[#3a3a40] mt-3 max-w-2xl" data-testid="privacy-attribution">
                    This Privacy Policy explains how <strong>TonersCart Private Limited</strong>, a company incorporated under the Companies Act, 2013,
                    with its registered office in Bangalore, Karnataka, India (the &ldquo;Data Fiduciary&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;),
                    collects and processes your personal data.
                </p>

                <div className="prose mt-8 text-[#1D1D1F] text-[14.5px] leading-[1.75]" style={{ fontFamily: "'Inter', sans-serif" }}>
                    <Section title="1. Scope & Compliance">
                        This Policy is framed in compliance with India&apos;s <strong>Digital Personal Data Protection Act, 2023 (DPDPA)</strong>,
                        the <strong>Information Technology Act, 2000</strong> and the IT (Reasonable Security Practices and Procedures and Sensitive
                        Personal Data or Information) Rules, 2011, applicable <strong>RBI guidelines</strong> for payment data, and standard
                        e-commerce privacy requirements.
                    </Section>

                    <Section title="2. Data Controller / Data Fiduciary">
                        TonersCart Private Limited is the Data Fiduciary responsible for your personal data processed on the Platform.
                        Contact: <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>, Bangalore, Karnataka, India.
                    </Section>

                    <Section title="3. Data We Collect">
                        Depending on how you use the Platform, we may collect:
                        <List items={[
                            "Identity & contact: name, email address, phone number, business/organisation name",
                            "Compliance data: GSTIN, PAN, business address, and KYC documents (for sellers and procurement users)",
                            "Order & transaction data: orders, delivery addresses, communications with counterparties",
                            "Usage data: IP address, device/browser information, and activity logs",
                            "Cookies: functional cookies only (see clause 9)",
                        ]} />
                        We do not intentionally collect more data than is necessary for the purposes below.
                    </Section>

                    <Section title="4. Purpose of Collection">
                        We process personal data to:
                        <List items={[
                            "Operate the marketplace and match buyers with sellers",
                            "Verify identity and perform KYC for sellers and procurement users",
                            "Process orders, payments, delivery and after-sales support",
                            "Send transactional notifications and respond to your requests",
                            "Maintain security, prevent fraud, and meet legal obligations",
                        ]} />
                    </Section>

                    <Section title="5. Legal Basis for Processing">
                        We process personal data on one or more of the following bases under the DPDPA: your <strong>consent</strong>;
                        the necessity to <strong>perform a contract</strong> with you (e.g. fulfilling an order); and compliance with a
                        <strong> legal obligation</strong> (e.g. GST and tax record-keeping). You may withdraw consent at any time, subject
                        to legal retention requirements.
                    </Section>

                    <Section title="6. Data Retention">
                        We retain personal data for as long as your account is active and, after closure, for a period of
                        <strong> 7 years</strong> to comply with GST, tax and statutory record-keeping obligations. Data no longer required
                        is securely deleted or anonymised. Upon a verified data deletion request, personal data not subject to legal
                        retention obligations will be deleted within <strong>30 days</strong>.
                    </Section>

                    <Section title="7. Third-Party Sharing">
                        We do <strong>not sell, rent or trade</strong> your personal data. We share data only with the counterparty of a
                        transaction you initiate (e.g. the seller fulfilling your order) and with the following processors strictly necessary
                        to operate the Platform:
                        <List items={[
                            "Supabase — database, authentication and document storage infrastructure",
                            "Resend — transactional email delivery",
                            "Razorpay — payment processing (per RBI guidelines)",
                            "Google — sign-in / authentication services",
                        ]} />
                        Payment data including card numbers, UPI IDs and net banking credentials are processed exclusively by
                        <strong> Razorpay</strong>, our PCI-DSS compliant payment partner, and are <strong>never stored on TonersCart
                        servers</strong>. Payment processing is governed by Razorpay&apos;s privacy policy and RBI guidelines.
                        All third-party processors are <strong>contractually bound</strong> to protect your personal data from unauthorised
                        use or disclosure and process it only for the purposes specified.
                    </Section>

                    <Section title="8. Your Rights under the DPDPA">
                        As a Data Principal, you have the right to:
                        <List items={[
                            "Access a summary of your personal data and how it is processed",
                            "Correction and updating of inaccurate or incomplete data",
                            "Erasure of your personal data, subject to legal retention",
                            "Grievance redressal regarding the processing of your data",
                        ]} />
                        To exercise these rights, email <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>.
                    </Section>

                    <Section title="9. Cookie Policy">
                        We use <strong>functional cookies only</strong> — to keep you signed in and remember your selected city. We do
                        <strong> not</strong> use third-party advertising cookies or ad trackers. We also use <strong>Google Analytics (GA4)</strong>
                        to track anonymised page views and user behaviour for platform improvement. No personally identifiable information
                        is shared with Google Analytics.
                    </Section>

                    <Section title="10. Data Security">
                        We apply reasonable security practices including <strong>encrypted storage, role-based access controls</strong>, and
                        <strong> short-lived signed URLs</strong> for sensitive documents such as KYC files, which are stored in private buckets
                        accessible only to authorised staff for verification.
                    </Section>

                    <Section title="11. Cross-Border Transfers">
                        Our infrastructure provider (Supabase) may store or process data on servers located outside India. Such transfers are
                        carried out in accordance with applicable law and only to the extent necessary to provide the service.
                    </Section>

                    <Section title="12. Children's Data">
                        The Platform is intended for users aged <strong>18 and above</strong> and is not directed at children. We do not knowingly
                        collect personal data of minors.
                    </Section>

                    <Section title="13. Grievance Officer">
                        For privacy grievances, contact our Grievance Officer:
                        <br />
                        <strong>Rohit Sairam</strong>,
                        Email: <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>,
                        Phone: <a href="tel:+918884546789" className="text-[#00B7C7] hover:underline">+91 88845 46789</a>.
                        We respond to grievances <strong>within 48 hours</strong>.
                    </Section>

                    <Section title="14. Nodal Officer">
                        In accordance with the Consumer Protection (E-Commerce) Rules, 2020, our Nodal Officer is:
                        <br />
                        <strong>Rohit Sairam</strong>, TonersCart Private Limited, Bangalore, Karnataka, India,
                        Email: <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>,
                        Phone: <a href="tel:+918884546789" className="text-[#00B7C7] hover:underline">+91 88845 46789</a>.
                    </Section>

                    <Section title="15. Seller Payments & Commission">
                        For sellers, the bank account details you provide (account holder name, account number, IFSC, bank and branch) are used
                        <strong> solely to remit your payouts</strong> for completed orders and are stored securely. Payouts are made after deducting
                        TonersCart&apos;s platform commission, charged on the order <strong>bill value excluding GST</strong>:
                        <strong> 10%</strong> under ₹15,000, <strong>8%</strong> for ₹15,000–₹30,000, <strong>6%</strong> for ₹30,000–₹75,000,
                        <strong> 5%</strong> for ₹75,000–₹1,00,000, and <strong>4%</strong> for ₹1,00,000 &amp; above. See our
                        <Link to="/terms" className="text-[#00B7C7] hover:underline"> Terms of Service</Link> for full commercial terms.
                    </Section>

                    <Section title="16. Contact">
                        Privacy questions or requests? Email <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>.
                        TonersCart Private Limited, Bangalore, Karnataka, India. See also our <Link to="/terms" className="text-[#00B7C7] hover:underline">Terms of Service</Link>.
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
