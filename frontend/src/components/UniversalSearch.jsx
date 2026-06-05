import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

// The single, identical platform-wide search bar shown at the top of every
// category page (/search, /printers/results, /papers, /consumables). It always
// searches universally across ALL categories (toners, printers, papers,
// consumables, OEM) by routing to the universal results on /search.
export default function UniversalSearch({ initial = "" }) {
    const navigate = useNavigate();
    const [q, setQ] = useState(initial);

    const submit = (e) => {
        e.preventDefault();
        const term = q.trim();
        navigate(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
    };

    return (
        <form onSubmit={submit} role="search" data-testid="universal-search-form" className="w-full">
            <div className="flex items-center gap-2 h-12 px-3.5 rounded-xl border border-[#D2D2D7] bg-white shadow-sm focus-within:border-[#0A0A0B] transition-colors">
                <Search size={18} className="text-[#86868B] shrink-0" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search toners, printers, papers, consumables…"
                    aria-label="Search the marketplace"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[#0A0A0B] placeholder:text-[#86868B]"
                    data-testid="universal-search-input"
                />
                <button
                    type="submit"
                    className="h-9 px-4 sm:px-5 rounded-lg bg-[#0A0A0B] text-white text-[13px] font-semibold hover:bg-[#1D1D1F] transition-colors shrink-0"
                    data-testid="universal-search-submit"
                >
                    Search
                </button>
            </div>
        </form>
    );
}
