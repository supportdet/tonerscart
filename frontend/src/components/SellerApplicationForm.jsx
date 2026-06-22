import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Upload, CheckCircle2, ChevronLeft, ChevronRight, FileText, ShieldCheck, CircleDashed, Loader2, Trash2 } from "lucide-react";
import PhonePrefixInput from "./PhonePrefixInput";

const KNOWN_CITIES = ["Bangalore","Mumbai","Delhi","Chennai","Hyderabad","Pune","Kolkata","Ahmedabad","Jaipur","Lucknow","Chandigarh","Surat","Indore","Nagpur","Coimbatore","Kochi","Bhopal","Noida","Gurgaon"];
const INDIAN_STATES = [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand",
    "Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
    "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
    "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"
];
const TURNOVER = ["< ₹10 Lakh", "₹10 – 50 Lakh", "₹50 Lakh – 2 Cr", "₹2 – 10 Cr", "₹10 Cr+"];
const SELLER_TYPES = ["Original", "Compatible"];
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
    const onRemove = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setFile(null);
    };
    return (
        <div>
            <div className="text-[12px] font-semibold text-[#0A0A0B] mb-1">{label}</div>
            {hint && <div className="text-[11px] text-[#6E6E73] mb-1.5">{hint}</div>}
            {file ? (
                <div
                    className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed bg-emerald-50 border-emerald-200"
                    data-testid={`${testid}-preview`}
                >
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <div className="text-[12.5px] truncate flex-1">
                        <span className="text-emerald-700 font-medium">{file.name}</span>
                    </div>
                    <button
                        type="button"
                        onClick={onRemove}
                        className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-[#6E6E73] hover:bg-red-50 hover:text-red-600 transition"
                        aria-label={`Remove ${label}`}
                        title="Remove this file"
                        data-testid={`${testid}-remove`}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ) : (
                <label className="block cursor-pointer">
                    <input type="file" accept={accept} className="hidden" onChange={onPick} data-testid={testid} />
                    <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed bg-white border-[#D2D2D7] hover:border-[#86868B] transition">
                        <Upload size={16} className="text-[#86868B] shrink-0" />
                        <div className="text-[12.5px] truncate">
                            <span className="text-[#86868B]">Click to upload (PDF or image, max 5 MB)</span>
                        </div>
                    </div>
                </label>
            )}
        </div>
    );
}

export default function SellerApplicationForm() {
    const { user, refresh } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [step, setStep] = useState(1);
    const [s, setS] = useState({
        contact_person: user?.name || "",
        phone: (user?.phone || "").replace(/^\+?91[\s-]?/, "").replace(/\D/g, "").slice(0, 10),
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
        account_holder_name: "",
        account_number: "",
        ifsc_code: "",
        bank_name: "",
        bank_branch: "",
    });
    const [agreed, setAgreed] = useState(false);
    const updS = (k) => (e) => setS({ ...s, [k]: e.target.value });

    const [docs, setDocs] = useState({
        brand_authorization: null,
        shop_photo: null,
        gst: null,
        pan: null,
        bank_proof: null,
        id_proof: null,
        address_proof: null,
    });

    const toggleSellerType = (t) => {
        setS((prev) => ({
            ...prev,
            seller_types: prev.seller_types.includes(t)
                ? prev.seller_types.filter((x) => x !== t)
                : [...prev.seller_types, t],
        }));
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
            // Phone is now 10 digits only (PhonePrefixInput strips +91)
            if (!/^[6-9]\d{9}$/.test(s.phone || "")) return false;
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
            // Wave 63 — annual turnover and years in business are OPTIONAL.
            // We still validate the typed years value if the dealer chose to fill it.
            if (s.years_in_business && parseInt(s.years_in_business, 10) < 0) return false;
            if (!s.account_holder_name.trim()) return false;
            if (!/^\d{6,18}$/.test(s.account_number.trim())) return false;
            if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.ifsc_code.trim().toUpperCase())) return false;
            if (!s.bank_name.trim()) return false;
            if (!s.bank_branch.trim()) return false;
            return true;
        }
        if (step === 3) {
            const hasProductLine = s.seller_types.some((t) => ["Toners", "Printers", "Both"].includes(t));
            if (!hasProductLine) return false;
            if (s.seller_types.length < 1) return false;
            if (s.seller_types.includes("Compatible") && s.compatible_brands.length === 0) return false;
            return true;
        }
        return true;
    };

    const allDocsValid = () => {
        // Always-required documents
        if (!docs.gst || !docs.pan || !docs.bank_proof || !docs.id_proof || !docs.address_proof) return false;
        // Conditional documents based on seller types
        if (s.seller_types.includes("Original") && !docs.brand_authorization) return false;
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
        if (!agreed) {
            toast.error("You must agree to the TonersCart Seller Terms to continue");
            return;
        }
        setLoading(true);
        setProgress(6);
        setProgressLabel("Creating your application…");
        try {
            // 1. Submit application (no role change yet)
            await api.post("/auth/apply-seller", {
                ...s,
                gst_number: s.gst_number.trim().toUpperCase(),
                pan_number: s.pan_number.trim().toUpperCase(),
                phone: `+91 ${s.phone.trim()}`,
                pincode: s.pincode.trim(),
                years_in_business: s.years_in_business ? parseInt(s.years_in_business, 10) : null,
                doc_brand_authorization: "",
                doc_shop_photo: "",
                doc_gst: "",
                doc_pan: "",
                doc_bank_proof: "",
                doc_id_proof: "",
                doc_address_proof: "",
                agreed_to_terms: agreed,
            });

            // 2. Upload files via backend (service role — bypasses storage RLS for non-supplier users).
            //    Uploads run in PARALLEL for speed; progress bar advances as each finishes.
            const uploaded = {};
            const docMap = {
                doc_brand_authorization: docs.brand_authorization,
                doc_shop_photo: docs.shop_photo,
                doc_gst: docs.gst,
                doc_pan: docs.pan,
                doc_bank_proof: docs.bank_proof,
                doc_id_proof: docs.id_proof,
                doc_address_proof: docs.address_proof,
            };
            const docEntries = Object.entries(docMap).filter(([, f]) => !!f);
            const totalSteps = 1 + docEntries.length + 1; // app + uploads + finalize
            let completed = 1; // app submit done
            setProgress(Math.round((completed / totalSteps) * 100));
            setProgressLabel(`Uploading documents… (0/${docEntries.length})`);

            let uploadedCount = 0;
            await Promise.all(docEntries.map(async ([field, file]) => {
                const fd = new FormData();
                fd.append("file", file);
                const { data: up } = await api.post(`/auth/supplier-document-upload?field=${field}`, fd);
                uploaded[field] = up.path;
                uploadedCount += 1;
                completed += 1;
                setProgress(Math.round((completed / totalSteps) * 100));
                setProgressLabel(`Uploading documents… (${uploadedCount}/${docEntries.length})`);
            }));

            setProgressLabel("Finalizing your application…");
            if (Object.keys(uploaded).length > 0) {
                await api.post("/auth/supplier-documents", uploaded);
            }
            setProgress(100);

            await refresh();
            toast.success("Application submitted — pending admin approval");
            navigate("/sell");
        } catch (err) {
            const msg = formatApiError(err);
            toast.error(msg && msg !== "Something went wrong" ? msg : (err?.message || "Submission failed"));
        } finally {
            setLoading(false);
            setProgress(0);
            setProgressLabel("");
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
            className="bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-7 text-[#0A0A0B] relative" data-testid="seller-application-form">
            {loading && (
                <div className="absolute inset-0 z-20 rounded-2xl bg-white/92 backdrop-blur-sm grid place-items-center px-6" data-testid="seller-submit-progress">
                    <div className="w-full max-w-sm text-center">
                        <Loader2 className="animate-spin mx-auto text-[#00838f]" size={28} />
                        <div className="mt-4 text-[15px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Submitting your application</div>
                        <div className="mt-1 text-[13px] text-[#6E6E73]" data-testid="seller-submit-progress-label">{progressLabel || "Please wait…"}</div>
                        <div className="mt-4 h-2 w-full rounded-full bg-[#EDEDF0] overflow-hidden">
                            <div className="h-full rounded-full bg-[#00B7C7] transition-all duration-300" style={{ width: `${progress}%` }} data-testid="seller-submit-progress-bar" />
                        </div>
                        <div className="mt-2 text-[12px] font-mono text-[#86868B]">{progress}%</div>
                        <p className="mt-3 text-[11px] text-[#AEAEB2]">Please don&apos;t close this window.</p>
                    </div>
                </div>
            )}
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
                        <PhonePrefixInput
                            value={s.phone}
                            onChange={(v) => setS({ ...s, phone: v })}
                            required
                            testId="apply-phone"
                        />
                        {s.phone && s.phone.length !== 10 && (
                            <div className="text-[11px] text-red-600 mt-1">Enter a valid 10-digit Indian mobile (no country code)</div>
                        )}
                    </div>
                    <div>
                        <Label>Primary city<span className="text-red-500"> *</span></Label>
                        {/* Wave 59 — dropdown of supported cities; "Other" reveals a
                            free-text field so dealers in un-listed cities can still sign up. */}
                        <select
                            value={KNOWN_CITIES.includes(s.city) || !s.city ? s.city : "__other__"}
                            onChange={(e) => {
                                const v = e.target.value;
                                setS({ ...s, city: v === "__other__" ? "" : v });
                            }}
                            required
                            className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]"
                            data-testid="apply-city"
                        >
                            <option value="">Select city…</option>
                            {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            <option value="__other__">Other (type your city)</option>
                        </select>
                        {!KNOWN_CITIES.includes(s.city) && (
                            <Input
                                value={s.city}
                                onChange={updS("city")}
                                placeholder="Type your city"
                                required
                                className="mt-2"
                                data-testid="apply-city-custom"
                            />
                        )}
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
                        <Input value={s.gst_number} onChange={(e) => setS({ ...s, gst_number: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" required data-testid="apply-gst" maxLength={15} />
                        <div className="text-[11px] text-[#6E6E73] mt-1">Required for GST invoicing. Format: 22AAAAA0000A1Z5 (15 alphanumeric characters).</div>
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
                        <Label>Annual turnover <span className="text-[#86868B] font-normal">(optional)</span></Label>
                        <select value={s.annual_turnover} onChange={updS("annual_turnover")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="apply-turnover">
                            <option value="">Select…</option>
                            {TURNOVER.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                    <div><Label>Years in business <span className="text-[#86868B] font-normal">(optional)</span></Label><Input type="number" min="0" max="100" value={s.years_in_business} onChange={updS("years_in_business")} data-testid="apply-years" /></div>
                    <div className="sm:col-span-2"><Label>Business address<span className="text-red-500"> *</span></Label><Textarea rows={2} value={s.business_address} onChange={updS("business_address")} required data-testid="apply-address" /></div>

                    <div className="sm:col-span-2 mt-2 pt-4 border-t border-black/[0.06]">
                        <div className="text-[14px] text-[#0A0A0B] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Bank account for payouts</div>
                        <p className="text-[12.5px] text-[#6E6E73] mt-0.5">These details are used to <strong>send your payouts</strong> for completed orders. The account holder name must match your business name.</p>
                    </div>
                    <div className="sm:col-span-2"><Label>Account holder name<span className="text-red-500"> *</span> <span className="text-[#86868B] font-normal">(must match business name)</span></Label><Input value={s.account_holder_name} onChange={updS("account_holder_name")} required data-testid="apply-acct-holder" /></div>
                    <div><Label>Account number<span className="text-red-500"> *</span></Label><Input value={s.account_number} onChange={(e) => setS({ ...s, account_number: e.target.value.replace(/\D/g, "").slice(0, 18) })} inputMode="numeric" placeholder="Bank account number" required data-testid="apply-acct-number" /></div>
                    <div><Label>IFSC code<span className="text-red-500"> *</span></Label><Input value={s.ifsc_code} onChange={(e) => setS({ ...s, ifsc_code: e.target.value.toUpperCase().slice(0, 11) })} placeholder="HDFC0001234" maxLength={11} required data-testid="apply-ifsc" /></div>
                    <div><Label>Bank name<span className="text-red-500"> *</span></Label><Input value={s.bank_name} onChange={updS("bank_name")} placeholder="e.g. HDFC Bank" required data-testid="apply-bank-name" /></div>
                    <div><Label>Branch<span className="text-red-500"> *</span></Label><Input value={s.bank_branch} onChange={updS("bank_branch")} placeholder="e.g. MG Road, Bangalore" required data-testid="apply-bank-branch" /></div>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4" data-testid="apply-step-3">
                    <div>
                        <Label>What do you sell? <span className="text-red-500">*</span></Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                            {[
                                { id: "Toners", label: "Toner Cartridges & Consumables", sub: "Original / Compatible toners" },
                                { id: "Printers", label: "Printers & MFDs", sub: "Inkjet / Laser / Multi-function" },
                                { id: "Both", label: "Both", sub: "Toners + Printers" },
                            ].map((opt) => {
                                const selected = s.seller_types.includes(opt.id);
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setS((prev) => {
                                            // Mutually exclusive between the three product-line options
                                            const cleared = prev.seller_types.filter((t) => !["Toners", "Printers", "Both"].includes(t));
                                            return { ...prev, seller_types: [...cleared, opt.id] };
                                        })}
                                        className={`p-4 rounded-lg border text-left transition ${selected ? "border-[#F5C400] bg-[#FFFBEB] text-[#0A0A0B]" : "border-[#D2D2D7] bg-white text-[#1D1D1F] hover:border-[#86868B]"}`}
                                        data-testid={`product-line-${opt.id}`}
                                    >
                                        <div className="text-[14px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>{opt.label}</div>
                                        <div className="text-[11.5px] mt-1 opacity-80">{opt.sub}</div>
                                    </button>
                                );
                            })}
                        </div>
                        {!s.seller_types.some((t) => ["Toners", "Printers", "Both"].includes(t)) && (
                            <div className="text-[11px] text-red-600 mt-1">Pick one to continue.</div>
                        )}
                    </div>

                    <div>
                        <Label>What kind of seller are you? <span className="text-[#86868B] font-normal">(select all that apply)</span></Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {SELLER_TYPES.map((t) => (
                                <button key={t} type="button" onClick={() => toggleSellerType(t)}
                                    className={`p-4 rounded-lg border text-left transition ${s.seller_types.includes(t) ? "border-[#F5C400] bg-[#FFFBEB] text-[#0A0A0B]" : "border-[#D2D2D7] bg-white text-[#1D1D1F] hover:border-[#86868B]"}`}
                                    data-testid={`seller-type-${t}`}>
                                    <div className="text-[14px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>{t}</div>
                                    <div className="text-[11.5px] mt-1 opacity-80">
                                        {t === "Original" ? "Genuine OEM cartridges" : "Third-party compatibles"}
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
                </div>
            )}

            {step === 4 && (
                <div className="space-y-3" data-testid="apply-step-4">
                    {/* Checklist card — what's required */}
                    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#1A1B1F] to-[#0F1013] text-white p-4 sm:p-5" data-testid="kyc-checklist-card">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck size={15} className="text-emerald-400" />
                            <div className="text-[12px] tracking-[0.16em] uppercase font-semibold text-white/65" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                Documents required
                            </div>
                        </div>
                        <ul className="space-y-1.5 text-[13.5px]" style={{ fontFamily: "'Inter', sans-serif" }}>
                            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" /><span><strong>GST Certificate</strong> <span className="text-white/55">(required)</span></span></li>
                            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" /><span><strong>PAN Card</strong> <span className="text-white/55">(required)</span></span></li>
                            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" /><span><strong>ID Proof — Aadhaar / Passport</strong> <span className="text-white/55">(required)</span></span></li>
                            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" /><span><strong>Cancelled Cheque</strong> <span className="text-white/55">(proof of your payout bank account)</span></span></li>
                            <li className="flex items-start gap-2"><CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" /><span><strong>Address Proof</strong> <span className="text-white/55">(utility bill / rent agreement)</span></span></li>
                            <li className="flex items-start gap-2"><CircleDashed size={14} className="text-amber-400 mt-0.5 shrink-0" /><span><strong>Brand Authorization Letter</strong> <span className="text-white/55">{s.seller_types.includes("Original") ? "(required — you sell Original OEM cartridges)" : "(optional — required only if you sell original OEM cartridges)"}</span></span></li>
                        </ul>
                    </div>

                    <div className="text-[12.5px] text-[#6E6E73] mb-1">All required documents are stored privately. Only TonersCart admins can view them via short-lived signed links.</div>
                    <FileSlot label="GST certificate *" hint="Required" file={docs.gst}
                        setFile={(f) => setDocs({ ...docs, gst: f })} testid="doc-gst" />
                    <FileSlot label="PAN card *" hint="Required" file={docs.pan}
                        setFile={(f) => setDocs({ ...docs, pan: f })} testid="doc-pan" />
                    <FileSlot label="ID proof — Aadhaar / Passport *" hint="Government photo ID of the owner" file={docs.id_proof}
                        setFile={(f) => setDocs({ ...docs, id_proof: f })} testid="doc-id-proof" />
                    <FileSlot label="Cancelled cheque *" hint="Proof of the payout bank account — name must match account holder" file={docs.bank_proof}
                        setFile={(f) => setDocs({ ...docs, bank_proof: f })} testid="doc-bank-proof" />
                    <FileSlot label="Address proof *" hint="Utility bill / rent agreement" file={docs.address_proof}
                        setFile={(f) => setDocs({ ...docs, address_proof: f })} testid="doc-address-proof" />
                    {/* Wave 63 — Brand Authorization Letter is always rendered at the bottom.
                        Required only when the dealer chose "Original" (Genuine OEM cartridges).
                        For everyone else it stays optional with a clarifying helper line. */}
                    {(() => {
                        const isOriginal = s.seller_types.includes("Original");
                        return (
                            <FileSlot
                                label={isOriginal ? "Brand Authorization Letter *" : "Brand Authorization Letter (optional)"}
                                hint={isOriginal
                                    ? "Required for Original (OEM) sellers"
                                    : "Required only if you sell original OEM cartridges."}
                                file={docs.brand_authorization}
                                setFile={(f) => setDocs({ ...docs, brand_authorization: f })}
                                testid="doc-brand-authorization"
                            />
                        );
                    })()}
                    <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-[#FFF8DD] border border-[#F5C400]/40 text-[#5C4A00] text-[12.5px]">
                        <FileText size={14} className="mt-0.5 shrink-0" />
                        <div>Once you submit, our AI quickly checks each document is clear and legible. Any unclear file is flagged for the admin team.</div>
                    </div>
                </div>
            )}

            <div className="mt-6 flex items-start gap-2 bg-[#F4F4F6] border border-black/[0.06] rounded-lg p-3" data-testid="apply-agreement-row" style={{ display: step === 4 ? "flex" : "none" }}>
                <input
                    type="checkbox"
                    id="apply-agreement-cb"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 shrink-0"
                    data-testid="apply-agreement-checkbox"
                />
                <label htmlFor="apply-agreement-cb" className="text-[12.5px] text-[#1D1D1F] cursor-pointer leading-relaxed">
                    I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#00B7C7] hover:underline font-semibold">TonersCart Seller Terms</a> operated by <strong>TonersCart Private Limited</strong>.
                </label>
            </div>
            {step === 4 && !agreed && (
                <div className="mt-2 text-[12px] text-red-600 font-semibold" data-testid="apply-agreement-error">
                    You must agree to the terms to continue
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
                    <Button type="submit" className="btn-cta" disabled={loading || !allDocsValid() || !agreed} data-testid="apply-submit-btn">
                        {loading ? "Submitting…" : "Submit application"}
                    </Button>
                )}
            </div>
        </form>
    );
}
