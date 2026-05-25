import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, Star } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

export default function ContentTab() {
    return (
        <div className="space-y-6" data-testid="content-tab">
            <PopularChipsEditor />
            <MarqueeBrandsEditor />
            <FeaturedSuppliersManager />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Popular chips (4 default, but user can change labels / queries)     */
/* ------------------------------------------------------------------ */
function PopularChipsEditor() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/config/popular_chips");
                setItems(Array.isArray(data?.value) ? data.value : []);
            } catch (e) { toast.error(formatApiError(e)); }
            finally { setLoading(false); }
        })();
    }, []);

    const upd = (i, k, v) => setItems(items.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

    const save = async () => {
        const cleaned = items
            .map((x) => ({ label: (x.label || "").trim(), query: (x.query || "").trim() }))
            .filter((x) => x.label && x.query);
        if (cleaned.length === 0) { toast.error("Add at least one chip"); return; }
        setSaving(true);
        try {
            await api.post("/admin/config/popular_chips", { value: cleaned });
            toast.success("Popular chips saved");
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    return (
        <Card title="Popular chips" subtitle="Shown under the hero search bar on the landing page.">
            {loading ? <Loader /> : (
                <div className="space-y-2">
                    {items.map((it, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                            <Input className="col-span-5" value={it.label} onChange={(e) => upd(i, "label", e.target.value)} placeholder="Label (e.g. HP 88A)" data-testid={`chip-label-${i}`} />
                            <Input className="col-span-6" value={it.query} onChange={(e) => upd(i, "query", e.target.value)} placeholder="Search query" data-testid={`chip-query-${i}`} />
                            <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="col-span-1 text-red-600 hover:bg-red-50 rounded p-1" aria-label="Remove" data-testid={`chip-remove-${i}`}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2">
                        <Button size="sm" variant="outline" onClick={() => setItems([...items, { label: "", query: "" }])} className="inline-flex items-center gap-1.5" data-testid="chip-add">
                            <Plus size={13} /> Add chip
                        </Button>
                        <Button size="sm" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 btn-cta" data-testid="chip-save">
                            <Save size={13} /> {saving ? "Saving…" : "Save chips"}
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Marquee brands (name + color)                                       */
/* ------------------------------------------------------------------ */
function MarqueeBrandsEditor() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/config/marquee_brands");
                setItems(Array.isArray(data?.value) ? data.value : []);
            } catch (e) { toast.error(formatApiError(e)); }
            finally { setLoading(false); }
        })();
    }, []);

    const upd = (i, k, v) => setItems(items.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

    const save = async () => {
        const cleaned = items
            .map((x) => ({ name: (x.name || "").trim(), color: (x.color || "#000000").trim() }))
            .filter((x) => x.name);
        if (cleaned.length === 0) { toast.error("Add at least one brand"); return; }
        setSaving(true);
        try {
            await api.post("/admin/config/marquee_brands", { value: cleaned });
            toast.success("Marquee brands saved");
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    return (
        <Card title="Marquee brands" subtitle="Scrolling brand strip below the hero.">
            {loading ? <Loader /> : (
                <div className="space-y-2">
                    {items.map((it, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                            <Input className="col-span-7" value={it.name} onChange={(e) => upd(i, "name", e.target.value)} placeholder="Brand (e.g. HP)" data-testid={`brand-name-${i}`} />
                            <div className="col-span-4 flex items-center gap-2">
                                <input
                                    type="color"
                                    value={it.color || "#000000"}
                                    onChange={(e) => upd(i, "color", e.target.value)}
                                    className="h-9 w-12 rounded border border-[#D2D2D7] bg-white cursor-pointer"
                                    data-testid={`brand-color-${i}`}
                                />
                                <Input value={it.color || "#000000"} onChange={(e) => upd(i, "color", e.target.value)} className="font-mono text-[12px]" />
                            </div>
                            <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="col-span-1 text-red-600 hover:bg-red-50 rounded p-1" aria-label="Remove" data-testid={`brand-remove-${i}`}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2">
                        <Button size="sm" variant="outline" onClick={() => setItems([...items, { name: "", color: "#000000" }])} className="inline-flex items-center gap-1.5" data-testid="brand-add">
                            <Plus size={13} /> Add brand
                        </Button>
                        <Button size="sm" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 btn-cta" data-testid="brand-save">
                            <Save size={13} /> {saving ? "Saving…" : "Save brands"}
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Featured suppliers — toggle is_featured on approved dealers         */
/* ------------------------------------------------------------------ */
function FeaturedSuppliersManager() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/suppliers");
            setItems(Array.isArray(data) ? data : []);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const toggle = async (s) => {
        try {
            await api.put(`/admin/suppliers/${s.id}/featured`, { is_featured: !s.is_featured });
            toast.success(s.is_featured ? "Removed from featured" : "Added to featured");
            load();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <Card title="Featured suppliers" subtitle="These cards appear on the landing page's Featured section.">
            {loading ? <Loader /> : items.length === 0 ? (
                <div className="text-[12.5px] text-[#86868B]">No approved suppliers yet.</div>
            ) : (
                <div className="space-y-1.5">
                    {items.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white border border-black/[0.05]" data-testid={`featured-toggle-row-${s.id}`}>
                            <div>
                                <div className="font-semibold text-[13px]">{s.business_name}</div>
                                <div className="text-[11.5px] text-[#86868B]">{s.city || "—"}</div>
                            </div>
                            <button
                                onClick={() => toggle(s)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-semibold border ${s.is_featured ? "bg-[#FFFBEB] text-[#8C6A00] border-[#F5C400]" : "bg-white text-[#6E6E73] border-[#D2D2D7] hover:border-[#F5C400]"}`}
                                data-testid={`content-feature-${s.id}`}
                            >
                                <Star size={11} className={s.is_featured ? "fill-[#F5C400] text-[#F5C400]" : ""} />
                                {s.is_featured ? "Featured" : "Make featured"}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

const Loader = () => (
    <div className="py-6 text-center text-[#6E6E73] flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
);
const Card = ({ title, subtitle, children }) => (
    <div className="bg-white border border-black/[0.06] rounded-2xl p-4 sm:p-5">
        <div className="flex items-baseline justify-between mb-3 gap-3">
            <div>
                <div className="text-[14px] font-semibold text-[#0A0A0B]">{title}</div>
                {subtitle && <div className="text-[11.5px] text-[#86868B]">{subtitle}</div>}
            </div>
        </div>
        {children}
    </div>
);
