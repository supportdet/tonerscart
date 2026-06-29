import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Loader2, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import api, { formatApiError } from "../../lib/api";

/**
 * Wave 100 — Admin "All Users" panel.
 *
 * Lists every public.users row (buyers + dealers + admins) with a per-row
 * Delete button. Delete is HIDDEN for approved-dealer rows so the existing
 * dealer base is auto-protected without a hardcoded email list. After
 * deletion the email is free to re-register.
 */
function fmtDate(s) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return s; }
}

function typeBadge(u) {
    const k = (u.role === "admin" ? "admin" : u.supplier_status === "approved" ? "dealer" : u.role === "supplier" ? (u.supplier_status === "pending" ? "dealer-pending" : "dealer") : (u.user_type === "corporate" ? "corporate" : "buyer"));
    const styles = {
        admin:           "bg-purple-50 text-purple-700 border-purple-200",
        dealer:          "bg-emerald-50 text-emerald-700 border-emerald-200",
        "dealer-pending": "bg-amber-50 text-amber-700 border-amber-200",
        corporate:       "bg-blue-50 text-blue-700 border-blue-200",
        buyer:           "bg-[#F4F4F6] text-[#0A0A0B] border-[#E5E5EA]",
    };
    return <span className={`tc-badge ${styles[k] || styles.buyer}`}>{k.replace("-", " · ")}</span>;
}

export default function UsersTab() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [confirm, setConfirm] = useState(null); // user row
    const [deleting, setDeleting] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/users");
            setUsers(data.users || []);
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setLoading(false);
        }
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

    const doDelete = async () => {
        if (!confirm) return;
        try {
            setDeleting(true);
            await api.delete(`/admin/users/${confirm.id}`);
            toast.success(`Deleted ${confirm.email}. Email is now free to re-register.`);
            setConfirm(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div data-testid="admin-users-tab">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[#6E6E73]">All users</div>
                <div className="relative flex-1 min-w-[220px] max-w-[420px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                    <Input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Search email / name / phone / city…"
                        className="pl-9 h-9"
                        data-testid="admin-users-search"
                    />
                </div>
                <div className="text-[12px] text-[#6E6E73]" data-testid="admin-users-count">
                    {visible.length} of {users.length}
                </div>
                <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : "Reload"}
                </Button>
            </div>

            {loading ? (
                <div className="py-12 text-center text-[#6E6E73] text-[13px]"><Loader2 size={16} className="animate-spin inline mr-2" /> Loading users…</div>
            ) : (
                <div className="border border-black/[0.06] rounded-xl overflow-x-auto bg-white">
                    <table className="w-full min-w-[820px] text-[12.5px]">
                        <thead className="bg-black/[0.03] text-[10px] tracking-[0.14em] uppercase text-[#6E6E73]">
                            <tr>
                                <th className="text-left p-3">Email</th>
                                <th className="text-left p-3">Name</th>
                                <th className="text-left p-3">Type</th>
                                <th className="text-left p-3">Phone</th>
                                <th className="text-left p-3">City</th>
                                <th className="text-left p-3">Joined</th>
                                <th className="text-right p-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((u) => (
                                <tr key={u.id} className="border-t border-black/[0.04]" data-testid={`admin-users-row-${u.id}`}>
                                    <td className="p-3 font-mono text-[11.5px]">{u.email}</td>
                                    <td className="p-3 font-medium">{u.name || "—"}</td>
                                    <td className="p-3">{typeBadge(u)}</td>
                                    <td className="p-3">{u.phone || "—"}</td>
                                    <td className="p-3">{u.city || "—"}</td>
                                    <td className="p-3 text-[#6E6E73]">{fmtDate(u.created_at)}</td>
                                    <td className="p-3 text-right">
                                        {u.is_protected ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700" title="Approved dealer — protected"><ShieldCheck size={11} /> Protected</span>
                                        ) : (
                                            <button
                                                onClick={() => setConfirm(u)}
                                                className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-[12px] font-semibold"
                                                data-testid={`admin-users-delete-${u.id}`}
                                            >
                                                <Trash2 size={12} /> Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {visible.length === 0 && (
                                <tr><td colSpan={7} className="p-6 text-center text-[#6E6E73] text-[12.5px]">No users matching that filter.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <Dialog open={!!confirm} onOpenChange={(v) => !v && !deleting && setConfirm(null)}>
                <DialogContent className="max-w-[480px] p-6 rounded-[18px]" data-testid="admin-users-confirm-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-[18px] flex items-center gap-2 text-red-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                            <AlertTriangle size={18} /> Delete user account?
                        </DialogTitle>
                    </DialogHeader>
                    {confirm && (
                        <div className="mt-2 space-y-3 text-[13px] text-[#0A0A0B]">
                            <div className="font-mono text-[12.5px] bg-[#F4F4F6] rounded px-2 py-1.5 inline-block">{confirm.email}</div>
                            <p>This permanently removes the user from <strong>Supabase Auth</strong> and from <strong>users / suppliers_pending</strong>. The email becomes free to re-register.</p>
                            <p className="text-[12px] text-[#6E6E73]">This cannot be undone.</p>
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
