import React from "react";
import { Link } from "react-router-dom";

export default function Terms() {
    return (
        <div className="bg-white" data-testid="terms-page">
            <div className="tc-container py-12 sm:py-16 max-w-3xl">
                <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Legal</div>
                <h1 className="mt-3 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                    Terms of Service
                </h1>
                <p className="text-[12.5px] text-[#86868B] mt-2">Last updated: May 2025</p>
                <p className="text-[13px] text-[#3a3a40] mt-3 max-w-2xl" data-testid="terms-attribution">
                    TonersCart is a brand of <strong>Digital Edge Technologies</strong>, a partnership firm registered in Bangalore, India.
                </p>

                <div className="prose mt-8 text-[#1D1D1F] text-[14.5px] leading-[1.75]" style={{ fontFamily: "'Inter', sans-serif" }}>
                    <Section title="1. Introduction">
                        TonersCart (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;the Platform&rdquo;) operates an India-focused B2B marketplace
                        connecting verified suppliers of printer toners and printers with business buyers.
                        By using TonersCart you agree to these Terms.
                    </Section>

                    <Section title="2. Marketplace Rules">
                        TonersCart is a marketplace and not the seller of any product listed. Sellers list, price,
                        warrant and dispatch their own goods. Buyers contract directly with the seller. We facilitate
                        discovery, communication, and order coordination only.
                    </Section>

                    <Section title="3. Order Policy">
                        Order requests are sent to the seller, who confirms availability and delivery directly with
                        the buyer. Quantities are deducted from the seller&apos;s stock at the moment the order is placed.
                    </Section>

                    <Section title="4. Pricing Policy">
                        <strong>Prices are locked at time of order placement and cannot be changed after.</strong> The unit
                        price and total stored against the order are the seller&apos;s listed price at the exact moment of
                        order creation. Sellers may adjust their public listing prices at any time; orders already
                        placed are not affected.
                    </Section>

                    <Section title="5. Return Policy">
                        Buyers may request a return for <strong>unopened toner cartridges within 7 days</strong> of delivery
                        and for <strong>dead-on-arrival printers within 3 days</strong> of delivery. Returns must be approved
                        by the seller in coordination with TonersCart support.
                    </Section>

                    <Section title="6. Dispute Resolution">
                        For any dispute, please contact <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a> within
                        48 hours of delivery. The TonersCart team will mediate between buyer and seller in good faith.
                    </Section>

                    <Section title="7. Commission">
                        TonersCart charges a <strong>3&ndash;8% commission</strong> on successful orders. The rate is determined
                        by order value: under ₹5,000 → 8%, ₹5,000&ndash;₹25,000 → 5%, ₹25,000&ndash;₹1,50,000 → 3%.
                        Orders above ₹1,50,000 are billed on a deal basis. Commission is deducted from the seller&apos;s
                        payout; buyer-facing price is unaffected.
                    </Section>

                    <Section title="8. Prohibited Activities">
                        Counterfeit OEM goods, off-platform deals to bypass commission, scraping, spam, harassment of
                        other users, and any unlawful activity are strictly prohibited and grounds for account
                        termination.
                    </Section>

                    <Section title="9. Limitation of Liability">
                        TonersCart&apos;s aggregate liability for any claim arising from use of the platform is limited
                        to the commission received from the underlying order. We are not liable for indirect,
                        incidental, or consequential damages.
                    </Section>

                    <Section title="10. Contact">
                        Questions about these Terms? Email <a href="mailto:support@tonerscart.com" className="text-[#00B7C7] hover:underline">support@tonerscart.com</a>.
                        See also our <Link to="/privacy" className="text-[#00B7C7] hover:underline">Privacy Policy</Link>.
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
