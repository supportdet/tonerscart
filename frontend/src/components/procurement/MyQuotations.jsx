import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Download, Loader2, Clock } from "lucide-react";
import { Button } from "../ui/button";
import procApi, { formatApiError } from "../../lib/procApi";
import { downloadQuotationPdf } from "./SearchCompare";

const STATUS_STYLES = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    expired: "bg-[#F4F4F6] text-[#86868B] border-[#E5E5EA]",
    converted: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function MyQuotations({ active }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await procApi.get("/procurement/quotations");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (active) load(); }, [active]);

    const download = async (q) => {
        setBusyId(q.id);
        try { await downloadQuotationPdf(q.id, q.ref_number); }
        catch (e) { toast.error(formatApiError(e)); }
        finally { setBusyId(null); }
    };

    if (loading) {
        return <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading quotations…</div>;
    }

    return (
        <div className="space-y-5" data-testid="proc-my-quotations">
            <h2 className="text-[20px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>My Quotations</h2>
            {rows.length === 0 ? (
                <div className="tc-card-flat p-10 text-center" data-testid="proc-quotations-empty">
                    <FileText className="mx-auto text-[#00B7C7] mb-3" size={28} />
                    <div className="text-[15px] font-semibold text-[#0A0A0B]">No quotations yet</div>
                    <p className="text-[13px] text-[#6E6E73] mt-1.5">Use Search &amp; Compare to generate a formal L1/L2/L3 quotation.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((q) => {
                        const expires = (q.expires_at || "").slice(0, 10);
                        const l1 = (q.items || [])[0];
                        return (
                            <div key={q.id} className="tc-card-flat p-4 flex flex-wrap items-center gap-4" data-testid={`proc-quotation-${q.ref_number}`}>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[13.5px] font-semibold text-[#0A0A0B]">{q.ref_number}</span>
                                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_STYLES[q.status] || STATUS_STYLES.active}`} data-testid={`proc-quotation-status-${q.ref_number}`}>{q.status}</span>
                                    </div>
                                    <div className="text-[13px] text-[#1D1D1F] mt-1">{q.product_label} · qty {q.qty}</div>
                                    <div className="text-[11.5px] text-[#86868B] mt-0.5 flex items-center gap-3">
                                        <span>{(q.items || []).length} supplier(s)</span>
                                        {l1 && <span>L1: {l1.supplier_name}</span>}
                                        <span className="inline-flex items-center gap-1"><Clock size={11} /> valid until {expires}</span>
                                    </div>
                                </div>
                                <Button onClick={() => download(q)} disabled={busyId === q.id} variant="outline" className="inline-flex items-center gap-1.5" data-testid={`proc-download-${q.ref_number}`}>
                                    {busyId === q.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
