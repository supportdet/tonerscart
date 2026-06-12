import React, { useState } from "react";
import { Mail, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useAuth } from "../context/AuthContext";

/**
 * Inline "Can't find your model?" trigger + dialog used below every
 * compatible-models dropdown on dealer upload forms. The submission goes to
 * the admin Messages tab (mps_inquiries with `selections.type =
 * "missing_model"`) so an admin can review and add the model to
 * `compatibility_db.py` in the next deploy.
 */
export default function MissingModelLink({ category = "toner", brand = "", testidPrefix = "missing-model" }) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [model, setModel] = useState("");
    const [brandIn, setBrandIn] = useState(brand || "");
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e?.preventDefault();
        if (!model.trim()) { toast.error("Enter the missing printer / model name"); return; }
        setSubmitting(true);
        try {
            await api.post("/mps/inquiry", {
                name: user?.business_name || user?.name || "Dealer",
                email: user?.email || "dealer@tonerscart.com",
                phone: user?.phone || "",
                description: `Missing model request from dealer: "${brandIn || "—"} ${model}" (category: ${category}).${note ? `\nNote: ${note}` : ""}`,
                estimated_printers: "—",
                selections: {
                    type: "missing_model",
                    brand: brandIn || null,
                    model: model.trim(),
                    category,
                    dealer_note: note || null,
                    submitted_by_user_id: user?.id || null,
                    submitted_by_business_name: user?.business_name || null,
                },
            });
            toast.success("Sent to admin — we'll add it to the database soon.");
            setOpen(false);
            setModel(""); setNote("");
        } catch (err) { toast.error(formatApiError(err) || "Couldn't submit"); }
        finally { setSubmitting(false); }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#00838f] hover:text-[#0A0A0B] hover:underline"
                data-testid={`${testidPrefix}-trigger`}
            >
                Can&apos;t find your model? <span aria-hidden>→</span>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md" data-testid={`${testidPrefix}-dialog`}>
                    <DialogHeader>
                        <DialogTitle className="text-[16px]">Request a missing model</DialogTitle>
                    </DialogHeader>
                    <p className="text-[12.5px] text-[#6E6E73] -mt-2">
                        Tell us the printer / cartridge model you couldn&apos;t find. Our team adds it to the compatibility database within 48 hours, after which your listing will appear correctly across all customer searches.
                    </p>
                    <form onSubmit={submit} className="space-y-3 mt-2">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                                <Label htmlFor="mm-brand" className="text-[11px]">Brand</Label>
                                <Input
                                    id="mm-brand"
                                    value={brandIn}
                                    onChange={(e) => setBrandIn(e.target.value)}
                                    placeholder="HP"
                                    data-testid={`${testidPrefix}-brand`}
                                />
                            </div>
                            <div className="col-span-2">
                                <Label htmlFor="mm-model" className="text-[11px]">Model name<span className="text-red-500"> *</span></Label>
                                <Input
                                    id="mm-model"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    placeholder="e.g. LaserJet Pro 4005dn"
                                    required
                                    data-testid={`${testidPrefix}-model`}
                                />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="mm-note" className="text-[11px]">Additional context (optional)</Label>
                            <Textarea
                                id="mm-note"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                                placeholder="Compatible cartridge codes, page yield, anything that helps us add it correctly."
                                data-testid={`${testidPrefix}-note`}
                            />
                        </div>
                        <DialogFooter className="gap-2 sm:gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid={`${testidPrefix}-cancel`}>Cancel</Button>
                            <Button
                                type="submit"
                                disabled={submitting}
                                className="bg-[#0A0A0B] text-white hover:bg-black/85 inline-flex items-center gap-2"
                                data-testid={`${testidPrefix}-submit`}
                            >
                                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send to admin
                            </Button>
                        </DialogFooter>
                        <p className="text-[10.5px] text-[#86868B] inline-flex items-center gap-1 -mt-1"><Mail size={11} /> Sent to support@tonerscart.com</p>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
