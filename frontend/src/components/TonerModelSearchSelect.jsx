import React, { useEffect, useRef, useState } from "react";
import { Search, Check, X } from "lucide-react";
import { Input } from "./ui/input";
import api from "../lib/api";

/**
 * Searchable dropdown for toner cartridge model numbers, sourced from the
 * 571-row compatibility database (`/api/compat/toners`). Same-brand models
 * float to the top when `brand` is set. Dealer can also free-type a custom
 * model if their cartridge isn't catalogued yet — emits onSelect(model, []).
 *
 * Props
 *   value         string   currently-selected model (controlled)
 *   onChange(v)   fn       called on every keystroke (for free-typed values)
 *   onSelect(model, printers[])  called when dealer picks a catalogued model.
 *                              `printers` is the array of compatible printer
 *                              full names (e.g. ["HP LaserJet P1007", ...])
 *                              so the caller can auto-populate "Suitable for".
 *   brand         string   floats matching-brand toners to top
 *   testIdPrefix  string
 *   placeholder   string
 *   required      bool
 */
export default function TonerModelSearchSelect({
    value,
    onChange,
    onSelect,
    brand = "",
    testIdPrefix = "toner-model",
    placeholder = "Search cartridge model — Q2612A, CB388A, TN-2365…",
    required = false,
}) {
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const containerRef = useRef(null);
    const debounceRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        const onDocClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    // Debounced search
    useEffect(() => {
        if (!open) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ q: value || "", limit: "30" });
                if (brand) params.set("brand", brand);
                const { data } = await api.get(`/compat/toners?${params.toString()}`);
                setResults(Array.isArray(data) ? data : []);
                setActiveIdx(-1);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 180);
        return () => debounceRef.current && clearTimeout(debounceRef.current);
    }, [value, brand, open]);

    const pickFromDb = async (item) => {
        onChange(item.model);
        setOpen(false);
        // Fetch full toner detail to get the compatible printers list
        try {
            const { data } = await api.get(`/compat/toner/${encodeURIComponent(item.model)}`);
            const printers = Array.isArray(data?.printers) ? data.printers : [];
            onSelect && onSelect(item.model, printers);
        } catch {
            onSelect && onSelect(item.model, []);
        }
    };

    const onKeyDown = (e) => {
        if (!open) {
            if (e.key === "ArrowDown") { setOpen(true); e.preventDefault(); }
            return;
        }
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
        else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pickFromDb(results[activeIdx]); }
        else if (e.key === "Escape") { setOpen(false); }
    };

    const clear = () => {
        onChange("");
        onSelect && onSelect("", []);
        setOpen(false);
    };

    return (
        <div className="relative" ref={containerRef}>
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B] pointer-events-none z-10" />
                <Input
                    type="text"
                    value={value || ""}
                    onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    required={required}
                    placeholder={placeholder}
                    className="tc-input-lg"
                    style={{ paddingLeft: 36, paddingRight: 36 }}
                    data-testid={`${testIdPrefix}-input`}
                    autoComplete="off"
                />
                {value ? (
                    <button
                        type="button"
                        onClick={clear}
                        aria-label="Clear"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#0A0A0B] p-1"
                        data-testid={`${testIdPrefix}-clear`}
                    >
                        <X size={14} />
                    </button>
                ) : null}
            </div>

            {open && (
                <div
                    className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-lg border border-black/[0.08] tc-shadow-lg max-h-72 overflow-y-auto"
                    data-testid={`${testIdPrefix}-dropdown`}
                >
                    {loading ? (
                        <div className="px-3 py-3 text-[12.5px] text-[#86868B]">Searching…</div>
                    ) : results.length === 0 ? (
                        <div className="px-3 py-3 text-[12.5px] text-[#86868B]">
                            No catalogued model matches. Type your model number and continue — your listing will still be saved.
                        </div>
                    ) : (
                        <ul role="listbox" data-testid={`${testIdPrefix}-options`}>
                            {results.map((r, i) => {
                                const isActive = i === activeIdx;
                                const isSelected = (value || "").trim().toLowerCase() === r.model.toLowerCase();
                                const sameBrand = brand && r.brand?.toLowerCase() === brand.toLowerCase();
                                return (
                                    <li
                                        key={r.slug || r.model}
                                        role="option"
                                        aria-selected={isSelected}
                                        onMouseDown={(e) => { e.preventDefault(); pickFromDb(r); }}
                                        onMouseEnter={() => setActiveIdx(i)}
                                        className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-[13px] ${isActive ? "bg-[#FFF8E1]" : "hover:bg-[#FAFAFB]"} border-b border-black/[0.04] last:border-b-0`}
                                        data-testid={`${testIdPrefix}-option-${i}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-mono font-semibold text-[13px] text-[#0A0A0B] truncate">{r.model}</div>
                                            <div className="text-[11px] text-[#6E6E73] truncate">
                                                {r.brand}{r.type ? ` · ${r.type}` : ""}
                                                {sameBrand && <span className="ml-1.5 inline-block px-1.5 py-[1px] bg-emerald-50 text-emerald-700 rounded text-[10px] font-semibold uppercase tracking-wide">Same brand</span>}
                                            </div>
                                        </div>
                                        {isSelected && <Check size={14} className="text-emerald-600 shrink-0" />}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
