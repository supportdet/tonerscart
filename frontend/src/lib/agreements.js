// Content for the one-time agreement acceptance modals, keyed by type.
export const AGREEMENTS = {
    seller: {
        title: "Marketplace Seller Agreement",
        intro: "Before you start selling on TonersCart, please review and accept the Seller Agreement.",
        points: [
            "List only genuine products and maintain accurate stock and descriptions.",
            "Fulfil orders within your stated timeline and provide a GST invoice on every order.",
            "Do not solicit or complete off-platform deals to bypass commission.",
            "You agree to TonersCart's tiered commission: 8% under ₹5,000 · 6% ₹5,000–₹25,000 · 4% ₹25,000–₹1,50,000 · deal basis above.",
            "TonersCart may suspend or remove your listings for policy violations.",
            "Governed by the laws of India; jurisdiction: Bangalore courts, Karnataka.",
        ],
        checkbox: "I have read and agree to the TonersCart Marketplace Seller Agreement",
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
