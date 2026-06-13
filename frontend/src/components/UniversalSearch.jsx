import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import api from "../lib/api";
import { searchCacheGet, searchCacheSet } from "../lib/searchCache";

// Platform-wide search bar shown at the top of every category page.
//
// Behaviour:
//   • Submit → /search?q=… (full universal results page)
//   • Live typeahead → 300ms debounce; fetches /search/universal with limit=6
//     so the dropdown stays snappy. Cached so repeat keystrokes don't re-hit
//     the network.
//   • Skeleton-style loading row while a fresh search resolves — never a
//     blank dropdown.
//   • Skips Gemini AI search for typeahead (only the full page calls it).
export default function UniversalSearch({ initial = "" }) {
    const navigate = useNavigate();
    const [q, setQ] = useState(initial);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const boxRef = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // 300ms debounced live search — only for ≥ 2 chars to avoid useless calls.
    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) { setResults(null); setLoading(false); return; }
        const reqParams = { q: term, limit_per_type: 6 };
        const cached = searchCacheGet("/search/universal-mini", reqParams);
        if (cached) {
            setResults(cached);
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const { data } = await api.get("/search/universal", { params: reqParams });
                setResults(data || null);
                searchCacheSet("/search/universal-mini", reqParams, data || null);
            } catch {
                setResults(null);
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => debounceRef.current && clearTimeout(debounceRef.current);
    }, [q]);

    const submit = (e) => {
        e?.preventDefault?.();
        const term = q.trim();
        setOpen(false);
        navigate(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
    };

    const items = results ? [
        ...(results.toners || []).slice(0, 4).map((p) => ({ kind: "toner", label: `${p.brand} ${p.model_number}`, sub: p.toner_type || "Toner", to: `/toner/${p.id}` })),
        ...(results.printers || []).slice(0, 3).map((p) => ({ kind: "printer", label: `${p.brand} ${p.model_number}`, sub: p.category || "Printer", to: `/printer/${p.id}` })),
        ...(results.papers || []).slice(0, 2).map((p) => ({ kind: "paper", label: `${p.brand} ${p.size} ${p.gsm}gsm`, sub: "Paper", to: `/paper/${p.id}` })),
        ...(results.consumables || []).slice(0, 2).map((p) => ({ kind: "consumable", label: `${p.brand} ${p.model_number}`, sub: p.subcategory || "Consumable", to: `/consumable/${p.id}` })),
    ].slice(0, 8) : [];

    return (
        <form onSubmit={submit} role="search" data-testid="universal-search-form" className="w-full relative" ref={boxRef}>
            <div className="flex items-center gap-3 h-14 px-5 rounded-2xl border border-[#D2D2D7] bg-white shadow-sm focus-within:border-[#0A0A0B] focus-within:shadow-md transition-all">
                <Search size={20} className="text-[#86868B] shrink-0" />
                <input
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    placeholder="Search toners, printers, papers, consumables…"
                    aria-label="Search the marketplace"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-[#0A0A0B] placeholder:text-[#86868B]"
                    data-testid="universal-search-input"
                    autoComplete="off"
                />
                {loading && <Loader2 size={16} className="text-[#86868B] animate-spin shrink-0" />}
                <button
                    type="submit"
                    className="h-10 px-6 sm:px-7 rounded-xl bg-[#0A0A0B] text-white text-[13.5px] font-semibold hover:bg-[#1D1D1F] transition-colors shrink-0"
                    data-testid="universal-search-submit"
                >
                    Search
                </button>
            </div>
            {open && q.trim().length >= 2 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-[#D2D2D7] shadow-xl overflow-hidden" data-testid="universal-search-dropdown">
                    {loading && !results ? (
                        // Skeleton rows — never a blank dropdown.
                        <div className="p-2" data-testid="universal-search-skeleton">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                                    <div className="w-2 h-2 rounded-full bg-black/10" />
                                    <div className="flex-1">
                                        <div className="h-3.5 bg-black/[0.08] rounded w-2/3" />
                                        <div className="h-2.5 bg-black/[0.05] rounded w-1/3 mt-1.5" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="px-4 py-3 text-[13px] text-[#86868B]">No quick matches. Press <strong>Enter</strong> to see full results.</div>
                    ) : (
                        <ul role="listbox">
                            {items.map((it, i) => (
                                <li key={`${it.kind}-${i}`}>
                                    <button
                                        type="button"
                                        onClick={() => { setOpen(false); navigate(it.to); }}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[#FAFAFB] border-b border-black/[0.04] last:border-b-0 text-left"
                                        data-testid={`universal-search-result-${i}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="text-[13.5px] font-semibold text-[#0A0A0B] truncate">{it.label}</div>
                                            <div className="text-[11.5px] text-[#86868B]">{it.sub}</div>
                                        </div>
                                        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[#86868B] shrink-0">{it.kind}</span>
                                    </button>
                                </li>
                            ))}
                            <li>
                                <button type="button" onClick={submit} className="w-full px-4 py-2.5 text-[12.5px] font-semibold text-[#0A0A0B] bg-[#FAFAFB] hover:bg-black/[0.05]" data-testid="universal-search-see-all">
                                    See all results for &ldquo;{q}&rdquo; →
                                </button>
                            </li>
                        </ul>
                    )}
                </div>
            )}
        </form>
    );
}
