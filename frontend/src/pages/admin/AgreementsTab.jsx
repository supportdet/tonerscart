import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Loader2, FileCheck2 } from "lucide-react";

const TYPE_LABEL = { seller: "Seller", oem: "OEM", procurement: "Procurement", customer: "Customer" };

export default function AgreementsTab() {
    const [rows, setRows] = useState([]);
    const [versions, setVersions] = useState({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        api.get("/admin/agreements")
            .then((r) => { setRows(r.data.acceptances || []); setVersions(r.data.versions || {}); })
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className="py-16 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
    }

    const filtered = filter === "all" ? rows : rows.filter((r) => r.agreement_type === filter);
    const counts = rows.reduce((acc, r) => { acc[r.agreement_type] = (acc[r.agreement_type] || 0) + 1; return acc; }, {});

    return (
        <div data-testid="admin-agreements-tab">
            <div className="mb-5">
                <h2 className="text-[18px] font-semibold text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>Agreement acceptances</h2>
                <p className="text-[13px] text-[#6E6E73] mt-0.5">One-time, versioned acceptance recorded per user. Current versions: {Object.entries(versions).map(([k, v]) => `${TYPE_LABEL[k] || k} v${v}`).join(" · ")}</p>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                {["all", "seller", "oem", "procurement", "customer"].map((t) => (
                    <button key={t} onClick={() => setFilter(t)}
                        className={`px-3 h-8 rounded-full text-[12.5px] font-semibold border transition ${filter === t ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#3a3a40] border-[#E8E8EC] hover:border-[#C7C7CC]"}`}
                        data-testid={`agreements-filter-${t}`}>
                        {t === "all" ? `All (${rows.length})` : `${TYPE_LABEL[t]} (${counts[t] || 0})`}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="tc-card-flat p-10 text-center text-[13px] text-[#6E6E73]"><FileCheck2 size={20} className="mx-auto mb-2 text-[#C7C7CC]" /> No acceptances recorded yet.</div>
            ) : (
                <div className="tc-card-flat overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-left text-[#86868B] border-b border-[#EFEFF2]">
                                <th className="px-4 py-3 font-medium">User ID</th>
                                <th className="px-4 py-3 font-medium">Agreement</th>
                                <th className="px-4 py-3 font-medium">Version</th>
                                <th className="px-4 py-3 font-medium">Accepted at</th>
                                <th className="px-4 py-3 font-medium">IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <tr key={r.id} className="border-b border-[#F4F4F6]" data-testid={`agreement-row-${r.id}`}>
                                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-[#3a3a40]">{r.user_id?.slice(0, 12)}…</td>
                                    <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full bg-[#F4F4F6] text-[#0A0A0B] font-medium">{TYPE_LABEL[r.agreement_type] || r.agreement_type}</span></td>
                                    <td className="px-4 py-2.5">v{r.version}</td>
                                    <td className="px-4 py-2.5 text-[#3a3a40]">{r.accepted_at ? new Date(r.accepted_at).toLocaleString("en-IN") : "—"}</td>
                                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-[#86868B]">{r.ip_address || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
