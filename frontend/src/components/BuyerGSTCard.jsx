import React, { useEffect, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { CheckCircle2, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export default function BuyerGSTCard() {
    const { user, refresh } = useAuth();
    const [value, setValue] = useState("");
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setValue((user?.gst_number || "").toUpperCase());
    }, [user?.gst_number]);

    const save = async () => {
        const v = (value || "").trim().toUpperCase();
        if (v && !GSTIN_RE.test(v)) { toast.error("Enter a valid 15-character GSTIN"); return; }
        setSaving(true);
        try {
            await api.patch("/auth/me", { gst_number: v });
            toast.success(v ? "GST number saved" : "GST number cleared");
            setEditing(false);
            refresh?.();
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSaving(false);
        }
    };

    const currentGst = user?.gst_number;

    return (
        <div className="tc-card-flat p-5" data-testid="buyer-gst-card">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <FileText size={14} className="text-[#00B7C7]" />
                        <h3 className="text-[14.5px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>GST number</h3>
                    </div>
                    {!editing && currentGst && (
                        <div className="flex items-center gap-2 mt-2">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            <span className="font-mono text-[14px] font-semibold text-[#0A0A0B]" data-testid="buyer-gst-value">{currentGst}</span>
                        </div>
                    )}
                    {!editing && !currentGst && (
                        <div className="text-[12.5px] text-[#6E6E73] mt-1.5 max-w-md">
                            Add your GST number to receive proper B2B invoices from suppliers.
                        </div>
                    )}
                </div>
                {!editing && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="buyer-gst-edit-btn">
                        <Pencil size={12} className="mr-1" /> {currentGst ? "Edit" : "Add"}
                    </Button>
                )}
            </div>

            {editing && (
                <div className="mt-3 flex flex-wrap items-end gap-3" data-testid="buyer-gst-edit-row">
                    <div className="flex-1 min-w-[200px]">
                        <Label>GSTIN (optional)</Label>
                        <Input
                            value={value}
                            onChange={(e) => setValue(e.target.value.toUpperCase())}
                            placeholder="22AAAAA0000A1Z5"
                            maxLength={15}
                            data-testid="buyer-gst-input"
                        />
                        <div className="text-[11px] text-[#6E6E73] mt-1">15 alphanumeric characters. Leave blank to clear.</div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => { setEditing(false); setValue((currentGst || "").toUpperCase()); }} disabled={saving}>Cancel</Button>
                        <Button className="btn-cta" onClick={save} disabled={saving} data-testid="buyer-gst-save-btn">{saving ? "Saving…" : "Save"}</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
