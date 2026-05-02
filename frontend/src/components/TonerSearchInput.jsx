import React, { useEffect, useRef, useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import api from "../lib/api";

const colorDot = (c) => {
    const map = { Cyan: "bg-[#00B7C7]", Magenta: "bg-[#E6007E]", Yellow: "bg-[#F5C400]", Black: "bg-[#0A0A0B]" };
    return map[c] || "bg-slate-700";
};

/**
 * Premium spotlight-style search input with autocomplete.
 * Always renders solid black input text on a frosted-glass surface.
 *
 * Props:
 *   value, onChange (input text)
 *   onSubmit({ query, master? })
 *   placeholder
 *   tone: "light" | "dark"  → adjusts input/placeholder visibility
 */
export default function TonerSearchInput({ value, onChange, onSubmit, placeholder = "Search by toner model — try HP 88A, TN-2365, Canon 925", tone = "light", testId = "toner-search-input" }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [active, setActive] = useState(0);
    const wrapRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const t = setTimeout(async () => {
            const v = (value || "").trim();
            if (!v || v.length < 2) { setItems([]); return; }
            try {
                const r = await api.get("/toner-master", { params: { q: v, limit: 8 } });
                setItems(r.data);
                setActive(0);
            } catch { /* ignore */ }
        }, 180);
        return () => clearTimeout(t);
    }, [value]);

    useEffect(() => {
        const onClick = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const choose = (it) => {
        onChange(it.model_number);
        onSubmit?.({ query: it.model_number, master: it });
        setOpen(false);
        inputRef.current?.blur();
    };

    const onKey = (e) => {
        if (!open || !items.length) {
            if (e.key === "Enter") { e.preventDefault(); onSubmit?.({ query: value }); inputRef.current?.blur(); }
            return;
        }
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
        else if (e.key === "Escape") setOpen(false);
    };

    return (
        <div ref={wrapRef} className="relative w-full flex items-center gap-3 px-4">
            <Search size={18} className="text-[#86868B] shrink-0" />
            <input
                ref={inputRef}
                value={value}
                onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKey}
                placeholder={placeholder}
                className="tc-search-input"
                data-testid={testId}
                autoComplete="off"
                spellCheck="false"
                style={tone === "dark" ? { color: "#FFFFFF" } : undefined}
            />
            {value && (
                <button
                    onClick={() => { onChange(""); inputRef.current?.focus(); }}
                    className="text-[12px] text-[#86868B] hover:text-[#0A0A0B] px-2 py-1 rounded-md"
                    data-testid="search-clear-btn"
                    type="button"
                >
                    Clear
                </button>
            )}

            {open && items.length > 0 && (
                <div className="tc-suggest" data-testid="toner-suggest-dropdown">
                    {items.map((it, idx) => (
                        <div
                            key={it.id}
                            className={`tc-suggest-item ${idx === active ? "active" : ""}`}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => choose(it)}
                            data-testid={`suggest-${it.id}`}
                        >
                            <div className={`w-2.5 h-2.5 rounded-full ${colorDot(it.color)} shrink-0`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-[15px] font-semibold text-[#0A0A0B] truncate">
                                    {it.brand} <span className="font-mono">{it.model_number}</span>
                                </div>
                                <div className="text-[12px] text-[#6E6E73] truncate mt-0.5">{it.printer_compatibility}</div>
                            </div>
                            <span className="text-[10px] tracking-wider uppercase font-semibold text-[#6E6E73] px-2 py-1 rounded-full bg-black/[0.04]">
                                {it.toner_type}
                            </span>
                            <ArrowUpRight size={14} className="text-[#86868B]" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
