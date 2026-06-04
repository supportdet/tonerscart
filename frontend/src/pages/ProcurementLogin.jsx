import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Landmark, Building2, ArrowRight, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import procApi, { formatApiError } from "../lib/procApi";
import { useProcAuth } from "../context/ProcAuthContext";
import PageMeta from "../components/PageMeta";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GOVT_DOMAINS = [".gov.in", ".nic.in", ".gov"];

const emptyGovt = { name: "", designation: "", department: "", ministry_state: "", employee_id: "", email: "", phone: "", address: "", password: "" };
const emptyCorp = { name: "", designation: "", company: "", gst_number: "", email: "", phone: "", address: "", password: "" };

function Field({ label, children, error, testid }) {
    return (
        <div>
            <Label className="text-[12.5px]">{label}</Label>
            {children}
            {error && <p className="text-red-600 text-[12px] mt-1" data-testid={testid}>{error}</p>}
        </div>
    );
}

export default function ProcurementLogin() {
    const navigate = useNavigate();
    const { login } = useProcAuth();
    const [portal, setPortal] = useState("govt");
    const [mode, setMode] = useState("login"); // login | register
    const [govt, setGovt] = useState(emptyGovt);
    const [corp, setCorp] = useState(emptyCorp);
    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const switchPortal = (p) => { setPortal(p); setErrors({}); setSubmitted(false); };
    const switchMode = (m) => { setMode(m); setErrors({}); setSubmitted(false); };
    const clearErr = (k) => setErrors((e) => { const n = { ...e }; delete n[k]; delete n.form; return n; });

    const doLogin = async (e) => {
        e.preventDefault();
        setErrors({});
        setSubmitting(true);
        try {
            await login(loginForm.email.trim(), loginForm.password);
            navigate("/procurement");
        } catch (err) {
            const msg = formatApiError(err) || "Sign-in failed";
            if (/password|incorrect/i.test(msg)) setErrors({ password: msg });
            else setErrors({ form: msg });
        } finally { setSubmitting(false); }
    };

    const doRegister = async (e) => {
        e.preventDefault();
        const f = portal === "govt" ? govt : corp;
        const errs = {};
        if (!f.name.trim()) errs.name = "Required";
        if (!f.designation.trim()) errs.designation = "Required";
        if (portal === "govt" && !f.department.trim()) errs.department = "Required";
        if (portal === "govt" && !f.ministry_state.trim()) errs.ministry_state = "Required";
        if (portal === "govt" && !f.employee_id.trim()) errs.employee_id = "Required";
        if (portal === "corporate" && !f.company.trim()) errs.company = "Required";
        if (portal === "corporate") {
            const gst = (f.gst_number || "").trim().toUpperCase();
            if (!gst) errs.gst_number = "GST number is required";
            else if (!GSTIN_RE.test(gst)) errs.gst_number = "Invalid GST format (e.g. 22AAAAA0000A1Z5)";
        }
        const email = (f.email || "").trim().toLowerCase();
        if (!email) errs.email = "Required";
        else if (portal === "govt" && !GOVT_DOMAINS.some((d) => email.endsWith(d))) errs.email = "Use an official email ending in .gov.in, .nic.in or .gov";
        if (!f.phone.trim()) errs.phone = "Required";
        if (!f.address.trim()) errs.address = "Required";
        if ((f.password || "").length < 6) errs.password = "At least 6 characters";
        if (Object.keys(errs).length) { setErrors(errs); return; }

        setErrors({});
        setSubmitting(true);
        try {
            if (portal === "govt") {
                await procApi.post("/procurement/register/govt", { ...f, email });
            } else {
                await procApi.post("/procurement/register/corporate", { ...f, email, gst_number: f.gst_number.trim().toUpperCase() });
            }
            setSubmitted(true);
        } catch (err) {
            const msg = formatApiError(err);
            if (/already exists|already registered/i.test(msg)) setErrors({ email: msg });
            else if (/gst/i.test(msg)) setErrors({ gst_number: msg });
            else if (/email ending/i.test(msg)) setErrors({ email: msg });
            else setErrors({ form: msg || "Registration failed" });
        } finally { setSubmitting(false); }
    };

    const inputCls = "mt-1";

    const renderRegister = () => {
        const isGovt = portal === "govt";
        const f = isGovt ? govt : corp;
        const set = isGovt ? setGovt : setCorp;
        const upd = (k) => (e) => { set({ ...f, [k]: e.target.value }); if (errors[k]) clearErr(k); };
        return (
            <form onSubmit={doRegister} className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="proc-register-form" noValidate>
                <Field label="Full name" error={errors.name} testid="proc-err-name"><Input value={f.name} onChange={upd("name")} className={inputCls} data-testid="proc-reg-name" /></Field>
                <Field label="Designation" error={errors.designation} testid="proc-err-designation"><Input value={f.designation} onChange={upd("designation")} className={inputCls} data-testid="proc-reg-designation" /></Field>
                {isGovt ? (
                    <>
                        <Field label="Department name" error={errors.department} testid="proc-err-department"><Input value={f.department} onChange={upd("department")} className={inputCls} data-testid="proc-reg-department" /></Field>
                        <Field label="Ministry / State" error={errors.ministry_state} testid="proc-err-ministry"><Input value={f.ministry_state} onChange={upd("ministry_state")} className={inputCls} data-testid="proc-reg-ministry" /></Field>
                        <Field label="Employee ID" error={errors.employee_id} testid="proc-err-empid"><Input value={f.employee_id} onChange={upd("employee_id")} className={inputCls} data-testid="proc-reg-empid" /></Field>
                    </>
                ) : (
                    <>
                        <Field label="Company name" error={errors.company} testid="proc-err-company"><Input value={f.company} onChange={upd("company")} className={inputCls} data-testid="proc-reg-company" /></Field>
                        <Field label="GST number" error={errors.gst_number} testid="proc-err-gst"><Input value={f.gst_number} onChange={upd("gst_number")} placeholder="22AAAAA0000A1Z5" className={`${inputCls} uppercase`} data-testid="proc-reg-gst" /></Field>
                    </>
                )}
                <Field label={isGovt ? "Official email (.gov.in / .nic.in)" : "Official email"} error={errors.email} testid="proc-err-email"><Input type="email" value={f.email} onChange={upd("email")} className={inputCls} data-testid="proc-reg-email" /></Field>
                <Field label="Official phone" error={errors.phone} testid="proc-err-phone"><Input value={f.phone} onChange={upd("phone")} className={inputCls} data-testid="proc-reg-phone" /></Field>
                <div className="sm:col-span-2">
                    <Field label={isGovt ? "Department address" : "Company address"} error={errors.address} testid="proc-err-address"><Input value={f.address} onChange={upd("address")} className={inputCls} data-testid="proc-reg-address" /></Field>
                </div>
                <div className="sm:col-span-2">
                    <Field label="Password" error={errors.password} testid="proc-err-password"><Input type="password" value={f.password} onChange={upd("password")} placeholder="6+ characters" className={inputCls} data-testid="proc-reg-password" /></Field>
                </div>
                {errors.form && <div className="sm:col-span-2"><p className="text-red-600 text-[12px]" data-testid="proc-reg-form-error">{errors.form}</p></div>}
                <div className="sm:col-span-2 mt-1">
                    <Button type="submit" disabled={submitting} className="btn-cta w-full inline-flex items-center justify-center gap-2" data-testid="proc-register-submit">
                        {submitting ? <Loader2 size={15} className="animate-spin" /> : <>Create account <ArrowRight size={15} /></>}
                    </Button>
                </div>
            </form>
        );
    };

    const renderLogin = () => (
        <form onSubmit={doLogin} className="space-y-3 max-w-md" data-testid="proc-login-form" noValidate>
            <Field label="Official email" error={errors.email} testid="proc-login-email-error">
                <Input type="email" value={loginForm.email} onChange={(e) => { setLoginForm({ ...loginForm, email: e.target.value }); if (errors.email || errors.form) clearErr("email"); }} className={inputCls} data-testid="proc-login-email" />
            </Field>
            <Field label="Password" error={errors.password} testid="proc-login-password-error">
                <Input type="password" value={loginForm.password} onChange={(e) => { setLoginForm({ ...loginForm, password: e.target.value }); if (errors.password || errors.form) clearErr("password"); }} className={inputCls} data-testid="proc-login-password" />
            </Field>
            {errors.form && <p className="text-red-600 text-[12px]" data-testid="proc-login-form-error">{errors.form}</p>}
            <Button type="submit" disabled={submitting} className="btn-cta w-full inline-flex items-center justify-center gap-2" data-testid="proc-login-submit">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <>Sign in <ArrowRight size={15} /></>}
            </Button>
        </form>
    );

    return (
        <div className="tc-hero relative min-h-screen pb-16" data-testid="procurement-login-page">
            <PageMeta title="Procurement Portal — TonersCart" description="Government & Corporate procurement portal: compare suppliers, generate formal quotations and order on credit." />
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-10 sm:pt-14">
                <Link to="/login" className="inline-flex items-center gap-1.5 text-[13px] text-white/70 hover:text-white mb-8" data-testid="proc-back-to-login">
                    <ArrowLeft size={14} /> Back to regular sign in
                </Link>

                <div className="grid lg:grid-cols-12 gap-8 lg:gap-14 items-start">
                    {/* Left — pitch (matches /login hero) */}
                    <div className="lg:col-span-5 hidden lg:block">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="tc-strip" />
                            <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-white/60">Procurement Portal</span>
                        </div>
                        <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(32px, 3.6vw, 48px)", lineHeight: 1.07, letterSpacing: "-0.03em", fontWeight: 300 }}>
                            Government &amp; corporate procurement, <span className="text-[#00B7C7]" style={{ fontWeight: 500 }}>simplified</span>.
                        </h1>
                        <p className="text-white/65 mt-5 max-w-md text-[14.5px] leading-relaxed">
                            Compare verified suppliers (L1/L2/L3), generate formal GST quotations as PDFs, and order on credit with NEFT/RTGS terms — all in one place.
                        </p>
                        <ul className="mt-8 space-y-3 text-[13.5px] text-white/80 max-w-md">
                            {["L1/L2/L3 lowest-price comparison", "Formal PDF quotations (valid 7 days)", "Credit account with 30-day terms", "Govt PO upload & admin review"].map((t) => (
                                <li key={t} className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-[#00B7C7] shrink-0" /> {t}</li>
                            ))}
                        </ul>
                    </div>

                    {/* Right — auth card (matches /login card) */}
                    <div className="lg:col-span-7 w-full max-w-xl ml-auto">
                        <div className="bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-6 sm:p-8 text-[#0A0A0B]">
                            <h2 className="text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "26px", fontWeight: 300, letterSpacing: "-0.02em" }}>
                                {mode === "register" ? "Create your account" : "Welcome back"}
                            </h2>
                            <p className="text-[13px] text-[#6E6E73] mt-1">Government &amp; corporate buyers sign in or register here.</p>

                            <div className="mt-6">
                            <Tabs value={portal} onValueChange={switchPortal}>
                                <TabsList className="grid grid-cols-2 w-full mb-5">
                                    <TabsTrigger value="govt" data-testid="proc-tab-govt" className="gap-1.5"><Landmark size={14} /> Government</TabsTrigger>
                                    <TabsTrigger value="corporate" data-testid="proc-tab-corporate" className="gap-1.5"><Building2 size={14} /> Corporate</TabsTrigger>
                                </TabsList>

                                {submitted ? (
                                    <div className="py-8 text-center" data-testid="proc-under-review">
                                        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 grid place-items-center mb-3">
                                            <CheckCircle2 className="text-emerald-600" size={26} />
                                        </div>
                                        <h3 className="text-[17px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Your account is under review</h3>
                                        <p className="text-[13.5px] text-[#6E6E73] mt-2 max-w-sm mx-auto">You will receive an email once your {portal === "govt" ? "government" : "corporate"} account is approved by the TonersCart team.</p>
                                        <button onClick={() => { setSubmitted(false); setMode("login"); }} className="mt-5 text-[13px] font-semibold text-[#00B7C7] hover:underline" data-testid="proc-goto-login">Go to sign in</button>
                                    </div>
                                ) : (
                                    <>
                                        {/* mode toggle */}
                                        <div className="inline-flex p-1 rounded-xl bg-black/[0.04] mb-5" role="tablist">
                                            <button onClick={() => switchMode("login")} className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition ${mode === "login" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-[#6E6E73]"}`} data-testid="proc-mode-login">Sign in</button>
                                            <button onClick={() => switchMode("register")} className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition ${mode === "register" ? "bg-white text-[#0A0A0B] shadow-sm" : "text-[#6E6E73]"}`} data-testid="proc-mode-register">Register</button>
                                        </div>

                                        <TabsContent value="govt" forceMount={portal === "govt" ? undefined : false} className={portal === "govt" ? "" : "hidden"}>
                                            {mode === "login" ? renderLogin() : renderRegister()}
                                        </TabsContent>
                                        <TabsContent value="corporate" forceMount={portal === "corporate" ? undefined : false} className={portal === "corporate" ? "" : "hidden"}>
                                            {mode === "login" ? renderLogin() : renderRegister()}
                                        </TabsContent>
                                    </>
                                )}
                            </Tabs>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
