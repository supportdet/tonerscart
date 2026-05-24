import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Loader2, IndianRupee, ShoppingBag, Users, Building2, Package, TrendingUp } from "lucide-react";
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const fmtMoney = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtInt = (n) => (Number(n) || 0).toLocaleString("en-IN");

function StatCard({ icon: Icon, label, value, sub, accent = "ink", testId }) {
    const tones = {
        ink:    { bar: "bg-[#0A0A0B]",   iconBg: "bg-[#0A0A0B]" },
        cyan:   { bar: "bg-[#00B7C7]",   iconBg: "bg-[#00B7C7]" },
        yellow: { bar: "bg-[#F5C400]",   iconBg: "bg-[#F5C400]" },
        pink:   { bar: "bg-[#E6007E]",   iconBg: "bg-[#E6007E]" },
    };
    const t = tones[accent] || tones.ink;
    return (
        <div className="relative bg-white border border-black/[0.06] rounded-2xl p-4 sm:p-5 overflow-hidden" data-testid={testId}>
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.bar}`} />
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73]">{label}</div>
                    <div className="mt-1.5 text-[24px] font-bold tracking-tight text-[#0A0A0B]" style={{ fontFamily: "'Montserrat', sans-serif" }}>{value}</div>
                    {sub && <div className="mt-1 text-[11.5px] text-[#6E6E73]">{sub}</div>}
                </div>
                <div className={`shrink-0 w-9 h-9 rounded-lg ${t.iconBg} text-white grid place-items-center`}>
                    <Icon size={16} />
                </div>
            </div>
        </div>
    );
}

const PIE_COLORS = ["#0A0A0B", "#00B7C7", "#F5C400", "#E6007E", "#10B981", "#6366F1", "#F97316", "#A855F7"];

export default function AnalyticsTab() {
    const [d, setD] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/admin/analytics");
                setD(data);
            } catch (e) {
                toast.error(formatApiError(e));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="py-20 text-center text-[#6E6E73] flex flex-col items-center gap-3" data-testid="analytics-loading">
                <Loader2 size={20} className="animate-spin" /> Loading live analytics…
            </div>
        );
    }
    if (!d) return null;
    const s = d.stats || {};

    return (
        <div className="space-y-6" data-testid="analytics-tab">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard icon={IndianRupee} label="Total GMV"        value={fmtMoney(s.total_gmv)}        accent="ink"    testId="stat-gmv" />
                <StatCard icon={TrendingUp}  label="Commission earned" value={fmtMoney(s.total_commission)} accent="yellow" sub="Across all orders" testId="stat-commission" />
                <StatCard icon={ShoppingBag} label="Total orders"      value={fmtInt(s.total_orders)}       accent="cyan"   sub={`${s.orders_week} this week · ${s.orders_month} this month`} testId="stat-orders" />
                <StatCard icon={Package}     label="Active listings"   value={fmtInt(s.active_listings)}    accent="pink"   sub="Toners + printers" testId="stat-listings" />
                <StatCard icon={Building2}   label="Approved dealers"  value={fmtInt(s.total_dealers)}      accent="ink"    sub={`${s.new_dealers_week} new this week`} testId="stat-dealers" />
                <StatCard icon={Users}       label="Buyers"            value={fmtInt(s.total_buyers)}       accent="cyan"   sub={`${s.new_buyers_week} new this week`} testId="stat-buyers" />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="Orders / day (last 30 days)" testId="chart-orders-daily">
                    <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={d.orders_per_day} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid stroke="#F4F4F6" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#86868B" }} tickFormatter={(d) => d.slice(5)} />
                            <YAxis tick={{ fontSize: 10, fill: "#86868B" }} allowDecimals={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="count" stroke="#00B7C7" strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Commission revenue / day (last 30 days)" testId="chart-commission-daily">
                    <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={d.commission_per_day} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="#F4F4F6" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#86868B" }} tickFormatter={(d) => d.slice(5)} />
                            <YAxis tick={{ fontSize: 10, fill: "#86868B" }} />
                            <Tooltip formatter={(v) => fmtMoney(v)} />
                            <Line type="monotone" dataKey="amount" stroke="#F5C400" strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="Top 5 toner models (by orders)" testId="chart-top-models">
                    {d.top_models.length === 0 ? <Empty /> : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={d.top_models} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                                <CartesianGrid stroke="#F4F4F6" strokeDasharray="3 3" />
                                <XAxis type="number" tick={{ fontSize: 10, fill: "#86868B" }} allowDecimals={false} />
                                <YAxis type="category" dataKey="model" tick={{ fontSize: 11, fill: "#0A0A0B" }} width={140} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#00B7C7" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
                <ChartCard title="Top 5 dealers (by GMV)" testId="chart-top-dealers">
                    {d.top_dealers.length === 0 ? <Empty /> : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={d.top_dealers} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                                <CartesianGrid stroke="#F4F4F6" strokeDasharray="3 3" />
                                <XAxis type="number" tick={{ fontSize: 10, fill: "#86868B" }} tickFormatter={(v) => `₹${v}`} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#0A0A0B" }} width={140} />
                                <Tooltip formatter={(v) => fmtMoney(v)} />
                                <Bar dataKey="gmv" fill="#F5C400" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            <ChartCard title="Orders by city" testId="chart-orders-by-city">
                {d.orders_by_city.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie data={d.orders_by_city} dataKey="count" nameKey="city" innerRadius={60} outerRadius={100} paddingAngle={2}>
                                {d.orders_by_city.map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>
        </div>
    );
}

function ChartCard({ title, children, testId }) {
    return (
        <div className="bg-white border border-black/[0.06] rounded-2xl p-4 sm:p-5" data-testid={testId}>
            <div className="text-[12px] tracking-[0.16em] uppercase font-semibold text-[#6E6E73] mb-3">{title}</div>
            {children}
        </div>
    );
}

function Empty() {
    return <div className="py-12 text-center text-[12.5px] text-[#86868B]">No data yet</div>;
}
