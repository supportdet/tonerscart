import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Camera, CheckCircle2, ChevronLeft, ImageIcon } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import TonerCartridge from "../components/TonerCartridge";

// Wave 105.10 — Bulk image upload page. Lists every listing (across all
// product types) that has NO image yet, with 3 small upload slots per row.
// Backed by the same per-kind upload endpoints the individual edit dialogs
// use so watermarking + compression + magic-byte checks all still apply.

const KIND_META = {
    toner:      { label: "Toner",      uploadPath: "/supplier/listing-image", patchPath: (id) => `/supplier/listings/${id}` },
    printer:    { label: "Printer",    uploadPath: "/supplier/printer-image", patchPath: (id) => `/supplier/printers/${id}` },
    consumable: { label: "Consumable", uploadPath: "/supplier/listing-image", patchPath: (id) => `/supplier/consumables/${id}` },
    paper:      { label: "Paper",      uploadPath: "/supplier/listing-image", patchPath: (id) => `/supplier/papers/${id}` },
    scanner:    { label: "Scanner",    uploadPath: "/supplier/listing-image", patchPath: (id) => `/supplier/scanners/${id}` },
};

function ImageSlot({ index, rowId, existingUrl, onPick, busy }) {
    return (
        <label
            className={`w-14 h-14 rounded-lg border-2 border-dashed grid place-items-center cursor-pointer transition ${
                existingUrl
                    ? "border-emerald-400 bg-emerald-50/40"
                    : busy
                    ? "border-[#00B7C7] bg-[#00B7C7]/10 cursor-wait"
                    : "border-[#00B7C7]/40 hover:border-[#00B7C7] hover:bg-[#00B7C7]/5"
            }`}
            data-testid={`bulk-img-slot-${rowId}-${index}`}
        >
            {existingUrl ? (
                <img src={existingUrl} alt="" className="w-full h-full object-cover rounded-md" />
            ) : busy ? (
                <div className="w-4 h-4 border-2 border-[#00B7C7] border-t-transparent rounded-full animate-spin" />
            ) : (
                <Camera size={16} className="text-[#00B7C7]" />
            )}
            <input
                type="file"
                accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
                className="hidden"
                disabled={busy}
            />
        </label>
    );
}

export default function BulkImageUpload() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [busyRow, setBusyRow] = useState({}); // { [rowKey_slotIdx]: true }

    const [initialSet, setInitialSet] = useState(null); // freeze the "needs photos" set on first load

    const load = async () => {
        setLoading(true);
        try {
            const [tRes, pRes] = await Promise.all([
                api.get("/supplier/listings").catch(() => ({ data: [] })),
                api.get("/supplier/printers/mine").catch(() => ({ data: [] })),
            ]);
            const toners = (tRes.data || []).map((l) => ({ ...l, _kind: "toner" }));
            const printers = (pRes.data || []).map((p) => ({ ...p, _kind: "printer" }));
            const all = [...toners, ...printers];
            setItems(all);
            // Freeze the set of "listings without photos" on first load so that
            // uploading the 1st image doesn't hide the row before the dealer
            // can drop into slots 2 or 3.
            if (initialSet === null) {
                const missing = new Set(all.filter((it) => !(it.image_url || (Array.isArray(it.image_urls) && it.image_urls.length))).map((it) => `${it._kind}-${it.id}`));
                setInitialSet(missing);
            }
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    // Only rows that started this session without a photo. Uploading fills
    // the slots but doesn't remove the row until reload.
    const rows = useMemo(
        () => initialSet ? items.filter((it) => initialSet.has(`${it._kind}-${it.id}`)) : [],
        [items, initialSet]
    );

    const uploadFor = async (row, slotIdx, file) => {
        const meta = KIND_META[row._kind];
        if (!meta) return;
        const key = `${row.id}_${slotIdx}`;
        setBusyRow((b) => ({ ...b, [key]: true }));
        try {
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post(meta.uploadPath, fd, { headers: { "Content-Type": "multipart/form-data" } });
            const newUrl = data?.url || data?.image_url;
            if (!newUrl) throw new Error("No URL returned");
            // Merge with existing image URLs on the row + persist via PATCH/PUT
            const existing = Array.isArray(row.image_urls) ? row.image_urls : (row.image_url ? [row.image_url] : []);
            const nextUrls = [...existing];
            nextUrls[slotIdx] = newUrl;
            const filtered = nextUrls.filter(Boolean);
            try {
                await api.put(meta.patchPath(row.id), { image_urls: filtered, image_url: filtered[0] });
            } catch {
                // Older PATCH-style endpoints
                await api.patch(meta.patchPath(row.id), { image_urls: filtered, image_url: filtered[0] });
            }
            setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, image_urls: filtered, image_url: filtered[0] } : it)));
            toast.success("Photo added");
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusyRow((b) => { const c = { ...b }; delete c[key]; return c; });
        }
    };

    return (
        <div className="tc-container py-8 sm:py-10" data-testid="bulk-image-upload">
            <button onClick={() => navigate("/supplier")} className="text-[13px] font-semibold text-[#3a3a40] inline-flex items-center gap-1 hover:text-[#0A0A0B]" data-testid="bulk-img-back">
                <ChevronLeft size={14} /> Back to dashboard
            </button>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                    <div className="tc-eyebrow"><span className="tc-strip mr-2 align-middle" />Photos</div>
                    <h1 className="mt-2 text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 700, letterSpacing: "-0.02em" }}>
                        Add photos to your listings
                    </h1>
                    <div className="text-[13px] text-[#3a3a40] font-medium mt-1">Listings with photos convert far better. Only listings that don&apos;t have a photo yet are shown here.</div>
                </div>
                <div className="text-[12px] text-[#3a3a40] font-bold" data-testid="bulk-img-remaining">{rows.length} listing{rows.length === 1 ? "" : "s"} without photos</div>
            </div>

            {loading ? (
                <div className="mt-6 space-y-2">
                    {[0,1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
            ) : rows.length === 0 ? (
                <div className="mt-6 tc-card-flat p-10 text-center" data-testid="bulk-img-empty">
                    <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
                    <div className="font-bold text-[#0A0A0B] mt-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>Every listing has a photo</div>
                    <div className="text-[13px] text-[#3a3a40] font-medium mt-1">Nice work — nothing left to upload here.</div>
                </div>
            ) : (
                <div className="mt-6 tc-card-flat p-0 overflow-hidden" data-testid="bulk-img-list">
                    {rows.map((row, rIdx) => {
                        const meta = KIND_META[row._kind] || {};
                        const urls = Array.isArray(row.image_urls) ? row.image_urls : (row.image_url ? [row.image_url] : []);
                        return (
                            <div
                                key={`${row._kind}-${row.id}`}
                                className={`flex items-center gap-3 px-4 py-3 ${rIdx !== rows.length - 1 ? "border-b border-black/[0.05]" : ""}`}
                                data-testid={`bulk-img-row-${row.id}`}
                            >
                                <div className="w-10 h-10 rounded-md bg-[#F5F5F7] grid place-items-center shrink-0" aria-hidden="true">
                                    {row._kind === "toner" ? (
                                        <TonerCartridge color={row.color || "Black"} brand={row.brand} model={row.model_number} type={row.toner_type} tiny />
                                    ) : (
                                        <ImageIcon size={16} className="text-[#86868B]" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] tracking-[0.14em] uppercase font-bold text-[#86868B]">{meta.label || row._kind}</div>
                                    <div className="text-[14px] font-bold text-[#0A0A0B] truncate" style={{ fontFamily: "'Montserrat', sans-serif" }} title={`${row.brand} ${row.model_number || ""}`}>
                                        {row.brand} · {row.model_number || "—"}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {[0, 1, 2].map((slot) => (
                                        <ImageSlot
                                            key={slot}
                                            index={slot}
                                            rowId={row.id}
                                            existingUrl={urls[slot]}
                                            busy={!!busyRow[`${row.id}_${slot}`]}
                                            onPick={(f) => uploadFor(row, slot, f)}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
