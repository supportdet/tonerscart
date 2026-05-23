import React from "react";
import { Search } from "lucide-react";

/** Plain search input — no autocomplete dropdown.
 *  Per product decision: suggestions are disabled platform-wide. Pressing
 *  Enter or clicking the Search button submits whatever the user typed. */
export default function TonerSearchInput({ value, onChange, onSubmit, placeholder, testId }) {
    return (
        <div className="relative w-full">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55 sm:text-[#86868B] pointer-events-none z-10" />
            <input
                type="text"
                value={value || ""}
                onChange={(e) => onChange?.(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        onSubmit?.();
                    }
                }}
                placeholder={placeholder || "Search HP 88A, Canon 337, Brother TN-2365…"}
                className="tc-search-input"
                aria-label="Search toners"
                data-testid={testId || "search-input"}
                autoComplete="off"
            />
        </div>
    );
}
