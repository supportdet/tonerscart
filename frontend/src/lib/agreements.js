// Content for the one-time agreement acceptance modals, keyed by type.
export const AGREEMENTS = {
    seller: {
        title: "Marketplace Seller Agreement",
        intro: "By listing on TonersCart you confirm that you have read and agree to our Terms of Service and Privacy Policy, and specifically that:",
        introHasLinks: true,
        points: [
            "You will list only genuine, legally sellable products with accurate stock and pricing",
            "You will dispatch within 2 business days of order confirmation",
            "You will issue a GST-compliant tax invoice to every buyer under your own GSTIN",
            "TonersCart will deduct platform commission from your payout: under ₹15K = 10% · ₹15K–₹30K = 8% · ₹30K–₹75K = 6% · ₹75K–₹1L = 5% · ₹1L+ = 4%",
            "Your bank account details are shared with Razorpay solely for payout processing",
            "You consent to TonersCart handling your data as described in the Privacy Policy",
        ],
        checkbox: "I agree",
        buttonText: "Start listing",
    },
    oem: {
        title: "OEM Brand Showcase Agreement",
        intro: "Before showcasing your brand on TonersCart, please review and accept the OEM Partner Agreement.",
        points: [
            "List only your own genuine, brand-authorised products.",
            "Respond to buyer enquiries within 48 hours.",
            "Do not misrepresent products, specifications or authenticity.",
            "This is an enquiry-only showcase — no revenue share and no checkout.",
            "TonersCart may remove listings for policy violations.",
            "Governed by the laws of India; jurisdiction: Bangalore courts, Karnataka.",
        ],
        checkbox: "I have read and agree to the TonersCart OEM Brand Showcase Agreement",
    },
    procurement: {
        title: "Procurement User Agreement",
        intro: "Before using the procurement portal, please review and accept the Procurement User Agreement.",
        points: [
            "Use the platform for legitimate government/corporate procurement only.",
            "Upload genuine, valid purchase orders (POs) for procurement transactions.",
            "Honour 30-day credit terms on all credit-based orders.",
            "Overdue accounts may have their credit suspended; non-payment may lead to recovery action.",
            "TonersCart may suspend credit or access for overdue or non-compliant accounts.",
            "Governed by the laws of India; jurisdiction: Bangalore courts, Karnataka.",
        ],
        checkbox: "I have read and agree to the TonersCart Procurement User Agreement",
    },
    customer: {
        title: "Welcome to TonersCart",
        intro: "By using TonersCart you agree to our Terms of Service and Privacy Policy.",
        points: [],
        checkbox: "I agree to the TonersCart Terms of Service and Privacy Policy",
        simple: true,
    },
};
