import React, { useState } from "react";
import { SlidersHorizontal, ArrowUpDown, X } from "lucide-react";

// Presentational, controlled filter + sort bar shared by the category pages
// (toners / printers / papers / consumables). Horizontal on desktop, a
// collapsible drawer on mobile. Filters apply instantly — the parent owns the
// state and does the actual client-side filtering/sorting in a useMemo.
//
// Props:
//   selects:     [{ key, label, allLabel, options:[{value,label}] }]
//   showPrice:   boolean — render min/max price inputs
//   sortOptions: [{ value, label }]
//   value:       { [key]: string, minPrice, maxPrice, sort }
//   onChange:    (nextValue) => void
//   resultCount: number (optional, shown as "N results")

const selectCls =
    "h-10 px-3 rounded-lg border border-[#D2D2D7] bg-white text-[13px] text-[#0A0A0B] focus:outline-none focus:border-[#0A0A0B] transition-colors min-w-[130px]";

export default function CategoryFilters({ selects = [], showPrice = true, sortOptions = [], value, onChange, resultCount }) {
    const [open, setOpen] = useState(false);
    const set = (patch) => onChange({ ...value, ...patch });

    const activeCount =
        selects.filter((s) => value[s.key]).length +
        (value.minPrice ? 1 : 0) +
        (value.maxPrice ? 1 : 0);

    const clearAll = () => {
        const cleared = { sort: value.sort };
        selects.forEach((s) => { cleared[s.key] = ""; });
        cleared.minPrice = "";
        cleared.maxPrice = "";
        onChange(cleared);
    };

    const Controls = ({ stacked }) => (
        <div className={stacked ? "flex flex-col gap-3" : "flex flex-wrap items-center gap-2.5"}>
            {selects.map((s) => (
                <label key={s.key} className={stacked ? "flex flex-col gap-1" : "contents"}>
                    {stacked && <span className="text-[12px] font-medium text-[#6E6E73]">{s.label}</span>}
                    <select
                        value={value[s.key] || ""}
                        onChange={(e) => set({ [s.key]: e.target.value })}
                        className={`${selectCls}${stacked ? " w-full" : ""}`}
                        data-testid={`filter-${s.key}`}
                        aria-label={s.label}
                    >
                        <option value="">{s.allLabel || `All ${s.label.toLowerCase()}`}</option>
                        {s.options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
            ))}

            {showPrice && (
                <div className={stacked ? "flex flex-col gap-1" : "flex items-center gap-1.5"}>
                    {stacked && <span className="text-[12px] font-medium text-[#6E6E73]">Price (₹)</span>}
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number" min="0" inputMode="numeric"
                            value={value.minPrice || ""}
                            onChange={(e) => set({ minPrice: e.target.value })}
                            placeholder="Min"
                            className={`${selectCls} w-[88px] min-w-0`}
                            data-testid="filter-min-price"
                            aria-label="Minimum price"
                        />
                        <span className="text-[#86868B] text-[13px]">–</span>
                        <input
                            type="number" min="0" inputMode="numeric"
                            value={value.maxPrice || ""}
                            onChange={(e) => set({ maxPrice: e.target.value })}
                            placeholder="Max"
                            className={`${selectCls} w-[88px] min-w-0`}
                            data-testid="filter-max-price"
                            aria-label="Maximum price"
                        />
                    </div>
                </div>
            )}

            {sortOptions.length > 0 && (
                <label className={stacked ? "flex flex-col gap-1" : "flex items-center gap-1.5 ml-auto"}>
                    {stacked ? (
                        <span className="text-[12px] font-medium text-[#6E6E73]">Sort by</span>
                    ) : (
                        <ArrowUpDown size={14} className="text-[#86868B]" />
                    )}
                    <select
                        value={value.sort || sortOptions[0].value}
                        onChange={(e) => set({ sort: e.target.value })}
                        className={`${selectCls}${stacked ? " w-full" : ""}`}
                        data-testid="filter-sort"
                        aria-label="Sort by"
                    >
                        {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </label>
            )}
        </div>
    );

    return (
        <div data-testid="category-filters">
            {/* Desktop — horizontal bar */}
            <div className="hidden md:flex items-center gap-2.5 bg-white border border-black/[0.06] rounded-xl p-3 shadow-sm">
                <Controls stacked={false} />
                {activeCount > 0 && (
                    <button onClick={clearAll} className="text-[12.5px] font-medium text-[#6E6E73] hover:text-[#0A0A0B] inline-flex items-center gap-1 shrink-0" data-testid="filters-clear">
                        <X size={13} /> Clear
                    </button>
                )}
            </div>

            {/* Mobile — toggle + collapsible drawer */}
            <div className="md:hidden">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setOpen(true)}
                        className="flex-1 h-11 rounded-xl border border-[#D2D2D7] bg-white text-[13.5px] font-semibold text-[#0A0A0B] inline-flex items-center justify-center gap-2"
                        data-testid="filters-mobile-toggle"
                    >
                        <SlidersHorizontal size={15} /> Filters & Sort
                        {activeCount > 0 && <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-[#0A0A0B] text-white text-[11px] grid place-items-center">{activeCount}</span>}
                    </button>
                </div>

                {open && (
                    <div className="fixed inset-0 z-[200] md:hidden" data-testid="filters-drawer">
                        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
                        <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl p-5 max-h-[82vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-[15px] font-semibold text-[#0A0A0B]">Filters & Sort</div>
                                <button onClick={() => setOpen(false)} className="w-8 h-8 grid place-items-center rounded-full hover:bg-black/[0.05]" aria-label="Close" data-testid="filters-drawer-close">
                                    <X size={16} />
                                </button>
                            </div>
                            <Controls stacked />
                            <div className="mt-5 flex items-center gap-2.5">
                                {activeCount > 0 && (
                                    <button onClick={clearAll} className="flex-1 h-11 rounded-xl border border-[#D2D2D7] text-[13.5px] font-semibold text-[#0A0A0B]" data-testid="filters-drawer-clear">Clear all</button>
                                )}
                                <button onClick={() => setOpen(false)} className="flex-1 h-11 rounded-xl bg-[#0A0A0B] text-white text-[13.5px] font-semibold" data-testid="filters-drawer-apply">
                                    Show {resultCount != null ? `${resultCount} ` : ""}results
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
