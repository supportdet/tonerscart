import React, { useEffect, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import api from "../lib/api";

/**
 * Searchable single-select bound to the 546 printer models in the compatibility
 * DB. Dealer types a partial name → sees matching models → selects the exact
 * one (which also auto-fills the brand). Free text is still allowed as a
 * fallback for models not yet in the DB.
 */
export default function PrinterModelSelect({ value = "", onChange, onSelect, testid = "printer-model", brand = "" }) {
    const [q, setQ] = useState(value || "");
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
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
            {open && (results.length > 0 || loading) && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E5EA] rounded-xl shadow-xl max-h-60 overflow-y-auto" data-testid={`${testid}-dropdown`}>
                    {loading && results.length === 0 ? (
                        <div className="px-3 py-2 text-[12.5px] text-[#86868B]">Searching…</div>
                    ) : results.map((p) => (
                        <button type="button" key={p.slug} onClick={() => pick(p)}
                            className="block w-full text-left px-3 py-2 text-[13px] text-[#0A0A0B] hover:bg-[#F2FBFC]" data-testid={`${testid}-option`}>
                            <span className="font-semibold">{p.full_name}</span>
                            <span className="text-[#86868B] text-[11.5px] ml-1.5 uppercase">{p.type}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
