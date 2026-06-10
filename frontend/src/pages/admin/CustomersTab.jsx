import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "../../components/ui/input";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

const typeBadge = (t) => {
    const corp = (t || "").toLowerCase() === "corporate" || (t || "").toLowerCase() === "business";
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${corp ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
            {corp ? "Corporate" : "Personal"}
        </span>
    );
};

export default function CustomersTab() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [activeId, setActiveId] = useState(null);

    useEffect(() => {
        setLoading(true);
        api.get("/admin/customers")
            .then(({ data }) => setRows(Array.isArray(data) ? data : []))
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    }, []);

    const visible = useMemo(() => {
        const f = filter.trim().toLowerCase();
        if (!f) return rows;
        return rows.filter((r) =>
            (r.name || "").toLowerCase().includes(f)
            || (r.email || "").toLowerCase().includes(f)
            || (r.phone || "").toLowerCase().includes(f)
            || (r.city || "").toLowerCase().includes(f)
        );
    }, [rows, filter]);

    return (
        <div data-testid="customers-tab">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div>
                    <h2 className="text-[20px] font-bold text-[#0A0A0B]">Customers</h2>
                    <p className="text-[12.5px] text-[#6E6E73]">{rows.length} registered {rows.length === 1 ? "buyer" : "buyers"}</p>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                    <Input className="pl-9" placeholder="Search name, email, city…" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="customers-search" />
                </div>
            </div>

            {loading ? (
                <div className="py-16 grid place-items-center text-[#86868B]"><Loader2 className="animate-spin" /></div>
            ) : visible.length === 0 ? (
                <div className="py-16 text-center text-[#86868B] text-[14px]">No customers found.</div>
            ) : (
                <div className="bg-white border border-black/[0.06] rounded-2xl overflow-x-auto" data-testid="customers-table">
                    <table className="w-full min-w-[640px] text-[13px]">
                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.16em] uppercase text-[#6E6E73]">
                            <tr>
                                <th className="text-left p-3">Name</th>
                                <th className="text-left p-3">Email</th>
                                <th className="text-left p-3">Phone</th>
                                <th className="text-left p-3">City</th>
                                <th className="text-left p-3">Type</th>
                                <th className="text-left p-3">Joined</th>
                                <th className="text-right p-3">Orders</th>
                                <th className="text-right p-3">Spend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((c) => (
                                <tr key={c.id} className="border-t border-black/[0.05] hover:bg-black/[0.02] cursor-pointer" data-testid={`customer-row-${c.id}`} onClick={() => setActiveId(c.id)}>
                                    <td className="p-3 font-semibold">{c.name || "—"}</td>
                                    <td className="p-3 text-[#3a3a40]">{c.email}</td>
                                    <td className="p-3">{c.phone || "—"}</td>
                                    <td className="p-3">{c.city || "—"}</td>
                                    <td className="p-3">{typeBadge(c.user_type)}</td>
                                    <td className="p-3 text-[11.5px] text-[#6E6E73]">{fmtDate(c.created_at)}</td>
                                    <td className="p-3 text-right">{c.order_count || 0}</td>
                                    <td className="p-3 text-right font-mono">{fmtMoney(c.total_spend)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CustomerDetailDrawer customerId={activeId} open={!!activeId} onClose={() => setActiveId(null)} />
        </div>
    );
}

function CustomerDetailDrawer({ customerId, open, onClose }) {
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!customerId) { setDetail(null); return; }
        setBusy(true);
        api.get(`/admin/customers/${customerId}`)
            .then(({ data }) => setDetail(data))
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setBusy(false));
    }, [customerId]);

    if (!open) return null;
    const c = detail?.customer || {};
    const orders = detail?.orders || [];
    const agreements = detail?.agreements || [];

    return (
        <div className="fixed inset-0 z-[2000]" data-testid="customer-detail-drawer">
            <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
            <div className="absolute right-0 top-0 h-full w-full max-w-[560px] bg-white shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-5 h-16 border-b border-black/[0.06]">
                    <div className="text-[16px] font-bold text-[#0A0A0B]">Customer profile</div>
                    <button onClick={onClose} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-black/[0.04]" data-testid="customer-drawer-close"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {busy && !detail ? (
                        <div className="py-16 grid place-items-center text-[#86868B]"><Loader2 className="animate-spin" /></div>
                    ) : (
                        <>
                            <section>
                                <div className="text-[18px] font-bold text-[#0A0A0B] flex items-center gap-2">{c.name || "—"} {typeBadge(c.user_type)}</div>
                                <div className="text-[13px] text-[#3a3a40] mt-1">{c.email}</div>
                                <div className="grid grid-cols-2 gap-3 mt-3 text-[13px]">
                                    <Field label="Phone" value={c.phone} />
                                    <Field label="City" value={c.city} />
                                    <Field label="Company" value={c.company} />
                                    <Field label="GST" value={c.gst_number} />
                                    <Field label="Joined" value={fmtDate(c.created_at)} />
                                </div>
                            </section>

                            <section className="grid grid-cols-2 gap-3">
                                <Stat label="Total orders" value={detail?.stats?.order_count || 0} />
                                <Stat label="Total spend" value={fmtMoney(detail?.stats?.total_spend)} />
                            </section>

                            <section>
                                <div className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73] mb-2">Order history</div>
                                {orders.length === 0 ? (
                                    <div className="text-[13px] text-[#86868B]">No orders yet.</div>
                                ) : (
                                    <div className="border border-black/[0.06] rounded-xl overflow-hidden">
                                        {orders.map((o) => (
                                            <div key={o.id} className="flex items-center justify-between px-3 py-2.5 border-b border-black/[0.04] last:border-0 text-[13px]">
                                                <div>
                                                    <div className="font-semibold text-[#0A0A0B]">{[o.brand, o.model_number].filter(Boolean).join(" ") || "Order"}</div>
                                                    <div className="text-[11.5px] text-[#86868B]">{fmtDate(o.created_at)} · {o.status || "—"}</div>
                                                </div>
                                                <div className="font-mono font-semibold">{fmtMoney(o.total)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section>
                                <div className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73] mb-2">Agreement acceptance</div>
                                {agreements.length === 0 ? (
                                    <div className="text-[13px] text-[#86868B]">No agreement records.</div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {agreements.map((a) => (
                                            <div key={a.id} className="text-[12.5px] text-[#3a3a40]">
                                                <span className="font-semibold">{a.agreement_type || "Agreement"}</span> {a.version ? `v${a.version}` : ""} — accepted {fmtDate(a.accepted_at)} {a.ip_address ? `(IP ${a.ip_address})` : ""}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const Field = ({ label, value }) => (
    <div>
        <div className="text-[10.5px] tracking-[0.14em] uppercase text-[#86868B]">{label}</div>
        <div className="text-[#0A0A0B] font-medium">{value || "—"}</div>
    </div>
);
const Stat = ({ label, value }) => (
    <div className="bg-black/[0.03] rounded-xl p-3">
        <div className="text-[10.5px] tracking-[0.14em] uppercase text-[#86868B]">{label}</div>
        <div className="text-[19px] font-bold text-[#0A0A0B] mt-0.5">{value}</div>
    </div>
);
