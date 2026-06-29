import React, { useEffect, useRef, useState } from "react";
import { X, Search as SearchIcon, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

/**
 * Searchable multi-select bound to the compatibility database.
 *  - mode="printers" → dealer picks compatible PRINTER models (for toners/consumables)
 *  - mode="toners"   → dealer picks compatible CARTRIDGE/TONER models (for printers)
 *
 * Selections are stored back as a comma-joined string (same format the rest of
 * the app already uses), so existing matching keeps working. Existing free-text
 * values are preserved as removable chips even if they aren't in the DB.
 *
 * Wave 54 — dealers can now ADD a custom model when their typed query has no
 * match (or doesn't match exactly). Clicking the "Add as new model" CTA fires
 * `POST /api/compat/custom-printer` (or `/custom-toner`), seeds the
 * `custom_printer_models` / `custom_toner_models` table so the model surfaces
 * as an "Added by dealer" suggestion for every future upload, AND adds it to
 * the current chip list — same behaviour as the cartridge-code TonerModelSearchSelect.
 */
export default function CompatibleModelsSelect({
    mode = "printers",
    value = "",
    onChange,
    onItemAdded,
    testid = "compatible-models",
    placeholder,
    brand = "",
}) {
    const parse = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
    const [selected, setSelected] = useState(parse(value));
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const boxRef = useRef(null);

    // Keep internal state in sync when the parent resets the value (edit/add toggle).
    useEffect(() => { setSelected(parse(value)); /* eslint-disable-next-line */ }, [value]);

    const commit = (next) => {
        setSelected(next);
        onChange && onChange(next.join(", "));
    };

    const add = (label) => {
        if (!label) return;
        const isFirst = selected.length === 0;
        if (!selected.some((s) => s.toLowerCase() === label.toLowerCase())) {
            commit([...selected, label]);
            // Wave 97 — bidirectional auto-suggest: fire the caller's hook on
            // every add (and especially the first one) so the parent form can
            // look up the reverse mapping (e.g. printer → toner code).
            onItemAdded && onItemAdded(label, { isFirst });
        }
        setQ("");
        setResults([]);
        setOpen(false);
    };

    const remove = (label) => commit(selected.filter((s) => s !== label));

    useEffect(() => {
        if (!open) return;
        const term = q.trim();
        let active = true;
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const { data } = await api.get(`/compat/${mode}`, { params: { q: term, limit: 12, brand: brand || "" } });
                if (!active) return;
                // Preserve full result objects so we can show "Added by dealer" badges.
                const opts = (Array.isArray(data) ? data : []).map((d) => ({
                    label: mode === "printers" ? d.full_name : d.model,
                    sub: mode === "printers" ? (d.brand || "") : (d.brand || ""),
                    is_custom: !!d.is_custom,
                }));
                setResults(opts);
            } catch {
                if (active) setResults([]);
            } finally {
                if (active) setLoading(false);
            }
        }, 200);
        return () => { active = false; clearTimeout(t); };
    }, [q, mode, brand, open]);

    useEffect(() => {
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const submitCustom = async () => {
        const typed = q.trim();
        if (!typed) {
            toast.error(mode === "printers" ? "Type a printer model first" : "Type a cartridge code first");
            return;
        }
        if (!brand) {
            toast.error("Pick a brand first, then add a custom model");
            return;
        }
        setSubmitting(true);
        try {
            const endpoint = mode === "printers" ? "/compat/custom-printer" : "/compat/custom-toner";
            const { data } = await api.post(endpoint, { brand, model: typed });
            const label = mode === "printers" ? (data.full_name || `${brand} ${typed}`) : (data.model || typed);
            toast.success("Saved! It's now an \"Added by dealer\" suggestion for every dealer.");
            add(label);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not save custom model");
        } finally {
            setSubmitting(false);
        }
    };

    const ph = placeholder || (mode === "printers"
        ? "Type a printer model, e.g. M1005"
        : "Type a cartridge code, e.g. 88A");

    // Custom-add CTA shows whenever the typed query doesn't exactly match an
    // existing option and we already know the brand. Lets dealers submit even
    // if some catalogue suggestions are visible — they're explicit it's new.
    const typed = q.trim();
    const hasExactMatch = typed
        && results.some((r) => r.label.toLowerCase() === typed.toLowerCase());
    const showAddCta = open && typed.length >= 2 && !hasExactMatch;

    return (
        <div ref={boxRef} className="relative" data-testid={`${testid}-wrap`}>
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2" data-testid={`${testid}-chips`}>
                    {selected.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 bg-[#E8FBFD] text-[#0A6E78] border border-[#B7ECF1] rounded-full pl-3 pr-1.5 py-1 text-[12px] font-medium">
                            {s}
                            <button type="button" onClick={() => remove(s)} aria-label={`Remove ${s}`}
                                className="w-4 h-4 grid place-items-center rounded-full hover:bg-[#B7ECF1]" data-testid={`${testid}-remove`}>
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="relative">
                <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => setOpen(true)}
                    placeholder={ph}
                    className="tc-input-lg w-full"
                    style={{ paddingLeft: "2.4rem" }}
                    data-testid={`${testid}-input`}
                    autoComplete="off"
                />
            </div>
            {open && (results.length > 0 || loading || showAddCta) && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E5EA] rounded-xl shadow-xl max-h-60 overflow-y-auto" data-testid={`${testid}-dropdown`}>
                    {loading && results.length === 0 ? (
                        <div className="px-3 py-2 text-[12.5px] text-[#86868B]">Searching…</div>
                    ) : (
                        <>
                            {results.map((r) => (
                                <button type="button" key={r.label} onClick={() => add(r.label)}
                                    className="block w-full text-left px-3 py-2 text-[13px] text-[#0A0A0B] hover:bg-[#F2FBFC] border-b border-black/[0.04] last:border-b-0"
                                    data-testid={`${testid}-option`}>
                                    <span className="font-semibold">{r.label}</span>
                                    {r.is_custom && (
                                        <span
                                            className="ml-2 inline-block px-1.5 py-[1px] bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-semibold uppercase tracking-wide"
                                            data-testid={`${testid}-custom-badge`}
                                        >
                                            Added by dealer
                                        </span>
                                    )}
                                </button>
                            ))}
                            {showAddCta && (
                                <button
                                    type="button"
                                    onClick={submitCustom}
                                    disabled={submitting || !brand}
                                    className="w-full text-left px-3 py-2.5 text-[12.5px] font-semibold text-[#0A6E78] bg-[#ECFBFD] hover:bg-[#D6F5F9] border-t border-[#C2EFF5] inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                    data-testid={`${testid}-add-custom`}
                                    title={!brand ? "Pick a brand first" : undefined}
                                >
                                    <PlusCircle size={13} />
                                    {submitting ? "Saving…" : (
                                        brand
                                            ? <>Add &ldquo;<span className="font-mono">{brand} {typed}</span>&rdquo; as new model</>
                                            : <>Pick a brand first to add &ldquo;{typed}&rdquo; as a custom model</>
                                    )}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
            <div className="text-[11px] text-[#86868B] mt-1">
                {mode === "printers" ? "Search and select compatible printer models. " : "Search and select compatible cartridges. "}
                Multiple allowed. Don&rsquo;t see your model? Type it and click &ldquo;Add as new model&rdquo;.
            </div>
        </div>
    );
}
