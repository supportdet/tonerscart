import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Loader2, Mail, MailOpen, Reply, X, Inbox } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

const fmtDate = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function MessagesTab() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("all"); // all | unread
    const [replyTo, setReplyTo] = useState(null);

    const load = () => {
        setLoading(true);
        api.get("/admin/messages", { params: { limit: 400 } })
            .then(({ data }) => setRows(data?.rows || []))
            .catch((e) => toast.error(formatApiError(e)))
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); }, []);

    const unreadCount = useMemo(() => rows.filter((r) => !r.is_read).length, [rows]);
    const visible = useMemo(() => (tab === "unread" ? rows.filter((r) => !r.is_read) : rows), [rows, tab]);

    const toggleRead = async (m) => {
        try {
            await api.put(`/admin/messages/${m.id}/read`, { is_read: !m.is_read });
            setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, is_read: !m.is_read } : r)));
        } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div data-testid="messages-tab">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div>
                    <h2 className="text-[20px] font-bold text-[#0A0A0B]">Messages</h2>
                    <p className="text-[12.5px] text-[#6E6E73]">{rows.length} contact submissions · {unreadCount} unread</p>
                </div>
                <div className="inline-flex rounded-lg border border-[#E5E5E7] overflow-hidden">
                    {["all", "unread"].map((t) => (
                        <button key={t} onClick={() => setTab(t)} className={`px-3.5 h-9 text-[13px] font-semibold capitalize ${tab === t ? "bg-[#0A0A0B] text-white" : "bg-white text-[#3a3a40] hover:bg-black/[0.03]"}`} data-testid={`messages-filter-${t}`}>
                            {t}{t === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="py-16 grid place-items-center text-[#86868B]"><Loader2 className="animate-spin" /></div>
            ) : visible.length === 0 ? (
                <div className="py-16 text-center text-[#86868B] text-[14px]" data-testid="messages-empty">
                    <Inbox size={28} className="mx-auto mb-3 opacity-40" />
                    No messages{tab === "unread" ? " unread" : ""}.
                </div>
            ) : (
                <div className="space-y-2.5">
                    {visible.map((m) => (
                        <div key={m.id} className={`bg-white border rounded-2xl p-4 ${m.is_read ? "border-black/[0.06]" : "border-[#00B7C7]/40 bg-[#00B7C7]/[0.03]"}`} data-testid={`message-card-${m.id}`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <div className="font-bold text-[#0A0A0B] flex items-center gap-2">
                                        {!m.is_read && <span className="w-2 h-2 rounded-full bg-[#00B7C7] shrink-0" data-testid={`message-unread-dot-${m.id}`} />}
                                        {m.name || "Anonymous"}
                                        {m.company ? <span className="text-[12px] font-medium text-[#6E6E73]">· {m.company}</span> : null}
                                    </div>
                                    <div className="text-[12.5px] text-[#3a3a40] mt-0.5">{m.email || "—"}{m.phone ? ` · ${m.phone}` : ""}</div>
                                    <div className="text-[11px] text-[#86868B] mt-0.5">{fmtDate(m.created_at)}{m.msg_type ? ` · ${m.msg_type}` : ""}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggleRead(m)} className="text-[12px] font-semibold text-[#6E6E73] hover:text-[#0A0A0B] inline-flex items-center gap-1" data-testid={`message-toggle-read-${m.id}`}>
                                        {m.is_read ? <><Mail size={14} /> Mark unread</> : <><MailOpen size={14} /> Mark read</>}
                                    </button>
                                    {m.email && (
                                        <Button size="sm" className="bg-[#00838f] hover:bg-[#006d77] text-white" onClick={() => setReplyTo(m)} data-testid={`message-reply-btn-${m.id}`}>
                                            <Reply size={13} className="mr-1" /> Reply
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <p className="text-[13.5px] text-[#1d1d1f] leading-relaxed mt-3 whitespace-pre-wrap">{m.description || "(no message)"}</p>
                        </div>
                    ))}
                </div>
            )}

            <ReplyDialog message={replyTo} onClose={() => setReplyTo(null)} onSent={load} />
        </div>
    );
}

function ReplyDialog({ message, onClose, onSent }) {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (message) {
            setSubject(`Re: your message to TonersCart`);
            setBody(`Hi ${message.name || "there"},\n\n`);
        }
    }, [message]);

    if (!message) return null;

    const send = async () => {
        if (!subject.trim() || !body.trim()) { toast.error("Subject and message are required"); return; }
        setBusy(true);
        try {
            const { data } = await api.post(`/admin/messages/${message.id}/reply`, { subject, message: body });
            if (data?.sent) toast.success(`Reply sent to ${message.email}`);
            else toast.warning("Reply recorded, but email delivery could not be confirmed (check Resend key).");
            onSent?.();
            onClose();
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-[2000]" data-testid="message-reply-dialog">
            <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-[520px] bg-white rounded-2xl shadow-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-[16px] font-bold text-[#0A0A0B]">Reply to {message.name || message.email}</div>
                    <button onClick={onClose} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-black/[0.04]" data-testid="reply-close"><X size={18} /></button>
                </div>
                <div className="text-[12px] text-[#6E6E73] mb-3">To: <span className="font-medium text-[#0A0A0B]">{message.email}</span></div>
                <div className="space-y-3">
                    <div>
                        <label className="text-[11px] tracking-[0.14em] uppercase text-[#86868B]">Subject</label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="reply-subject" />
                    </div>
                    <div>
                        <label className="text-[11px] tracking-[0.14em] uppercase text-[#86868B]">Message</label>
                        <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} data-testid="reply-body" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={onClose} disabled={busy} data-testid="reply-cancel">Cancel</Button>
                    <Button className="bg-[#00838f] hover:bg-[#006d77] text-white" onClick={send} disabled={busy} data-testid="reply-send">
                        {busy ? <><Loader2 size={13} className="animate-spin mr-1.5" /> Sending…</> : <>Send reply</>}
                    </Button>
                </div>
            </div>
        </div>
    );
}
