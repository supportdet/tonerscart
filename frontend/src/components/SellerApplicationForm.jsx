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

// Wave 67 — popular cities per state. NOT exhaustive — the picker also lets
// dealers free-type any city (e.g. towns / tier-3 cities not in this list).
const STATE_CITIES = {
    "Andhra Pradesh": ["Visakhapatnam","Vijayawada","Guntur","Tirupati","Nellore","Kakinada","Rajahmundry","Anantapur","Kurnool","Kadapa"],
    "Arunachal Pradesh": ["Itanagar","Naharlagun","Pasighat","Tezu","Bomdila"],
    "Assam": ["Guwahati","Silchar","Dibrugarh","Jorhat","Tezpur","Tinsukia","Nagaon","Bongaigaon"],
    "Bihar": ["Patna","Gaya","Bhagalpur","Muzaffarpur","Darbhanga","Bihar Sharif","Purnia","Arrah","Begusarai","Katihar"],
    "Chhattisgarh": ["Raipur","Bhilai","Bilaspur","Korba","Durg","Rajnandgaon","Jagdalpur","Ambikapur"],
    "Goa": ["Panaji","Margao","Vasco da Gama","Mapusa","Ponda"],
    "Gujarat": ["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Gandhinagar","Junagadh","Anand","Nadiad","Bharuch"],
    "Haryana": ["Gurgaon","Faridabad","Panipat","Ambala","Yamunanagar","Rohtak","Hisar","Karnal","Sonipat","Panchkula"],
    "Himachal Pradesh": ["Shimla","Mandi","Solan","Dharamshala","Kullu","Manali","Hamirpur","Una"],
    "Jharkhand": ["Ranchi","Jamshedpur","Dhanbad","Bokaro","Hazaribagh","Deoghar","Giridih"],
    "Karnataka": ["Bangalore","Mysore","Hubli","Mangalore","Belgaum","Davangere","Tumkur","Shimoga","Bellary","Bijapur","Gulbarga","Udupi"],
    "Kerala": ["Kochi","Thiruvananthapuram","Kozhikode","Thrissur","Kollam","Kottayam","Palakkad","Kannur","Alappuzha","Malappuram"],
    "Madhya Pradesh": ["Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Dewas","Satna","Ratlam","Rewa"],
    "Maharashtra": ["Mumbai","Pune","Nagpur","Nashik","Thane","Aurangabad","Solapur","Kolhapur","Amravati","Akola","Sangli","Navi Mumbai","Vasai-Virar","Latur","Nanded","Jalgaon"],
    "Manipur": ["Imphal","Thoubal","Bishnupur","Churachandpur"],
    "Meghalaya": ["Shillong","Tura","Jowai","Nongstoin"],
    "Mizoram": ["Aizawl","Lunglei","Champhai","Serchhip"],
    "Nagaland": ["Kohima","Dimapur","Mokokchung","Tuensang"],
    "Odisha": ["Bhubaneswar","Cuttack","Rourkela","Berhampur","Sambalpur","Puri","Balasore"],
    "Punjab": ["Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Mohali","Pathankot","Hoshiarpur"],
    "Rajasthan": ["Jaipur","Jodhpur","Udaipur","Kota","Ajmer","Bikaner","Alwar","Bharatpur","Pali","Sikar"],
    "Sikkim": ["Gangtok","Namchi","Mangan","Geyzing"],
    "Tamil Nadu": ["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Erode","Vellore","Thoothukudi","Dindigul","Tiruppur"],
    "Telangana": ["Hyderabad","Warangal","Nizamabad","Karimnagar","Khammam","Mahbubnagar","Adilabad"],
    "Tripura": ["Agartala","Udaipur","Dharmanagar","Kailashahar"],
    "Uttar Pradesh": ["Lucknow","Kanpur","Agra","Varanasi","Meerut","Prayagraj","Ghaziabad","Noida","Aligarh","Bareilly","Moradabad","Saharanpur","Gorakhpur","Faizabad","Jhansi","Mathura"],
    "Uttarakhand": ["Dehradun","Haridwar","Roorkee","Haldwani","Rudrapur","Kashipur","Rishikesh"],
    "West Bengal": ["Kolkata","Howrah","Durgapur","Asansol","Siliguri","Bardhaman","Malda","Kharagpur"],
    "Andaman and Nicobar Islands": ["Port Blair"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Silvassa","Daman","Diu"],
    "Delhi": ["New Delhi","Delhi","Dwarka","Rohini","Saket","Pitampura","Karol Bagh","Connaught Place"],
    "Jammu and Kashmir": ["Srinagar","Jammu","Anantnag","Baramulla","Sopore"],
    "Ladakh": ["Leh","Kargil"],
    "Lakshadweep": ["Kavaratti"],
    "Puducherry": ["Puducherry","Karaikal","Mahe","Yanam"],
};
const TURNOVER = ["< ₹10 Lakh", "₹10 – 50 Lakh", "₹50 Lakh – 2 Cr", "₹2 – 10 Cr", "₹10 Cr+"];
const SELLER_TYPES = ["Original", "Compatible"];
const COMMON_BRANDS = ["HP", "Canon", "Brother", "Samsung", "Ricoh", "Epson", "Xerox", "Kyocera"];

// Indian format validators
const PHONE_RE = /^(?:\+?91[-\s]?)?[6-9]\d{9}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function CitiesServedPicker({ value, onChange }) {
    // Wave 67 — searchable city + state picker that lets the dealer add ANY
    // city in India. We keep the wire format unchanged (string[]) and store
    // each entry as `"City, State"` so the existing array column doesn't
    // need a migration. Free-text city entry is allowed.
    const [stateSel, setStateSel] = useState("");
    const [cityQuery, setCityQuery] = useState("");
    const [open, setOpen] = useState(false);

    const suggestions = (() => {
        if (!stateSel) return [];
        const pool = STATE_CITIES[stateSel] || [];
        const q = cityQuery.trim().toLowerCase();
        const filtered = q ? pool.filter((c) => c.toLowerCase().includes(q)) : pool;
        return filtered.slice(0, 8);
    })();

    const addEntry = (cityName) => {
        const c = (cityName || cityQuery).trim();
        if (!c || !stateSel) return;
        const entry = `${c}, ${stateSel}`;
        if (value.includes(entry)) return;
        onChange([...value, entry]);
        setCityQuery("");
        setOpen(false);
    };
    const removeEntry = (entry) => onChange(value.filter((e) => e !== entry));

    return (
        <div data-testid="cities-served-picker">
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2 items-start">
                <select
                    value={stateSel}
                    onChange={(e) => { setStateSel(e.target.value); setCityQuery(""); }}
                    className="h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]"
                    data-testid="cities-served-state"
                >
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
                <div className="relative">
                    <Input
                        type="text"
                        placeholder={stateSel ? "Search or type a city…" : "Pick a state first"}
                        value={cityQuery}
                        disabled={!stateSel}
                        onChange={(e) => { setCityQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setTimeout(() => setOpen(false), 150)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addEntry(); }
                        }}
                        data-testid="cities-served-search"
                    />
                    {open && stateSel && suggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 left-0 right-0 bg-white border border-[#D2D2D7] rounded-md shadow-lg max-h-56 overflow-y-auto" data-testid="cities-served-suggestions">
                            {suggestions.map((c) => (
                                <button
                                    type="button"
                                    key={c}
                                    onMouseDown={(e) => { e.preventDefault(); addEntry(c); }}
                                    className="block w-full text-left px-3 py-2 text-[13px] hover:bg-black/[0.04]"
                                    data-testid={`cities-served-suggestion-${c}`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => addEntry()}
                    disabled={!stateSel || !cityQuery.trim()}
                    className="h-10 px-4 rounded-md bg-[#0A0A0B] text-white text-[13px] font-semibold disabled:opacity-40"
                    data-testid="cities-served-add"
                >
                    Add city
                </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3" data-testid="cities-served-chips">
                {value.length === 0 && (
                    <span className="text-[12px] text-[#86868B]">No cities added yet — pick a state, then search/type a city and click Add.</span>
                )}
                {value.map((entry) => (
                    <span key={entry} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-[#0A0A0B] text-white text-[12.5px]" data-testid={`cities-served-chip-${entry}`}>
                        {entry}
                        <button type="button" onClick={() => removeEntry(entry)} className="w-5 h-5 rounded-full bg-white/15 hover:bg-white/25 inline-flex items-center justify-center" aria-label={`Remove ${entry}`}>×</button>
                    </span>
                ))}
            </div>
        </div>
    );
}

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
            // Wave 98 — Phase 1 form. Only business name + GSTIN + PAN.
            // Bank details, address, annual turnover, and years-in-business
            // moved to Phase 2 (inside dealer dashboard after approval).
            if (!s.business_name.trim()) return false;
            if (!GSTIN_RE.test(s.gst_number.trim().toUpperCase())) return false;
            if (!PAN_RE.test(s.pan_number.trim().toUpperCase())) return false;
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
        // Wave 64 — cancelled cheque is optional at application time
        // (dealer can submit it later, before their first payout).
        if (!docs.gst || !docs.pan || !docs.id_proof || !docs.address_proof) return false;
        // Conditional documents based on seller types
        if (s.seller_types.includes("Original") && !docs.brand_authorization) return false;
        return true;
    };

    const submit = async (e) => {
        e?.preventDefault?.();
        // Wave 98 — Phase 1 submit at end of Step 3. No documents, no bank
        // details — those move to Phase 2 (dashboard banner after approval).
        if (step !== 3) return;
        if (!canNext()) { toast.error("Please complete the previous steps"); return; }
        if (!agreed) {
            toast.error("You must agree to the TonersCart Seller Terms to continue");
            return;
        }
        setLoading(true);
        setProgress(20);
        setProgressLabel("Submitting your application…");
        try {
            await api.post("/auth/apply-seller", {
                ...s,
                gst_number: s.gst_number.trim().toUpperCase(),
                pan_number: s.pan_number.trim().toUpperCase(),
                phone: `+91 ${s.phone.trim()}`,
                pincode: s.pincode.trim(),
                years_in_business: null,
                doc_brand_authorization: "",
                doc_shop_photo: "",
                doc_gst: "",
                doc_pan: "",
                doc_bank_proof: "",
                doc_id_proof: "",
                doc_address_proof: "",
                agreed_to_terms: agreed,
            });
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
                if (e.key === "Enter" && step < 3) {
                    e.preventDefault();
                    if (canNext()) setStep((st) => Math.min(3, st + 1));
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
                    Step {step} of 3 — {step === 1 ? "About you" : step === 2 ? "Business" : "What you sell"}
                </div>
                <StepDots step={step} total={3} />
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
                        <Label>Cities you serve<span className="text-red-500"> *</span> <span className="text-[#86868B] font-normal">(pick a state, then search or type a city)</span></Label>
                        <div className="mt-2">
                            <CitiesServedPicker
                                value={s.cities_served}
                                onChange={(next) => setS((p) => ({ ...p, cities_served: next }))}
                            />
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
                    <div className="sm:col-span-2 mt-2 p-3 rounded-lg bg-[#ECFBFD] border border-[#C2EFF5] text-[12.5px] text-[#0A4A50]" data-testid="phase2-helper">
                        <strong>Bank details and document uploads</strong> happen <em>after approval</em>, inside your dealer dashboard. We&apos;ll guide you there once your application is approved (usually within 24 hours).
                    </div>
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

            <div className="mt-6 flex items-start gap-2 bg-[#F4F4F6] border border-black/[0.06] rounded-lg p-3" data-testid="apply-agreement-row" style={{ display: step === 3 ? "flex" : "none" }}>
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
            {step === 3 && !agreed && (
                <div className="mt-2 text-[12px] text-red-600 font-semibold" data-testid="apply-agreement-error">
                    You must agree to the terms to continue
                </div>
            )}

            <div className="mt-6 flex items-center justify-between">
                <Button type="button" variant="outline" disabled={step === 1 || loading} onClick={() => setStep(Math.max(1, step - 1))} data-testid="apply-back-btn">
                    <ChevronLeft size={14} className="mr-1" /> Back
                </Button>
                {step < 3 ? (
                    <Button type="button" disabled={!canNext()} onClick={() => setStep(step + 1)} className="btn-cta" data-testid="apply-next-btn">
                        Next <ChevronRight size={14} className="ml-1" />
                    </Button>
                ) : (
                    <Button type="submit" className="btn-cta" disabled={loading || !canNext() || !agreed} data-testid="apply-submit-btn">
                        {loading ? "Submitting…" : "Submit application"}
                    </Button>
                )}
            </div>
        </form>
    );
}
