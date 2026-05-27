import React, { useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import PageMeta from "../components/PageMeta";
import { Loader2, Boxes } from "lucide-react";
import { useCity, KNOWN_CITIES } from "../context/CityContext";

const ACCENT = "#e65100";

const PRODUCT_TYPES = [
    "Toners", "Printers", "Papers", "Ink Cartridges", "Drums", "Spare Parts", "Other",
];

export default function Bulk() {
    const { city } = useCity();
    const [productType, setProductType] = useState("Toners");
    const [quantity, setQuantity] = useState("");
    const [budget, setBudget] = useState("");
    const [deliveryCity, setDeliveryCity] = useState(city || "Mumbai");
    const [company, setCompany] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!company.trim()) { toast.error("Please enter your company name"); return; }
        if (!quantity || Number(quantity) <= 0) { toast.error("Please enter a valid quantity"); return; }
        if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error("Please enter a valid email"); return; }
        const cleanedPhone = phone.replace(/\D/g, "").slice(-10);
        if (cleanedPhone.length !== 10) { toast.error("Please enter a valid 10-digit mobile number"); return; }

        setSubmitting(true);
        try {
            await api.post("/mps/inquiry", {
                name: company.trim(),
                email: email.trim(),
                phone: `+91${cleanedPhone}`,
                description: notes,
                estimated_printers: "—",
                selections: {
                    type: "bulk_enquiry",
                    company: company.trim(),
                    product_type: productType,
                    quantity: Number(quantity),
                    budget: budget ? Number(budget) : null,
                    delivery_city: deliveryCity,
                },
            });
            setDone(true);
            toast.success("Bulk enquiry submitted");
        } catch {
            toast.error("Could not submit. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <PageMeta title="Buy in Bulk · TonersCart" description="Bulk orders for toners, printers and papers. Best dealer pricing within 24 hours." />
            <div className="min-h-[80vh] bg-[#F5F5F7] py-12 sm:py-16">
                <div className="tc-container max-w-[720px]">
                    <div className="text-center mb-8">
                        <div
                            className="inline-flex items-center gap-2 mx-auto w-12 h-12 rounded-2xl grid place-items-center mb-4"
                            style={{ background: `${ACCENT}1A`, color: ACCENT }}
                        >
                            <Boxes size={20} />
                        </div>
                        <h1
                            className="text-[#0A0A0B]"
                            style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 400, letterSpacing: "-0.02em" }}
                            data-testid="bulk-title"
                        >
                            Buy in Bulk
                        </h1>
                        <p className="text-[15px] text-[#6E6E73] mt-3 max-w-[520px] mx-auto">
                            Tell us what you need. We review every request and respond within 24 hours with the best dealer pricing.
                        </p>
                    </div>

                    <div
                        className="rounded-[24px] bg-white border border-black/[0.06] p-6 sm:p-10"
                        style={{ boxShadow: "0 8px 40px -12px rgba(0,0,0,0.08)" }}
                    >
                        {done ? (
                            <div className="text-center py-6" data-testid="bulk-success">
                                <div className="text-[40px] mb-3" style={{ color: ACCENT }}>✓</div>
                                <h2 className="text-[20px] font-semibold text-[#0A0A0B] mb-2">Enquiry received</h2>
                                <p className="text-[14px] text-[#6E6E73] mb-6">We'll get you the best bulk price within 24 hours.</p>
                                <button
                                    onClick={() => { setDone(false); setQuantity(""); setBudget(""); setNotes(""); }}
                                    className="text-[13px] font-semibold underline text-[#0A0A0B] hover:text-[#00B7C7]"
                                    data-testid="bulk-another"
                                >
                                    Submit another enquiry
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={submit} className="space-y-4" data-testid="bulk-form">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Product type *</label>
                                        <select
                                            value={productType}
                                            onChange={(e) => setProductType(e.target.value)}
                                            required
                                            className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                            data-testid="bulk-product-type"
                                        >
                                            {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Quantity *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={quantity}
                                            onChange={(e) => setQuantity(e.target.value)}
                                            placeholder="e.g. 50"
                                            required
                                            className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                            data-testid="bulk-quantity"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Budget (₹)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={budget}
                                            onChange={(e) => setBudget(e.target.value)}
                                            placeholder="Optional"
                                            className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                            data-testid="bulk-budget"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Delivery city *</label>
                                        <input
                                            list="bulk-city-list"
                                            value={deliveryCity}
                                            onChange={(e) => setDeliveryCity(e.target.value)}
                                            required
                                            className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                            data-testid="bulk-city"
                                        />
                                        <datalist id="bulk-city-list">
                                            {KNOWN_CITIES.map((c) => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Company name *</label>
                                        <input
                                            type="text"
                                            value={company}
                                            onChange={(e) => setCompany(e.target.value)}
                                            placeholder="Your business name"
                                            required
                                            className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                            data-testid="bulk-company"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Phone *</label>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex h-11 items-center px-3 rounded-xl border border-[#D2D2D7] bg-[#F5F5F7] text-[14px] font-medium text-[#6E6E73]">+91</span>
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="10-digit number"
                                                required
                                                maxLength={10}
                                                className="flex-1 h-11 px-3 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                                data-testid="bulk-phone"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Email *</label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@company.com"
                                            required
                                            className="w-full h-11 px-3 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B]"
                                            data-testid="bulk-email"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">Notes / specific models</label>
                                    <textarea
                                        rows={3}
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="e.g. Need HP 88A compatible, 50 pcs/month recurring"
                                        className="w-full px-3 py-2.5 rounded-xl border border-[#D2D2D7] bg-white text-[14px] focus:outline-none focus:border-[#0A0A0B] resize-none"
                                        data-testid="bulk-notes"
                                    />
                                </div>

                                <div
                                    className="rounded-xl px-4 py-3 text-[12.5px]"
                                    style={{ background: "#fff3e0", border: "1px solid #ffd9a8", color: "#7a3e00" }}
                                    data-testid="bulk-credit-note"
                                >
                                    <strong>For corporate buyers needing 30-day credit terms</strong>, mention it in your requirement and our team will arrange accordingly.
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full h-12 rounded-xl text-[14px] font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                                    style={{ background: ACCENT }}
                                    data-testid="bulk-submit"
                                >
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {submitting ? "Submitting…" : "Get best bulk price"}
                                </button>

                                <p className="text-center text-[11.5px] text-[#86868B] pt-1">
                                    By submitting, you agree to be contacted at the email and phone provided.
                                </p>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
