import React, { useRef } from "react";
import { Search } from "lucide-react";

/**
 * Plain search input — no suggestions, no brand hints.
 * Search is executed via onSubmit({ query }) on Enter or button click.
 */
export default function TonerSearchInput({
    value,
    onChange,
    onSubmit,
    placeholder = "Search by toner or printer model",
    tone = "light",
    testId = "toner-search-input",
}) {
    const inputRef = useRef(null);

    const onKey = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            onSubmit?.({ query: value });
            inputRef.current?.blur();
        }
    };

    return (
        <div className="relative w-full flex items-center gap-3 px-4">
            <Search size={18} className="text-[#86868B] shrink-0" />
            <input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
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
        </div>
    );
}
