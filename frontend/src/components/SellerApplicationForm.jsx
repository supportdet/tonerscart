import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Upload, CheckCircle2, ChevronLeft, ChevronRight, FileText } from "lucide-react";

const KNOWN_CITIES = ["Bangalore","Mumbai","Delhi","Chennai","Hyderabad","Pune","Kolkata","Ahmedabad","Jaipur","Lucknow","Chandigarh","Surat","Indore","Nagpur","Coimbatore","Kochi","Bhopal","Noida","Gurgaon"];
const INDIAN_STATES = [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand",
    "Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
    "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
    "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"
];
const TURNOVER = ["< ₹10 Lakh", "₹10 – 50 Lakh", "₹50 Lakh – 2 Cr", "₹2 – 10 Cr", "₹10 Cr+"];
const SELLER_TYPES = ["Original", "Compatible", "Refilled"];
const COMMON_BRANDS = ["HP", "Canon", "Brother", "Samsung", "Ricoh", "Epson", "Xerox", "Kyocera"];

// Indian format validators
const PHONE_RE = /^(?:\+?91[-\s]?)?[6-9]\d{9}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function StepDots({ step, total }) {
    return (
        <div className="flex items-center gap-1.5" data-testid="step-dots">
            {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i + 1 === step ? "w-6 bg-[#0A0A0B]" : i + 1 < step ? "w-3 bg-[#00B7C7]" : "w-3 bg-[#D2D2D7]"}`} />
            ))}
        </div>
    );
}

function FileSlot({ label, hint, file, setFile, testid, accept = "image/*,application/pdf" }) {
    const onPick = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
        setFile(f);
    };
    return (
        <label className="block cursor-pointer">
            <div className="text-[12px] font-semibold text-[#0A0A0B] mb-1">{label}</div>
            {hint && <div className="text-[11px] text-[#6E6E73] mb-1.5">{hint}</div>}
            <input type="file" accept={accept} className="hidden" onChange={onPick} data-testid={testid} />
            <div className={`flex items-center gap-3 p-3 rounded-lg border-2 border-dashed transition ${file ? "bg-emerald-50 border-emerald-200" : "bg-white border-[#D2D2D7] hover:border-[#86868B]"}`}>
                {file ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <Upload size={16} className="text-[#86868B] shrink-0" />}
                <div className="text-[12.5px] truncate">
                    {file ? <span className="text-emerald-700 font-medium">{file.name}</span> : <span className="text-[#86868B]">Click to upload (PDF or image, max 5 MB)</span>}
                </div>
            </div>
        </label>
    );
}

export default function SellerApplicationForm() {
    const { user, refresh } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [s, setS] = useState({
        contact_person: user?.name || "",
        phone: user?.phone || "",
        city: user?.city || "",
        state: "",
        pincode: "",
        cities_served: [],
        business_name: "",
        business_address: "",
        gst_number: "",
        pan_number: "",
        annual_turnover: "",
        years_in_business: "",
        seller_types: [],
        compatible_brands: [],
        testing_before_delivery: false,
    });
    const updS = (k) => (e) => setS({ ...s, [k]: e.target.value });

    const [docs, setDocs] = useState({
        brand_authorization: null,
        shop_photo: null,
        gst: null,
        pan: null,
        bank_proof: null,
        address_proof: null,
    });

    const toggleSellerType = (t) => {
        setS((prev) => {
            const exists = prev.seller_types.includes(t);
            const next = exists ? prev.seller_types.filter((x) => x !== t) : [...prev.seller_types, t];
            if (!exists && next.length > 2) {
                toast.error("Choose up to two seller types");
                return prev;
            }
            return { ...prev, seller_types: next };
        });
    };

    const toggleCompatBrand = (b) => {
        setS((prev) => ({ ...prev, compatible_brands: prev.compatible_brands.includes(b) ? prev.compatible_brands.filter((x) => x !== b) : [...prev.compatible_brands, b] }));
    };

    const toggleCityServed = (c) => {
        setS((prev) => ({ ...prev, cities_served: prev.cities_served.includes(c) ? prev.cities_served.filter((x) => x !== c) : [...prev.cities_served, c] }));
    };

    const canNext = () => {
        if (step === 1) {
            if (!s.contact_person.trim()) return false;
            if (!PHONE_RE.test(s.phone.trim())) return false;
            if (!s.city) return false;
            if (!s.state) return false;
            if (!PINCODE_RE.test(s.pincode.trim())) return false;
            if (s.cities_served.length === 0) return false;
            return true;
        }
        if (step === 2) {
            if (!s.business_name.trim()) return false;
            if (!s.business_address.trim()) return false;
            if (!GSTIN_RE.test(s.gst_number.trim().toUpperCase())) return false;
            if (!PAN_RE.test(s.pan_number.trim().toUpperCase())) return false;
            if (!s.annual_turnover) return false;
            if (!s.years_in_business || parseInt(s.years_in_business, 10) < 0) return false;
            return true;
        }
        if (step === 3) {
            if (s.seller_types.length < 1) return false;
            if (s.seller_types.includes("Compatible") && s.compatible_brands.length === 0) return false;
            return true;
        }
        return true;
    };

    const allDocsValid = () => {
        // Always-required documents
        if (!docs.gst || !docs.pan || !docs.bank_proof || !docs.address_proof) return false;
        // Conditional documents based on seller types
        if (s.seller_types.includes("Original") && !docs.brand_authorization) return false;
        if (s.seller_types.includes("Refilled") && !docs.shop_photo) return false;
        return true;
    };

    const submit = async (e) => {
        e?.preventDefault?.();
        if (step !== 4) return;
        if (!canNext()) { toast.error("Please complete the previous steps"); return; }
        if (!allDocsValid()) {
            toast.error("All required documents must be uploaded before submitting");
            return;
        }
        setLoading(true);
        try {
            // 1. Submit application (no role change yet)
            await api.post("/auth/apply-seller", {
                ...s,
                gst_number: s.gst_number.trim().toUpperCase(),
                pan_number: s.pan_number.trim().toUpperCase(),
                phone: s.phone.trim(),
                pincode: s.pincode.trim(),
                years_in_business: s.years_in_business ? parseInt(s.years_in_business, 10) : null,
                doc_brand_authorization: "",
                doc_shop_photo: "",
                doc_gst: "",
                doc_pan: "",
                doc_bank_proof: "",
                doc_address_proof: "",
            });

            // 2. Upload files via backend (service role — bypasses storage RLS for non-supplier users)
            const uploaded = {};
            const docMap = {
                doc_brand_authorization: docs.brand_authorization,
                doc_shop_photo: docs.shop_photo,
                doc_gst: docs.gst,
                doc_pan: docs.pan,
                doc_bank_proof: docs.bank_proof,
                doc_address_proof: docs.address_proof,
            };
            for (const [field, file] of Object.entries(docMap)) {
                if (!file) continue;
                const fd = new FormData();
                fd.append("file", file);
                const { data: up } = await api.post(`/auth/supplier-document-upload?field=${field}`, fd);
                uploaded[field] = up.path;
            }

            if (Object.keys(uploaded).length > 0) {
                await api.post("/auth/supplier-documents", uploaded);
            }

            await refresh();
            toast.success("Application submitted — pending admin approval");
            navigate("/sell");
        } catch (err) {
            const msg = formatApiError(err);
            toast.error(msg && msg !== "Something went wrong" ? msg : (err?.message || "Submission failed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit}
            onKeyDown={(e) => {
                if (e.key === "Enter" && step < 4) {
                    e.preventDefault();
                    if (canNext()) setStep((st) => Math.min(4, st + 1));
                }
            }}
            className="bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-7 text-[#0A0A0B]" data-testid="seller-application-form">
            <div className="flex items-center justify-between mb-5">
                <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">
                    Step {step} of 4 — {step === 1 ? "About you" : step === 2 ? "Business" : step === 3 ? "What you sell" : "Documents"}
                </div>
                <StepDots step={step} total={4} />
            </div>

            {step === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" data-testid="apply-step-1">
                    <div className="sm:col-span-2"><Label>Contact person<span className="text-red-500"> *</span></Label><Input value={s.contact_person} onChange={updS("contact_person")} required data-testid="apply-contact-person" /></div>
                    <div>
                        <Label>Phone<span className="text-red-500"> *</span></Label>
                        <Input value={s.phone} onChange={updS("phone")} placeholder="10-digit Indian mobile, e.g. 9876543210" required data-testid="apply-phone" inputMode="tel" maxLength={14} />
                        {s.phone && !PHONE_RE.test(s.phone.trim()) && (
                            <div className="text-[11px] text-red-600 mt-1">Enter a valid Indian mobile (starts 6-9, 10 digits, optional +91)</div>
                        )}
                    </div>
                    <div>
                        <Label>Primary city<span className="text-red-500"> *</span></Label>
                        <select value={s.city} onChange={updS("city")} required className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="apply-city">
                            <option value="">Select city…</option>
                            {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <Label>State<span className="text-red-500"> *</span></Label>
                        <select value={s.state} onChange={updS("state")} required className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="apply-state">
                            <option value="">Select state…</option>
                            {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                    </div>
                    <div>
                        <Label>Pincode<span className="text-red-500"> *</span></Label>
                        <Input value={s.pincode} onChange={updS("pincode")} placeholder="6-digit PIN" required data-testid="apply-pincode" inputMode="numeric" maxLength={6} />
                        {s.pincode && !PINCODE_RE.test(s.pincode.trim()) && (
                            <div className="text-[11px] text-red-600 mt-1">Enter a valid 6-digit pincode</div>
                        )}
                    </div>
                    <div className="sm:col-span-2 mt-2">
                        <Label>Cities you serve<span className="text-red-500"> *</span> <span className="text-[#86868B] font-normal">(select at least one)</span></Label>
                        <div className="flex flex-wrap gap-2 mt-2" data-testid="cities-served">
                            {KNOWN_CITIES.map((c) => (
                                <button key={c} type="button" onClick={() => toggleCityServed(c)}
                                    className={`px-3 py-1.5 rounded-full border text-[12.5px] transition ${s.cities_served.includes(c) ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7]"}`}
                                    data-testid={`city-served-${c}`}>{c}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" data-testid="apply-step-2">
                    <div className="sm:col-span-2"><Label>Business name<span className="text-red-500"> *</span></Label><Input value={s.business_name} onChange={updS("business_name")} required data-testid="apply-business-name" /></div>
                    <div>
                        <Label>GSTIN<span className="text-red-500"> *</span></Label>
                        <Input value={s.gst_number} onChange={(e) => setS({ ...s, gst_number: e.target.value.toUpperCase() })} placeholder="29ABCDE1234F1Z5" required data-testid="apply-gst" maxLength={15} />
                        {s.gst_number && !GSTIN_RE.test(s.gst_number.trim().toUpperCase()) && (
                            <div className="text-[11px] text-red-600 mt-1">Enter a valid 15-character GSTIN</div>
                        )}
                    </div>
                    <div>
                        <Label>PAN<span className="text-red-500"> *</span></Label>
                        <Input value={s.pan_number} onChange={(e) => setS({ ...s, pan_number: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" required data-testid="apply-pan" maxLength={10} />
                        {s.pan_number && !PAN_RE.test(s.pan_number.trim().toUpperCase()) && (
                            <div className="text-[11px] text-red-600 mt-1">Enter a valid 10-character PAN (5 letters + 4 digits + 1 letter)</div>
                        )}
                    </div>
                    <div>
                        <Label>Annual turnover<span className="text-red-500"> *</span></Label>
                        <select value={s.annual_turnover} onChange={updS("annual_turnover")} required className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="apply-turnover">
                            <option value="">Select…</option>
                            {TURNOVER.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                    <div><Label>Years in business<span className="text-red-500"> *</span></Label><Input type="number" min="0" max="100" value={s.years_in_business} onChange={updS("years_in_business")} required data-testid="apply-years" /></div>
                    <div className="sm:col-span-2"><Label>Business address<span className="text-red-500"> *</span></Label><Textarea rows={2} value={s.business_address} onChange={updS("business_address")} required data-testid="apply-address" /></div>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4" data-testid="apply-step-3">
                    <div>
                        <Label>What kind of seller are you? <span className="text-[#86868B] font-normal">(choose up to 2)</span></Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                            {SELLER_TYPES.map((t) => (
                                <button key={t} type="button" onClick={() => toggleSellerType(t)}
                                    className={`p-4 rounded-lg border text-left transition ${s.seller_types.includes(t) ? "border-[#0A0A0B] bg-[#0A0A0B] text-white" : "border-[#D2D2D7] bg-white text-[#1D1D1F] hover:border-[#86868B]"}`}
                                    data-testid={`seller-type-${t}`}>
                                    <div className="text-[14px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>{t}</div>
                                    <div className="text-[11.5px] mt-1 opacity-80">
                                        {t === "Original" ? "Genuine OEM cartridges" : t === "Compatible" ? "Third-party compatibles" : "Refilled / locally made"}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {s.seller_types.includes("Compatible") && (
                        <div>
                            <Label>Compatible brands you sell<span className="text-red-500"> *</span> <span className="text-[#86868B] font-normal">(select at least one)</span></Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {COMMON_BRANDS.map((b) => (
                                    <button key={b} type="button" onClick={() => toggleCompatBrand(b)}
                                        className={`px-3 py-1.5 rounded-full border text-[12.5px] ${s.compatible_brands.includes(b) ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7]"}`}
                                        data-testid={`compat-brand-${b}`}>{b}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {s.seller_types.includes("Refilled") && (
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-[#D2D2D7] bg-white cursor-pointer">
                            <input type="checkbox" checked={s.testing_before_delivery} onChange={(e) => setS({ ...s, testing_before_delivery: e.target.checked })} className="mt-1" data-testid="testing-before-delivery" />
                            <div>
                                <div className="text-[13px] font-semibold text-[#0A0A0B]">I test every refilled cartridge before delivery</div>
                                <div className="text-[11.5px] text-[#6E6E73] mt-0.5">Helps buyers trust your refilled stock.</div>
                            </div>
                        </label>
                    )}
                </div>
            )}

            {step === 4 && (
                <div className="space-y-3" data-testid="apply-step-4">
                    <div className="text-[12.5px] text-[#6E6E73] mb-1">All documents are mandatory and stored privately. Only TonersCart admins can view them via short-lived signed links.</div>
                    {s.seller_types.includes("Original") && (
                        <FileSlot label="Brand Authorization Letter *" hint="Required for Original (OEM) sellers" file={docs.brand_authorization}
                            setFile={(f) => setDocs({ ...docs, brand_authorization: f })} testid="doc-brand-authorization" />
                    )}
                    {s.seller_types.includes("Refilled") && (
                        <FileSlot label="Shop / Workshop photo *" hint="Required for Refilled sellers" file={docs.shop_photo}
                            setFile={(f) => setDocs({ ...docs, shop_photo: f })} testid="doc-shop-photo" />
                    )}
                    <FileSlot label="GST certificate *" hint="Required" file={docs.gst}
                        setFile={(f) => setDocs({ ...docs, gst: f })} testid="doc-gst" />
                    <FileSlot label="PAN card *" hint="Required" file={docs.pan}
                        setFile={(f) => setDocs({ ...docs, pan: f })} testid="doc-pan" />
                    <FileSlot label="Bank proof *" hint="Cancelled cheque / passbook" file={docs.bank_proof}
                        setFile={(f) => setDocs({ ...docs, bank_proof: f })} testid="doc-bank-proof" />
                    <FileSlot label="Address proof *" hint="Utility bill / rent agreement" file={docs.address_proof}
                        setFile={(f) => setDocs({ ...docs, address_proof: f })} testid="doc-address-proof" />
                    <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-[#FFF8DD] border border-[#F5C400]/40 text-[#5C4A00] text-[12.5px]">
                        <FileText size={14} className="mt-0.5 shrink-0" />
                        <div>Once you submit, our AI quickly checks each document is clear and legible. Any unclear file is flagged for the admin team.</div>
                    </div>
                </div>
            )}

            <div className="mt-6 flex items-center justify-between">
                <Button type="button" variant="outline" disabled={step === 1 || loading} onClick={() => setStep(Math.max(1, step - 1))} data-testid="apply-back-btn">
                    <ChevronLeft size={14} className="mr-1" /> Back
                </Button>
                {step < 4 ? (
                    <Button type="button" disabled={!canNext()} onClick={() => setStep(step + 1)} className="btn-cta" data-testid="apply-next-btn">
                        Next <ChevronRight size={14} className="ml-1" />
                    </Button>
                ) : (
                    <Button type="submit" className="btn-cta" disabled={loading || !allDocsValid()} data-testid="apply-submit-btn">
                        {loading ? "Submitting…" : "Submit application"}
                    </Button>
                )}
            </div>
        </form>
    );
}
