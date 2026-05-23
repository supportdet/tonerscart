import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search } from "lucide-react";
import api from "../lib/api";

/** Search input with debounced autocomplete from `/api/toner-master`.
 *  - Suggestions appear ONLY after the user types 2+ characters (no
 *    pre-populated suggestions on focus / empty input).
 *  - Type → request suggestions (300 ms debounce)
 *  - Up/Down arrows navigate, Enter selects or submits
 *  - Esc / outside click closes dropdown
 *  - Suggestions show model + brand chip */
export default function TonerSearchInput({ value, onChange, onSubmit, placeholder, testId }) {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [focusedIdx, setFocusedIdx] = useState(-1);
    const inputRef = useRef(null);
    const wrapperRef = useRef(null);
    const abortRef = useRef(null);
    const debounceRef = useRef(null);

    const fetchSuggestions = useCallback(async (q) => {
        const query = (q || "").trim();
        if (query.length < 2) { setSuggestions([]); setLoading(false); return; }
        if (abortRef.current) {
            try { abortRef.current.abort(); } catch (_e) { /* noop */ }
        }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        try {
            const { data } = await api.get("/toner-master", { params: { q: query, limit: 8 }, signal: ctrl.signal });
            const list = Array.isArray(data) ? data.slice(0, 8) : [];
            setSuggestions(list);
        } catch (err) {
            if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
                setSuggestions([]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
        return () => debounceRef.current && clearTimeout(debounceRef.current);
    }, [value, fetchSuggestions]);

    // Close dropdown on outside click
    useEffect(() => {
        const onClick = (e) => {
            if (!wrapperRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const pickSuggestion = (s) => {
        const q = s?.model_number || "";
        onChange?.(q);
        setOpen(false);
        setFocusedIdx(-1);
        onSubmit?.({ query: q });
    };

    const onKeyDown = (e) => {
        const ready = open && (value || "").trim().length >= 2 && suggestions.length > 0;
        if (!ready) {
            if (e.key === "Enter") { e.preventDefault(); onSubmit?.(); setOpen(false); }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocusedIdx((i) => Math.min(suggestions.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocusedIdx((i) => Math.max(-1, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (focusedIdx >= 0 && suggestions[focusedIdx]) {
                pickSuggestion(suggestions[focusedIdx]);
            } else {
                onSubmit?.();
                setOpen(false);
            }
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    // Dropdown only renders when user has typed >= 2 chars. No pre-populated
    // suggestions on focus / empty input.
    const trimmed = (value || "").trim();
    const showDropdown = open && trimmed.length >= 2 && (loading || suggestions.length > 0);

    return (
        <div ref={wrapperRef} className="relative w-full">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55 sm:text-[#86868B] pointer-events-none z-10" />
            <input
                ref={inputRef}
                type="text"
                value={value || ""}
                onChange={(e) => { onChange?.(e.target.value); setOpen(true); setFocusedIdx(-1); }}
                onFocus={() => trimmed.length >= 2 && setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder={placeholder || ""}
                className="tc-search-input"
                aria-label="Search toners"
                aria-autocomplete="list"
                aria-expanded={showDropdown}
                aria-controls={showDropdown ? "tc-search-suggest-list" : undefined}
                data-testid={testId || "search-input"}
                autoComplete="off"
            />

            {showDropdown && (
                <div
                    id="tc-search-suggest-list"
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-2 bg-white border border-black/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden max-h-[360px] overflow-y-auto"
                    data-testid="search-suggestions"
                >
                    {loading && (
                        <div className="px-4 py-3 text-[12.5px] text-[#86868B]" data-testid="search-suggest-loading">Loading…</div>
                    )}
                    {!loading && suggestions.map((s, i) => (
                        <button
                            type="button"
                            role="option"
                            key={`${s.brand}-${s.model_number}-${i}`}
                            onMouseEnter={() => setFocusedIdx(i)}
                            onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${i === focusedIdx ? "bg-[#FFFBEB]" : "hover:bg-[#F4F4F6]"}`}
                            data-testid={`search-suggest-${s.brand}-${s.model_number}`.replace(/\s+/g, "-")}
                            aria-selected={i === focusedIdx}
                        >
                            <Search size={13} className="text-[#86868B] shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="font-mono text-[13.5px] font-semibold text-[#0A0A0B] truncate">{s.model_number}</div>
                                <div className="text-[11.5px] text-[#6E6E73] truncate">{s.brand}{s.kind ? ` · ${s.kind}` : ""}</div>
                            </div>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#86868B] bg-[#F4F4F6] px-2 py-0.5 rounded">{s.brand}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
