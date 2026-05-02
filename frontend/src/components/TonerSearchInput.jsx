import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import api from "../lib/api";

const colorDot = (c) => {
    const map = { Cyan: "bg-[#00B7C7]", Magenta: "bg-[#E6007E]", Yellow: "bg-[#F7C600]", Black: "bg-[#0E0F12]" };
    return map[c] || "bg-slate-700";
};

/**
 * Smart toner search input. Calls /api/toner-master and shows live suggestions.
 * Props:
 *   value, onChange (input value)
 *   onSubmit({ query, master? }) — called when user presses enter or clicks a suggestion
 *   placeholder, size ("md" | "lg"), inputRef
 */
export default function TonerSearchInput({ value, onChange, onSubmit, placeholder = "Search by toner model — try HP 88A, TN-2365, Canon 925", size = "md", testId = "toner-search-input" }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [active, setActive] = useState(0);
    const wrapRef = useRef(null);

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
    };

    const onKey = (e) => {
        if (!open || !items.length) {
            if (e.key === "Enter") { e.preventDefault(); onSubmit?.({ query: value }); }
            return;
        }
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
        else if (e.key === "Escape") setOpen(false);
    };

    const padding = size === "lg" ? "h-14 text-base" : "h-11";

    return (
        <div className="relative w-full" ref={wrapRef}>
            <div className={`flex items-center gap-2 px-3 ${padding} bg-white rounded-md border border-transparent focus-within:border-slate-300`}>
                <Search size={size === "lg" ? 20 : 16} className="text-slate-400" />
                <input
                    value={value}
                    onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKey}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent border-0 outline-none text-[15px] placeholder:text-slate-400"
                    data-testid={testId}
                    autoComplete="off"
                />
            </div>
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
                            <div className={`w-2.5 h-2.5 rounded-full ${colorDot(it.color)}`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-[#0E0F12] truncate">
                                    {it.brand} <span className="font-mono">{it.model_number}</span>
                                </div>
                                <div className="text-xs text-slate-500 truncate">{it.printer_compatibility}</div>
                            </div>
                            <span className="tc-badge tc-badge-gray">{it.toner_type}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
