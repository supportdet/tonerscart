import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Loader2, Trash2, ShieldCheck, AlertTriangle, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import api, { formatApiError } from "../../lib/api";

function fmtDate(s) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return s; }
}

function typeLabel(u) {
    if (u.role === "admin") return { k: "admin", label: "Admin" };
    if (u.supplier_status === "approved") return { k: "dealer", label: "Dealer" };
    if (u.role === "supplier" || u.supplier_status === "pending") return { k: "dealer-pending", label: "Dealer · pending" };
    if (u.user_type === "corporate") return { k: "corporate", label: "Corporate" };
    return { k: "buyer", label: "Buyer" };
}

const TYPE_STYLES = {
    admin:           "bg-purple-50 text-purple-700 border-purple-200",
    dealer:          "bg-emerald-50 text-emerald-700 border-emerald-200",
    "dealer-pending": "bg-amber-50 text-amber-700 border-amber-200",
    corporate:       "bg-blue-50 text-blue-700 border-blue-200",
    buyer:           "bg-[#F4F4F6] text-[#0A0A0B] border-[#E5E5EA]",
};

export default function UsersTab() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [confirm, setConfirm] = useState(null);  // {kind:'single'|'bulk', users:[...]}
    const [deleting, setDeleting] = useState(false);
    const [selected, setSelected] = useState(new Set());

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/users");
            setUsers(data.users || []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const visible = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) =>
            (u.email || "").toLowerCase().includes(q) ||
            (u.name || "").toLowerCase().includes(q) ||
            (u.phone || "").toLowerCase().includes(q) ||
            (u.city || "").toLowerCase().includes(q),
        );
    }, [users, filter]);

    // Wave 101 hotfix-5 — admin can delete ANY account (including approved
    // dealers). The Protected badge / disabled checkbox were removed —
    // confirmation dialog with a stronger warning is the only safety net.
    const selectableVisible = visible;
    const allChecked = selectableVisible.length > 0 && selectableVisible.every((u) => selected.has(u.id));
    const someChecked = selectableVisible.some((u) => selected.has(u.id)) && !allChecked;

    const toggleAll = () => {
        const next = new Set(selected);
        if (allChecked) {
            selectableVisible.forEach((u) => next.delete(u.id));
        } else {
            selectableVisible.forEach((u) => next.add(u.id));
        }
        setSelected(next);
    };
    const toggleOne = (u) => {
        const next = new Set(selected);
        if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
        setSelected(next);
    };

    const doDelete = async () => {
        if (!confirm) return;
        try {
            setDeleting(true);
            if (confirm.kind === "bulk") {
                const ids = confirm.users.map((u) => u.id);
                const { data } = await api.post("/admin/users/bulk-delete", { user_ids: ids });
                toast.success(`Deleted ${data.deleted}${data.protected ? ` · ${data.protected} protected` : ""}${data.failed ? ` · ${data.failed} failed` : ""}.`);
                setSelected(new Set());
            } else {
                await api.delete(`/admin/users/${confirm.users[0].id}`);
                toast.success(`Deleted ${confirm.users[0].email}. Email is free to re-register.`);
            }
            setConfirm(null);
            load();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setDeleting(false); }
    };

    const selectedRows = useMemo(() => visible.filter((u) => selected.has(u.id)), [visible, selected]);

    return (
        <div data-testid="admin-users-tab">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">All users</div>
                <div className="relative flex-1 min-w-[220px] max-w-[420px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                    <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search email / name / phone / city…" className="pl-9 h-9" data-testid="admin-users-search" />
                </div>
                <div className="text-[12px] text-[#6E6E73]" data-testid="admin-users-count">
                    {visible.length} of {users.length}
                </div>
                <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : "Reload"}
                </Button>
            </div>

            {selected.size > 0 && (
                <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200" data-testid="admin-users-bulk-bar">
                    <div className="text-[13px] font-semibold text-red-800">{selected.size} selected</div>
                    <button onClick={() => setSelected(new Set())} className="text-[11.5px] text-red-700 hover:underline">Clear</button>
                    <div className="flex-1" />
                    <Button onClick={() => setConfirm({ kind: "bulk", users: selectedRows })} className="bg-red-600 hover:bg-red-700 text-white h-9 text-[12.5px] inline-flex items-center gap-1.5" data-testid="admin-users-bulk-delete-btn">
                        <Trash2 size={13} /> Delete selected ({selected.size})
                    </Button>
                </div>
            )}

            {loading ? (
                <div className="py-12 text-center text-[#6E6E73] text-[13px]"><Loader2 size={16} className="animate-spin inline mr-2" /> Loading users…</div>
            ) : (
                <div className="border border-black/[0.06] rounded-xl overflow-x-auto bg-white">
                    <table className="w-full min-w-[920px] text-[12.5px]">
                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.14em] uppercase text-[#6E6E73]">
                            <tr>
                                <th className="text-left p-3 w-10">
                                    <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked; }} onChange={toggleAll} data-testid="admin-users-select-all" disabled={selectableVisible.length === 0} />
                                </th>
                                <th className="text-left p-3">Email</th>
                                <th className="text-left p-3">Name</th>
                                <th className="text-left p-3">Phone</th>
                                <th className="text-left p-3">Auth</th>
                                <th className="text-left p-3">Type</th>
                                <th className="text-left p-3">Joined</th>
                                <th className="text-left p-3">Last login</th>
                                <th className="text-right p-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((u) => {
                                const t = typeLabel(u);
                                const isGoogle = u.auth_method === "google";
                                return (
                                    <tr key={u.id} className="border-t border-black/[0.04]" data-testid={`admin-users-row-${u.id}`}>
                                        <td className="p-3">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(u.id)}
                                                onChange={() => toggleOne(u)}
                                                data-testid={`admin-users-check-${u.id}`}
                                            />
                                        </td>
                                        <td className="p-3 font-mono text-[11.5px] break-all">{u.email}</td>
                                        <td className="p-3 font-medium">{u.name || "—"}</td>
                                        <td className="p-3">{u.phone || "—"}</td>
                                        <td className="p-3">
                                            <span className={`tc-badge ${isGoogle ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-[#F4F4F6] text-[#0A0A0B] border-[#E5E5EA]"}`} data-testid={`admin-users-auth-${u.id}`}>
                                                {isGoogle ? "Google" : "Email"}
                                            </span>
                                        </td>
                                        <td className="p-3"><span className={`tc-badge ${TYPE_STYLES[t.k] || TYPE_STYLES.buyer}`}>{t.label}</span></td>
                                        <td className="p-3 text-[#6E6E73]">{fmtDate(u.created_at)}</td>
                                        <td className="p-3 text-[#6E6E73]">{fmtDate(u.last_sign_in_at)}</td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => setConfirm({ kind: "single", users: [u] })} className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-[12px] font-semibold" data-testid={`admin-users-delete-${u.id}`}>
                                                <Trash2 size={12} /> Delete
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {visible.length === 0 && (
                                <tr><td colSpan={9} className="p-6 text-center text-[#6E6E73] text-[12.5px]">No users matching that filter.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <Dialog open={!!confirm} onOpenChange={(v) => !v && !deleting && setConfirm(null)}>
                <DialogContent className="max-w-[520px] p-6 rounded-[18px]" data-testid="admin-users-confirm-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-[18px] flex items-center gap-2 text-red-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                            <AlertTriangle size={18} /> {confirm?.kind === "bulk" ? `Delete ${confirm.users.length} accounts?` : "Delete user account?"}
                        </DialogTitle>
                    </DialogHeader>
                    {confirm && (
                        <div className="mt-2 space-y-3 text-[13px] text-[#0A0A0B] max-h-[260px] overflow-y-auto">
                            {(() => {
                                const approvedInBatch = confirm.users.filter((u) => u.supplier_status === "approved");
                                if (approvedInBatch.length > 0) {
                                    return (
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-800" data-testid="admin-users-approved-warning">
                                            <strong>⚠️ {approvedInBatch.length} approved dealer{approvedInBatch.length > 1 ? "s" : ""} in this batch.</strong> Deleting these removes their live storefront, listings, and order history. This cannot be undone.
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                            {confirm.users.slice(0, 20).map((u) => (
                                <div key={u.id} className="flex items-center gap-2">
                                    <Mail size={12} className="text-[#86868B]" />
                                    <span className="font-mono text-[11.5px]">{u.email}</span>
                                    {u.supplier_status === "approved" && <span className="ml-auto text-[10.5px] uppercase tracking-wide text-red-700 font-semibold">Approved dealer</span>}
                                </div>
                            ))}
                            {confirm.users.length > 20 && <div className="text-[12px] text-[#86868B]">…and {confirm.users.length - 20} more.</div>}
                            <p className="text-[12px] text-[#6E6E73] pt-2 border-t border-black/[0.05]">Removes the user from <strong>Supabase Auth</strong> + related tables. Emails become free to re-register. <em>Cannot be undone.</em></p>
                        </div>
                    )}
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setConfirm(null)} disabled={deleting}>Cancel</Button>
                        <Button onClick={doDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white" data-testid="admin-users-confirm-delete">
                            {deleting ? <><Loader2 size={14} className="animate-spin mr-1" /> Deleting…</> : <><Trash2 size={14} className="mr-1" /> Yes, delete</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
