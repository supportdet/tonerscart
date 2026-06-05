import React, { useState } from "react";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, Camera, X as XIcon, Loader2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useCity } from "../context/CityContext";
import { KNOWN_CITIES } from "../context/CityContext";
import PhonePrefixInput from "../components/PhonePrefixInput";

const BUSINESS_TYPES = [
    { id: "dealer",      label: "Dealer" },
    { id: "oem",         label: "OEM" },
    { id: "distributor", label: "Distributor" },
    { id: "other",       label: "Other" },
];

export default function GetFeatured() {
    const { city: currentCity } = useCity();
    const [form, setForm] = useState({
        company: "", contact_person: "", phone: "", email: "",
        city: currentCity || "",
        pincode: "",
        business_type: "dealer",
        description: "",
    });
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState("");
    const [imageUploading, setImageUploading] = useState(false);
    const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const onPickImage = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) { toast.error("Please choose an image file"); e.target.value = ""; return; }
        if (f.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5 MB)"); e.target.value = ""; return; }
        setImageFile(f);
        setImagePreview(URL.createObjectURL(f));
        e.target.value = "";
    };

    const removeImage = () => { setImageFile(null); setImagePreview(""); };

    const submit = async (e) => {
        e.preventDefault();
        if (!form.company.trim() || !form.contact_person.trim() || !form.phone || !form.email.trim() || !form.city || !form.pincode) {
            toast.error("Please fill all required fields");
            return;
        }
        if (form.phone.length !== 10) { toast.error("Enter a valid 10-digit phone"); return; }
        if (!/^[1-9][0-9]{5}$/.test(form.pincode)) { toast.error("Enter a valid 6-digit pincode"); return; }
        setLoading(true);
        try {
            // Upload optional banner image first
            let imagePath = null;
            if (imageFile) {
                setImageUploading(true);
                const fd = new FormData();
                fd.append("file", imageFile);
                const { data: up } = await api.post("/featured/apply-image", fd);
                imagePath = up?.path || null;
                setImageUploading(false);
            }
            await api.post("/featured/apply", {
                company: form.company.trim(),
                contact_person: form.contact_person.trim(),
                phone: `+91 ${form.phone}`,
                email: form.email.trim(),
                city: form.city,
                pincode: form.pincode,
                business_type: form.business_type,
                description: form.description.trim(),
                image_path: imagePath,
            });
            setDone(true);
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setImageUploading(false);
            setLoading(false);
        }
    };

    return (
        <div className="tc-hero relative pb-20" data-testid="get-featured-page">
            <div className="tc-hero-grid" />
            <div className="tc-container relative pt-12 sm:pt-16 max-w-3xl">
                <div className="flex items-center gap-3 mb-3">
                    <Sparkles size={14} className="text-[#F5C400]" />
                    <span className="text-[11px] tracking-[0.22em] uppercase font-semibold text-[#F5C400]">Featured supplier program</span>
                </div>
                <h1 className="text-white" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.12 }}>
                    Feature your brand on TonersCart
                </h1>
                <p className="mt-3 text-[14.5px] text-white/70 max-w-2xl">
                    Join India&apos;s fastest growing printer marketplace. Get prime placement in front of verified buyers.
                </p>

                {done ? (
                    <div className="mt-10 bg-white border border-black/[0.06] rounded-2xl p-8 text-center text-[#0A0A0B]" data-testid="featured-success">
                        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 grid place-items-center">
                            <CheckCircle2 size={26} className="text-emerald-600" />
                        </div>
                        <h2 className="mt-5 text-[22px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>Application received!</h2>
                        <p className="text-[#6E6E73] text-[14px] mt-2">Application received! Our team will contact you within 24 hours.</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="mt-8 bg-white border border-black/[0.06] rounded-2xl shadow-2xl p-5 sm:p-7 space-y-4 text-[#0A0A0B]" data-testid="featured-form">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label>Company name <span className="text-red-500">*</span></Label>
                                <Input value={form.company} onChange={upd("company")} required className="tc-input-lg" data-testid="featured-company" />
                            </div>
                            <div>
                                <Label>Contact person <span className="text-red-500">*</span></Label>
                                <Input value={form.contact_person} onChange={upd("contact_person")} required className="tc-input-lg" data-testid="featured-contact-person" />
                            </div>
                            <div>
                                <Label>Phone <span className="text-red-500">*</span></Label>
                                <PhonePrefixInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required testId="featured-phone" />
                            </div>
                            <div>
                                <Label>Email <span className="text-red-500">*</span></Label>
                                <Input type="email" value={form.email} onChange={upd("email")} required className="tc-input-lg" data-testid="featured-email" />
                            </div>
                            <div>
                                <Label>City <span className="text-red-500">*</span></Label>
                                <select
                                    value={form.city}
                                    onChange={upd("city")}
                                    required
                                    className="tc-input-lg w-full"
                                    data-testid="featured-city"
                                >
                                    <option value="">Select city…</option>
                                    {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Pincode <span className="text-red-500">*</span></Label>
                                <Input
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={form.pincode}
                                    onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                                    required
                                    placeholder="6-digit pincode"
                                    className="tc-input-lg"
                                    data-testid="featured-pincode"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <Label>Type of business</Label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {BUSINESS_TYPES.map((t) => (
                                        <button
                                            type="button"
                                            key={t.id}
                                            onClick={() => setForm({ ...form, business_type: t.id })}
                                            className={`tc-pill ${form.business_type === t.id ? "is-selected" : ""}`}
                                            data-testid={`featured-business-${t.id}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <Label>Brand banner image <span className="text-[12px] text-[#86868B] font-normal">(optional — displayed on featured card if approved)</span></Label>
                                <label className="block cursor-pointer mt-1" data-testid="featured-image-box">
                                    <input type="file" accept="image/*" onChange={onPickImage} className="hidden" data-testid="featured-image-input" />
                                    <div className="relative aspect-[16/9] rounded-xl border-2 border-dashed border-[#D2D2D7] hover:border-[#0A0A0B] bg-white grid place-items-center overflow-hidden transition max-w-md">
                                        {imagePreview ? (
                                            <>
                                                <img src={imagePreview} alt="banner preview" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); removeImage(); }}
                                                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600 text-white grid place-items-center shadow-sm hover:bg-red-700"
                                                    data-testid="featured-image-remove"
                                                    aria-label="Remove image"
                                                >
                                                    <XIcon size={13} />
                                                </button>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center gap-1.5 text-[#86868B]">
                                                <Camera size={22} />
                                                <span className="text-[12px] font-semibold">Upload banner image</span>
                                                <span className="text-[10px]">PNG / JPG · max 5 MB · 16:9</span>
                                            </div>
                                        )}
                                    </div>
                                </label>
                            </div>
                            <div className="sm:col-span-2">
                                <Label>Brief description of your products</Label>
                                <Textarea
                                    rows={4}
                                    value={form.description}
                                    onChange={upd("description")}
                                    placeholder="Brands you carry, geographies you serve, average monthly turnover…"
                                    className="tc-input-lg"
                                    data-testid="featured-description"
                                />
                            </div>
                        </div>
                        <Button type="submit" className="btn-cta w-full inline-flex items-center justify-center gap-2" disabled={loading} data-testid="featured-submit">
                            {loading ? <><Loader2 size={14} className="animate-spin" /> {imageUploading ? "Uploading image…" : "Sending…"}</> : "Submit application"}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
