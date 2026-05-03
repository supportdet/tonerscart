import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { Upload, CheckCircle2, ChevronLeft, ChevronRight, FileText } from "lucide-react";

const GoogleIcon = (props) => (
    <svg viewBox="0 0 48 48" width="18" height="18" {...props}>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.5-11.3 7.5-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.5-4.7 2.5-7.6 2.5-5.4 0-9.7-3-11.3-7.5l-6.6 5.1C9.6 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 4.9l6.5 5.5C42.5 35.5 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
);

const KNOWN_CITIES = ["Bangalore","Mumbai","Delhi","Chennai","Hyderabad","Pune","Kolkata","Ahmedabad","Jaipur","Lucknow","Chandigarh","Surat","Indore","Nagpur","Coimbatore","Kochi","Bhopal","Noida","Gurgaon"];
const TURNOVER = ["< ₹10 Lakh", "₹10 – 50 Lakh", "₹50 Lakh – 2 Cr", "₹2 – 10 Cr", "₹10 Cr+"];
const SELLER_TYPES = ["Original", "Compatible", "Refilled"];
const COMMON_BRANDS = ["HP", "Canon", "Brother", "Samsung", "Ricoh", "Epson", "Xerox", "Kyocera"];

const DOC_BUCKET = "supplier-documents";

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

export default function Register() {
    const { signupCustomer, signupSupplier, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [role, setRole] = useState(params.get("role") === "supplier" ? "supplier" : "customer");
    const [loading, setLoading] = useState(false);

    // ===== Customer flow =====
    const [c, setC] = useState({ email: "", password: "", name: "", phone: "", city: "" });
    const updC = (k) => (e) => setC({ ...c, [k]: e.target.value });

    // ===== Supplier flow =====
    const [step, setStep] = useState(1);
    const [s, setS] = useState({
        // 1. Basic
        email: "", password: "",
        contact_person: "", phone: "",
        city: "", state: "", pincode: "",
        cities_served: [],
        // 2. Business
        business_name: "", business_address: "",
        gst_number: "", pan_number: "",
        annual_turnover: "", years_in_business: "",
        // 3. Seller types
        seller_types: [],
        compatible_brands: [],
        testing_before_delivery: false,
    });
    const updS = (k) => (e) => setS({ ...s, [k]: e.target.value });

    // 4. Documents (files held in state until submit)
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
            let next = exists ? prev.seller_types.filter((x) => x !== t) : [...prev.seller_types, t];
            if (!exists && next.length > 2) {
                toast.error("Choose up to two seller types");
                return prev;
            }
            return { ...prev, seller_types: next };
        });
    };

    const toggleCompatBrand = (b) => {
        setS((prev) => ({
            ...prev,
            compatible_brands: prev.compatible_brands.includes(b)
                ? prev.compatible_brands.filter((x) => x !== b)
                : [...prev.compatible_brands, b],
        }));
    };

    const toggleCityServed = (c) => {
        setS((prev) => ({
            ...prev,
            cities_served: prev.cities_served.includes(c)
                ? prev.cities_served.filter((x) => x !== c)
                : [...prev.cities_served, c],
        }));
    };

    // ===== Validation per step =====
    const canNext = () => {
        if (step === 1) {
            if (!s.email || !s.password || s.password.length < 6) return false;
            if (!s.contact_person || !s.phone || !s.city) return false;
            return true;
        }
        if (step === 2) {
            return !!(s.business_name && s.business_address);
        }
        if (step === 3) {
            return s.seller_types.length >= 1;
        }
        return true;
    };

    const submit = async (e) => {
        e?.preventDefault?.();
        if (role === "customer") {
            setLoading(true);
            try {
                await signupCustomer(c);
                toast.success("Welcome to TonersCart!");
                navigate("/customer");
            } catch (err) { toast.error(formatApiError(err)); }
            finally { setLoading(false); }
            return;
        }

        // ----- Supplier final submit -----
        // Guard: only allow real submission from step 4
        if (step !== 4) return;
        if (s.seller_types.length < 1) { toast.error("Choose at least one seller type"); return; }
        setLoading(true);
        try {
            // 1. Create the auth user + pending row first (needs uid for storage path)
            const result = await api.post("/auth/signup-supplier", {
                ...s,
                years_in_business: s.years_in_business ? parseInt(s.years_in_business, 10) : null,
                doc_brand_authorization: "",
                doc_shop_photo: "",
                doc_gst: "",
                doc_pan: "",
                doc_bank_proof: "",
                doc_address_proof: "",
            });
            const uid = result.data.user_id;

            // 2. Sign in (so RLS-aware storage upload works under owner auth)
            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email: s.email, password: s.password,
            });
            if (signInErr) throw new Error(signInErr.message);

            // 3. Upload files to private supplier-documents bucket
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
                const ext = (file.name.split(".").pop() || "bin").toLowerCase();
                const path = `${uid}/${field}-${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false });
                if (upErr) throw new Error(`${field}: ${upErr.message}`);
                uploaded[field] = path;
            }

            // 4. Patch the pending row with uploaded paths (fire AI check on backend)
            if (Object.keys(uploaded).length > 0) {
                await api.post("/auth/supplier-documents", uploaded);
            }

            toast.success("Application submitted — pending admin approval");
            navigate("/supplier");
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setLoading(false);
        }
    };

    const onGoogle = async () => {
        try { await signInWithGoogle(role === "supplier" ? "supplier" : "customer"); }
        catch (e) { toast.error(e.message || "Google sign-in not enabled yet"); }
    };

    return (
        <div className="tc-hero relative pb-16" data-testid="register-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14 max-w-3xl">
                <div className="flex items-center gap-3 mb-3">
                    <span className="tc-strip" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Create account</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Join the TonersCart trade network
                </h1>

            <div className="mt-6 grid grid-cols-2 gap-2 p-1 bg-white/[0.08] backdrop-blur rounded-lg w-full sm:max-w-sm border border-white/10">
                <button type="button" onClick={() => setRole("customer")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "customer" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-white/70"}`} data-testid="role-customer-tab">I&apos;m a Buyer</button>
                <button type="button" onClick={() => setRole("supplier")} className={`py-2 rounded-md text-sm font-semibold transition ${role === "supplier" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-white/70"}`} data-testid="role-supplier-tab">I&apos;m a Supplier</button>
            </div>

            {/* ============================ CUSTOMER ============================ */}
            {role === "customer" ? (
                <div className="mt-5 sm:mt-6">
                    <div className="bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-4 sm:p-6 text-[#0A0A0B]">
                        <button onClick={onGoogle} type="button" className="mb-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full border border-[#D2D2D7] bg-white hover:bg-black/[0.03] text-[#0A0A0B] font-semibold text-[13.5px]" data-testid="register-google-btn">
                            <GoogleIcon /> Continue with Google
                        </button>
                        <div className="my-4 flex items-center gap-3">
                            <div className="h-px flex-1 bg-black/[0.08]" />
                            <span className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">or with email</span>
                            <div className="h-px flex-1 bg-black/[0.08]" />
                        </div>
                        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="sm:col-span-2"><Label>Full name</Label><Input value={c.name} onChange={updC("name")} required data-testid="register-name-input" /></div>
                            <div><Label>Email</Label><Input type="email" value={c.email} onChange={updC("email")} required data-testid="register-email-input" /></div>
                            <div><Label>Password</Label><Input type="password" value={c.password} onChange={updC("password")} required minLength={6} data-testid="register-password-input" /></div>
                            <div><Label>Phone</Label><Input value={c.phone} onChange={updC("phone")} placeholder="+91-..." data-testid="register-phone-input" /></div>
                            <div><Label>City</Label><Input value={c.city} onChange={updC("city")} data-testid="register-city-input" /></div>
                            <div className="sm:col-span-2">
                                <Button type="submit" className="btn-cta w-full" disabled={loading} data-testid="register-submit-btn">
                                    {loading ? "Creating account…" : "Create account"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : (
                /* ============================ SUPPLIER ============================ */
                <form onSubmit={submit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && step < 4) {
                            // Block Enter from auto-submitting; advance step if valid
                            e.preventDefault();
                            if (canNext()) setStep((st) => Math.min(4, st + 1));
                        }
                    }}
                    className="mt-5 sm:mt-6 bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-7 text-[#0A0A0B]" data-testid="supplier-multi-step">
                    <div className="flex items-center justify-between mb-5">
                        <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">
                            Step {step} of 4 — {step === 1 ? "Basics" : step === 2 ? "Business" : step === 3 ? "Seller types" : "Documents"}
                        </div>
                        <StepDots step={step} total={4} />
                    </div>

                    {step === 1 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" data-testid="step-1">
                            <div className="sm:col-span-2 -mb-1"><div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B]">Account</div></div>
                            <div><Label>Email</Label><Input type="email" value={s.email} onChange={updS("email")} required data-testid="register-email-input" /></div>
                            <div><Label>Password</Label><Input type="password" minLength={6} value={s.password} onChange={updS("password")} required data-testid="register-password-input" /></div>

                            <div className="sm:col-span-2 mt-2 -mb-1"><div className="text-[12px] font-semibold uppercase tracking-wider text-[#0A0A0B]">Contact &amp; location</div></div>
                            <div><Label>Contact person</Label><Input value={s.contact_person} onChange={updS("contact_person")} required data-testid="register-contact-person-input" /></div>
                            <div><Label>Phone</Label><Input value={s.phone} onChange={updS("phone")} placeholder="+91-..." required data-testid="register-phone-input" /></div>
                            <div><Label>Primary city</Label><Input value={s.city} onChange={updS("city")} required data-testid="register-city-input" /></div>
                            <div><Label>State</Label><Input value={s.state} onChange={updS("state")} data-testid="register-state-input" /></div>
                            <div><Label>Pincode</Label><Input value={s.pincode} onChange={updS("pincode")} data-testid="register-pincode-input" /></div>

                            <div className="sm:col-span-2 mt-2">
                                <Label>Cities you serve <span className="text-[#86868B] font-normal">(select all that apply)</span></Label>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" data-testid="step-2">
                            <div className="sm:col-span-2"><Label>Business name</Label><Input value={s.business_name} onChange={updS("business_name")} required data-testid="register-business-name-input" /></div>
                            <div><Label>GST number</Label><Input value={s.gst_number} onChange={updS("gst_number")} placeholder="29ABCDE1234F1Z5" data-testid="register-gst-input" /></div>
                            <div><Label>PAN number</Label><Input value={s.pan_number} onChange={updS("pan_number")} placeholder="ABCDE1234F" data-testid="register-pan-input" /></div>
                            <div>
                                <Label>Annual turnover</Label>
                                <select value={s.annual_turnover} onChange={updS("annual_turnover")} className="w-full h-10 px-3 rounded-md border border-[#D2D2D7] bg-white text-[14px]" data-testid="register-turnover-select">
                                    <option value="">Select…</option>
                                    {TURNOVER.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>
                            <div><Label>Years in business</Label><Input type="number" min="0" value={s.years_in_business} onChange={updS("years_in_business")} data-testid="register-years-input" /></div>
                            <div className="sm:col-span-2"><Label>Business address</Label><Textarea rows={2} value={s.business_address} onChange={updS("business_address")} required data-testid="register-address-input" /></div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4" data-testid="step-3">
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
                                    <Label>Compatible brands you sell</Label>
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
                        <div className="space-y-3" data-testid="step-4">
                            <div className="text-[12.5px] text-[#6E6E73] mb-1">All documents are stored privately. Only TonersCart admins can view them via short-lived signed links.</div>

                            {s.seller_types.includes("Original") && (
                                <FileSlot label="Brand Authorization Letter" hint="Required for Original (OEM) sellers" file={docs.brand_authorization}
                                    setFile={(f) => setDocs({ ...docs, brand_authorization: f })} testid="doc-brand-authorization" />
                            )}
                            {s.seller_types.includes("Refilled") && (
                                <FileSlot label="Shop / Workshop photo" hint="Required for Refilled sellers" file={docs.shop_photo}
                                    setFile={(f) => setDocs({ ...docs, shop_photo: f })} testid="doc-shop-photo" />
                            )}
                            <FileSlot label="GST certificate" hint="Optional but recommended" file={docs.gst}
                                setFile={(f) => setDocs({ ...docs, gst: f })} testid="doc-gst" />
                            <FileSlot label="PAN card" hint="Optional but recommended" file={docs.pan}
                                setFile={(f) => setDocs({ ...docs, pan: f })} testid="doc-pan" />
                            <FileSlot label="Bank proof" hint="Cancelled cheque / passbook" file={docs.bank_proof}
                                setFile={(f) => setDocs({ ...docs, bank_proof: f })} testid="doc-bank-proof" />
                            <FileSlot label="Address proof" hint="Utility bill / rent agreement" file={docs.address_proof}
                                setFile={(f) => setDocs({ ...docs, address_proof: f })} testid="doc-address-proof" />

                            <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-[#FFF8DD] border border-[#F5C400]/40 text-[#5C4A00] text-[12.5px]">
                                <FileText size={14} className="mt-0.5 shrink-0" />
                                <div>Once you submit, our AI quickly checks each document is clear and legible. Any unclear file is flagged for the admin team.</div>
                            </div>
                        </div>
                    )}

                    {/* Step nav */}
                    <div className="mt-6 flex items-center justify-between">
                        <Button type="button" variant="outline" disabled={step === 1 || loading} onClick={() => setStep(Math.max(1, step - 1))} data-testid="step-back-btn">
                            <ChevronLeft size={14} className="mr-1" /> Back
                        </Button>
                        {step < 4 ? (
                            <Button type="button" disabled={!canNext()} onClick={() => setStep(step + 1)} className="btn-cta" data-testid="step-next-btn">
                                Next <ChevronRight size={14} className="ml-1" />
                            </Button>
                        ) : (
                            <Button type="submit" className="btn-cta" disabled={loading} data-testid="register-submit-btn">
                                {loading ? "Submitting…" : "Submit application"}
                            </Button>
                        )}
                    </div>
                </form>
            )}

            <div className="text-sm text-white/70 mt-4">
                Already a member? <Link to="/login" className="text-[#00B7C7] font-semibold hover:underline" data-testid="register-to-login-link">Sign in</Link>
            </div>
            </div>
        </div>
    );
}
