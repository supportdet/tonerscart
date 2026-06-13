import React, { useEffect, useRef, useState } from "react";
import { Search as SearchIcon, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

/**
 * Searchable single-select bound to the 546 printer models in the compatibility
 * DB. Dealer types a partial name → sees matching models → selects the exact
 * one (which also auto-fills the brand). Free text is still allowed as a
 * fallback for models not yet in the DB; dealer can also save the typed value
 * as a new "Added by dealer" model that becomes a suggestion for everyone.
 */
export default function PrinterModelSelect({ value = "", onChange, onSelect, testid = "printer-model", brand = "" }) {
    const [q, setQ] = useState(value || "");
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => { setQ(value || ""); }, [value]);

    useEffect(() => {
        if (!open) return;
        const term = q.trim();
        let active = true;
        setLoading(true);
        const tmr = setTimeout(async () => {
            try {
                const { data } = await api.get("/compat/printers", { params: { q: term, limit: 12, brand: brand || "", brand_only: brand ? true : false } });
                if (active) setResults(Array.isArray(data) ? data : []);
            } catch { if (active) setResults([]); }
            finally { if (active) setLoading(false); }
        }, 200);
        return () => { active = false; clearTimeout(tmr); };
    }, [q, brand, open]);

    useEffect(() => {
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const pick = (p) => {
        setQ(p.model);
        onChange && onChange(p.model);
        onSelect && onSelect(p);
        setResults([]);
        setOpen(false);
    };

    const submitCustom = async () => {
        const model = (q || "").trim();
        if (!model || !brand) {
            toast.error(brand ? "Type a printer model first" : "Pick a brand first, then add a custom model");
            return;
        }
        setSubmitting(true);
        try {
            const { data } = await api.post("/compat/custom-printer", { brand, model });
            toast.success("Saved! This printer model is now an 'Added by dealer' suggestion.");
            const picked = { ...data, full_name: data.full_name || `${brand} ${model}` };
            setQ(picked.model);
            onChange && onChange(picked.model);
            onSelect && onSelect(picked);
            setOpen(false);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not save custom printer model");
        } finally {
            setSubmitting(false);
        }
    };

    const typedHasMatch = results.some((r) => (r.model || "").toLowerCase() === (q || "").trim().toLowerCase());

    return (
        <div ref={boxRef} className="relative" data-testid={`${testid}-wrap`}>
            <div className="relative">
                <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                <input
                    value={q}
                    onChange={(e) => { setQ(e.target.value); onChange && onChange(e.target.value); }}
                    onFocus={() => setOpen(true)}
                    placeholder="Type a model, e.g. M1005, LBP2900"
                    className="tc-input-lg w-full"
                    style={{ paddingLeft: "2.4rem" }}
                    data-testid={`${testid}-input`}
                    autoComplete="off"
                />
            </div>
            {open && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E5EA] rounded-xl shadow-xl max-h-60 overflow-y-auto" data-testid={`${testid}-dropdown`}>
                    {loading && results.length === 0 ? (
                        <div className="px-3 py-2 text-[12.5px] text-[#86868B]">Searching…</div>
                    ) : (
                        <>
                            {results.map((p) => (
                                <button type="button" key={p.slug || `${p.brand}-${p.model}`} onClick={() => pick(p)}
                                    className="block w-full text-left px-3 py-2 text-[13px] text-[#0A0A0B] hover:bg-[#F2FBFC] border-b border-black/[0.04] last:border-b-0" data-testid={`${testid}-option`}>
                                    <span className="font-semibold">{p.full_name}</span>
                                    {p.type ? <span className="text-[#86868B] text-[11.5px] ml-1.5 uppercase">{p.type}</span> : null}
                                    {p.is_custom ? <span className="ml-1.5 inline-block px-1.5 py-[1px] bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-semibold uppercase tracking-wide" data-testid={`${testid}-custom-badge`}>Added by dealer</span> : null}
                                </button>
                            ))}
                            {q.trim() && brand && !typedHasMatch ? (
                                <button
                                    type="button"
                                    onClick={submitCustom}
                                    disabled={submitting}
                                    className="block w-full text-left px-3 py-2 text-[12.5px] font-semibold text-[#0A6E78] bg-[#ECFBFD] hover:bg-[#D6F5F9] inline-flex items-center gap-1.5 disabled:opacity-60"
                                    data-testid={`${testid}-add-custom`}
                                >
                                    <PlusCircle size={13} />
                                    {submitting ? "Saving…" : <>Add &ldquo;<span className="font-mono">{brand} {q}</span>&rdquo; as new model</>}
                                </button>
                            ) : null}
                            {results.length === 0 && !loading && !q.trim() ? (
                                <div className="px-3 py-2 text-[12.5px] text-[#86868B]">Start typing a model number…</div>
                            ) : null}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
