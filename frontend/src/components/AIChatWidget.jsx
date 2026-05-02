import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import api from "../lib/api";

const HELLO = {
    role: "assistant",
    content: "Hi! I'm TonerBot. Tell me your printer model (e.g., HP LaserJet P1108) and I'll find the right toner. Or ask me about Original vs Compatible vs Refilled.",
};

export default function AIChatWidget() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([HELLO]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, open]);

    const send = async (e) => {
        e?.preventDefault?.();
        const text = input.trim();
        if (!text || loading) return;
        const next = [...messages, { role: "user", content: text }];
        setMessages(next);
        setInput("");
        setLoading(true);
        try {
            const r = await api.post("/chat", { messages: next.map(({ role, content }) => ({ role, content })), session_id: sessionId });
            setSessionId(r.data.session_id);
            setMessages((m) => [...m, { role: "assistant", content: r.data.reply }]);
        } catch (err) {
            setMessages((m) => [...m, { role: "assistant", content: "Sorry — I had trouble responding. Please try again." }]);
        } finally {
            setLoading(false);
        }
    };

    const SUGGESTIONS = [
        "Best toner for HP LaserJet P1108?",
        "Original vs Compatible — should I pick?",
        "Bulk toner for Canon MF3010 office",
    ];

    return (
        <>
            {/* Floating launcher */}
            <button
                onClick={() => setOpen((o) => !o)}
                className="tc-chat-launcher"
                aria-label="Open AI assistant"
                data-testid="chat-launcher-btn"
            >
                {open ? <X size={20} /> : <MessageCircle size={20} />}
                {!open && <span className="tc-chat-pulse" />}
            </button>

            {/* Panel */}
            <div className={`tc-chat-panel ${open ? "open" : ""}`} data-testid="chat-panel" role="dialog">
                <div className="tc-chat-header">
                    <div className="flex items-center gap-2.5">
                        <div className="relative w-8 h-8 rounded-full bg-[#0A0A0B] grid place-items-center">
                            <Sparkles size={14} className="text-[#F5C400]" />
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#00B7C7] border-2 border-white" />
                        </div>
                        <div className="leading-tight">
                            <div className="font-semibold text-[14px] text-[#0A0A0B]">TonerBot</div>
                            <div className="text-[11px] text-[#6E6E73]">Powered by Claude · always free</div>
                        </div>
                    </div>
                    <button onClick={() => setOpen(false)} className="text-[#6E6E73] hover:text-[#0A0A0B] p-1" data-testid="chat-close-btn">
                        <X size={16} />
                    </button>
                </div>

                <div ref={scrollRef} className="tc-chat-body">
                    {messages.map((m, i) => (
                        <div key={i} className={`tc-chat-msg ${m.role === "user" ? "u" : "a"}`} data-testid={`chat-msg-${i}`}>
                            <div className="tc-chat-bubble">{m.content}</div>
                        </div>
                    ))}
                    {loading && (
                        <div className="tc-chat-msg a">
                            <div className="tc-chat-bubble tc-chat-typing">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}
                    {messages.length === 1 && !loading && (
                        <div className="space-y-1.5 pt-2">
                            {SUGGESTIONS.map((s) => (
                                <button key={s} onClick={() => setInput(s)} className="tc-chat-suggest" data-testid="chat-suggest">
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <form onSubmit={send} className="tc-chat-input-row">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about your printer or toner…"
                        className="tc-chat-input"
                        data-testid="chat-input"
                    />
                    <button type="submit" disabled={!input.trim() || loading} className="tc-chat-send" data-testid="chat-send-btn">
                        <Send size={15} />
                    </button>
                </form>
            </div>
        </>
    );
}
