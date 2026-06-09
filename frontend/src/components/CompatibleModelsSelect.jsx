import React, { useEffect, useRef, useState } from "react";
import { X, Search as SearchIcon } from "lucide-react";
import api from "../lib/api";

/**
 * Searchable multi-select bound to the compatibility database.
 *  - mode="printers" → dealer picks compatible PRINTER models (for toners/consumables)
 *  - mode="toners"   → dealer picks compatible CARTRIDGE/TONER models (for printers)
 *
 * Selections are stored back as a comma-joined string (same format the rest of
 * the app already uses), so existing matching keeps working. Existing free-text
 * values are preserved as removable chips even if they aren't in the DB.
 */
export default function CompatibleModelsSelect({
    mode = "printers",
    value = "",
    onChange,
    testid = "compatible-models",
    placeholder,
}) {
    const parse = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
    const [selected, setSelected] = useState(parse(value));
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const boxRef = useRef(null);

    // Keep internal state in sync when the parent resets the value (edit/add toggle).
    useEffect(() => { setSelected(parse(value)); /* eslint-disable-next-line */ }, [value]);

    const commit = (next) => {
        setSelected(next);
        onChange && onChange(next.join(", "));
    };

    const add = (label) => {
        if (!label) return;
        if (!selected.some((s) => s.toLowerCase() === label.toLowerCase())) {
            commit([...selected, label]);
        }
        setQ("");
        setResults([]);
        setOpen(false);
    };

    const remove = (label) => commit(selected.filter((s) => s !== label));

    useEffect(() => {
        const term = q.trim();
        if (!term) { setResults([]); return; }
        let active = true;
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const { data } = await api.get(`/compat/${mode}`, { params: { q: term, limit: 12 } });
                if (!active) return;
                const opts = (Array.isArray(data) ? data : []).map((d) =>
                    mode === "printers" ? d.full_name : `${d.model}`
                );
                setResults(opts);
                setOpen(true);
            } catch {
                if (active) setResults([]);
            } finally {
                if (active) setLoading(false);
            }
        }, 220);
        return () => { active = false; clearTimeout(t); };
    }, [q, mode]);

    useEffect(() => {
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const ph = placeholder || (mode === "printers"
        ? "Type a printer model, e.g. M1005"
        : "Type a cartridge code, e.g. 88A");

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
                    onFocus={() => results.length && setOpen(true)}
                    placeholder={ph}
                    className="tc-input-lg w-full"
                    style={{ paddingLeft: "2.4rem" }}
                    data-testid={`${testid}-input`}
                    autoComplete="off"
                />
            </div>
            {open && (results.length > 0 || loading) && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E5EA] rounded-xl shadow-xl max-h-60 overflow-y-auto" data-testid={`${testid}-dropdown`}>
                    {loading && results.length === 0 ? (
                        <div className="px-3 py-2 text-[12.5px] text-[#86868B]">Searching…</div>
                    ) : (
                        results.map((r) => (
                            <button type="button" key={r} onClick={() => add(r)}
                                className="block w-full text-left px-3 py-2 text-[13px] text-[#0A0A0B] hover:bg-[#F2FBFC]"
                                data-testid={`${testid}-option`}>
                                {r}
                            </button>
                        ))
                    )}
                </div>
            )}
            <div className="text-[11px] text-[#86868B] mt-1">
                {mode === "printers" ? "Search and select compatible printer models. " : "Search and select compatible cartridges. "}
                Multiple allowed — exact matches only.
            </div>
        </div>
    );
}
