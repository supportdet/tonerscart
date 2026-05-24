import React from "react";
import { Input } from "./ui/input";

/**
 * Phone input with a non-editable "+91" prefix box on the left.
 * - Main input accepts ONLY digits, max 10
 * - `value` is the raw 10-digit string (no +91 prefix)
 * - `onChange(rawDigits)` is called with the 10-digit string
 * - Works in two sizes: "lg" (default, ~52px) and "sm" (~36-40px for compact dialogs)
 *
 * Usage:
 *   <PhonePrefixInput value={phone} onChange={setPhone} required testId="lead-phone" />
 */
export default function PhonePrefixInput({
    value,
    onChange,
    required,
    placeholder = "10-digit mobile",
    testId,
    size = "lg",
    className = "",
    disabled,
}) {
    // Strip any leading +91 / 91 / non-digits the caller may have supplied
    const raw = (value || "").replace(/^\+?91[\s-]?/, "").replace(/\D/g, "").slice(0, 10);

    const handle = (e) => {
        const next = e.target.value.replace(/\D/g, "").slice(0, 10);
        onChange?.(next);
    };

    const sizeCls =
        size === "sm"
            ? "h-9 text-[13px]"
            : "tc-input-lg h-[52px]";
    const prefixSizeCls =
        size === "sm"
            ? "h-9 px-2.5 text-[12.5px]"
            : "h-[52px] px-3 text-[14px]";

    return (
        <div className={`flex items-stretch ${className}`} data-testid={testId ? `${testId}-wrap` : undefined}>
            <span
                className={`inline-flex items-center font-semibold text-[#0A0A0B] bg-[#F4F4F6] border-y border-l border-[#E8E8EC] rounded-l-md select-none ${prefixSizeCls}`}
                aria-hidden="true"
            >
                +91
            </span>
            <Input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                value={raw}
                onChange={handle}
                required={required}
                disabled={disabled}
                placeholder={placeholder}
                data-testid={testId}
                className={`${sizeCls} rounded-l-none border-l-0 flex-1 min-w-0`}
            />
        </div>
    );
}
