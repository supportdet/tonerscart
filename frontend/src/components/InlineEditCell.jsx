import React, { useEffect, useRef, useState } from "react";
import { Pencil, Check, X as XIcon, Loader2 } from "lucide-react";

/**
 * Inline editable cell (Wave 96).
 *
 * Renders a value + pencil icon. Click pencil → switches to <input>.
 * Enter / ✓ saves, Esc / ✕ cancels. While saving, shows spinner.
 *
 * Props:
 *   value        – current value (number or string)
 *   displayValue – optional already-formatted string to render in read mode
 *                  (e.g. "₹1,234 (incl. 18% GST)"). Falls back to `value`.
 *   onSave       – async (newValue) => void. Throws to keep editor open.
 *   type         – "number" | "text"  (default "number")
 *   min          – numeric min (default 0)
 *   step         – numeric step (default "any")
 *   testid       – data-testid prefix (e.g. "inline-price-{id}")
 *   ariaLabel    – screen-reader label for the pencil icon
 */
export default function InlineEditCell({
    value,
    displayValue,
    onSave,
    type = "number",
    min = 0,
    step = "any",
    testid,
    ariaLabel = "Edit",
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value == null ? "" : String(value));
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!editing) setDraft(value == null ? "" : String(value));
    }, [value, editing]);

    useEffect(() => {
        if (editing) {
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select?.();
            }, 0);
        }
    }, [editing]);

    const start = () => { setDraft(value == null ? "" : String(value)); setEditing(true); };

    const cancel = () => { setEditing(false); setDraft(value == null ? "" : String(value)); };

    const commit = async () => {
        let next = draft;
        if (type === "number") {
            const n = Number(draft);
            if (!Number.isFinite(n) || n < Number(min)) {
                return; // invalid — keep editor open
            }
            next = n;
        }
        if (String(next) === String(value ?? "")) { setEditing(false); return; }
        try {
            setSaving(true);
            await onSave(next);
            setEditing(false);
        } catch {
            // onSave handler is expected to toast — just keep editor open
        } finally {
            setSaving(false);
        }
    };

    const onKey = (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };

    if (!editing) {
        return (
            <div className="inline-flex items-center gap-1.5">
                <span data-testid={testid ? `${testid}-value` : undefined}>{displayValue ?? value ?? "—"}</span>
                <button
                    type="button"
                    onClick={start}
                    aria-label={ariaLabel}
                    title={ariaLabel}
                    className="inline-grid place-items-center w-6 h-6 rounded text-[#86868B] hover:text-[#00B7C7] hover:bg-[#ECFBFD] transition-colors"
                    data-testid={testid ? `${testid}-edit` : undefined}
                >
                    <Pencil size={11} />
                </button>
            </div>
        );
    }

    return (
        <div className="inline-flex items-center gap-1.5">
            <input
                ref={inputRef}
                type={type}
                min={type === "number" ? min : undefined}
                step={type === "number" ? step : undefined}
                value={draft}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                onBlur={commit}
                className="w-24 px-2 py-1 text-[12.5px] font-mono border border-[#00B7C7] bg-white rounded focus:outline-none focus:ring-2 focus:ring-[#00B7C7]/30"
                data-testid={testid ? `${testid}-input` : undefined}
            />
            <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(); }}
                disabled={saving}
                aria-label="Save"
                title="Save (Enter)"
                className="inline-grid place-items-center w-6 h-6 rounded text-emerald-600 hover:bg-emerald-50"
                data-testid={testid ? `${testid}-save` : undefined}
            >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            </button>
            <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); cancel(); }}
                disabled={saving}
                aria-label="Cancel"
                title="Cancel (Esc)"
                className="inline-grid place-items-center w-6 h-6 rounded text-red-500 hover:bg-red-50"
                data-testid={testid ? `${testid}-cancel` : undefined}
            >
                <XIcon size={11} />
            </button>
        </div>
    );
}
