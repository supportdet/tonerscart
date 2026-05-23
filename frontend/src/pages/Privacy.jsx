import React from "react";
import { Link } from "react-router-dom";

export default function Privacy() {
    return (
        <div className="bg-white" data-testid="privacy-page">
            <div className="tc-container py-12 sm:py-16 max-w-3xl">
                <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Legal</div>
                <h1 className="mt-3 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                    Privacy Policy
                </h1>
                <p className="text-[12.5px] text-[#86868B] mt-2">Last updated: May 2025</p>

                <div className="prose mt-8 text-[#1D1D1F] text-[14.5px] leading-[1.75]" style={{ fontFamily: "'Inter', sans-serif" }}>
                    <Section title="1. Data Collected">
                        We collect the information you choose to provide when creating an account, applying as a seller,
                        placing an order, or contacting support: name, email, phone, city, business details (GST, PAN,
                        address), and KYC documents for sellers. We log basic usage data (IP, browser) to keep the
                        platform reliable.
                    </Section>

                    <Section title="2. How We Use It">
                        Personal data is used solely to operate the marketplace — matching buyers with sellers,
                        delivering order notifications, verifying seller identity, and providing customer support.
                        Aggregate, de-identified data may be used for product improvement and reporting.
                    </Section>

                    <Section title="3. Supabase Storage">
                        Our database, authentication, and file storage run on Supabase. Seller KYC documents and
                        product images are stored in private buckets accessible only via short-lived signed URLs.
                        Access is restricted to TonersCart staff for verification purposes.
                    </Section>

                    <Section title="4. No Third Party Data Selling">
                        We do <strong>not</strong> sell, rent or trade your personal data to any third party for marketing.
                        We share data only with the counterparty of a transaction you initiate (e.g. the seller fulfilling
                        your order), and with service providers strictly necessary to operate the platform (Supabase, Resend
                        for email, Google Gemini for document clarity checks).
                    </Section>

                    <Section title="5. Cookies">
                        We use functional cookies only — to keep you signed in and remember your selected city. We do
                        not use third-party advertising cookies or trackers.
                    </Section>

                    <Section title="6. Contact">
                        Privacy questions? Email <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>.
                        Also see our <Link to="/terms" className="text-[#00B7C7] hover:underline">Terms of Service</Link>.
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
            <p>{children}</p>
        </div>
    );
}
