"use client";

import React, { useEffect, useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { PageSkeleton } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/helpers";
import { loadWorkshopData } from "@/lib/workshop-data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function filterBills(bills, period, customRange) {
  const today = new Date();
  return bills.filter((b) => {
    const d = new Date(b.created_at);
    if (period === "daily")   return toDateKey(d) === toDateKey(today);
    if (period === "monthly") return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    if (period === "yearly")  return d.getFullYear() === today.getFullYear();
    if (period === "custom") {
      const start = customRange.start ? new Date(customRange.start) : null;
      const end   = customRange.end   ? new Date(customRange.end)   : null;
      const nd    = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (start && nd < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
      if (end   && nd > new Date(end.getFullYear(),   end.getMonth(),   end.getDate()))   return false;
      return true;
    }
    return true; // "all"
  });
}

function calcStats(bills) {
  let collected = 0, pending = 0, invoiced = 0;
  let paidCount = 0, pendingCount = 0, partialCount = 0, cancelledCount = 0;
  bills.forEach((b) => {
    const total = Number(b.total_amount || 0);
    const paid  = Number(b.paid_amount  || 0);
    invoiced += total;
    if      (b.status === "paid")           { collected += total;       paidCount++;    }
    else if (b.status === "partially_paid") { collected += paid; pending += (total - paid); partialCount++; }
    else if (b.status === "pending")        { pending += total;         pendingCount++; }
    else if (b.status === "cancelled")      { cancelledCount++;                         }
  });
  return { collected, pending, invoiced, paidCount, pendingCount, partialCount, cancelledCount, total: bills.length };
}

function groupBy(bills, keyFn, labelFn, sortFn) {
  const map = {};
  bills.forEach((b) => {
    const k = keyFn(b);
    if (!map[k]) map[k] = { key: k, label: labelFn(b, k), bills: [] };
    map[k].bills.push(b);
  });
  return Object.values(map)
    .sort(sortFn || ((a, b) => b.key.localeCompare(a.key)))
    .map((g) => ({ ...g, stats: calcStats(g.bills) }));
}

// Build chart data — sorted ascending for trend charts
function buildTrendData(bills, period) {
  let keyFn, labelFn;

  if (period === "daily" || period === "custom") {
    keyFn   = (b) => toDateKey(b.created_at);
    labelFn = (_, k) => {
      const [y, m, d] = k.split("-");
      return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    };
  } else if (period === "monthly" || period === "all") {
    keyFn   = (b) => { const d = new Date(b.created_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
    labelFn = (_, k) => { const [y, m] = k.split("-"); return new Date(y, m-1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }); };
  } else {
    keyFn   = (b) => String(new Date(b.created_at).getFullYear());
    labelFn = (_, k) => k;
  }

  const map = {};
  bills.forEach((b) => {
    const k = keyFn(b);
    if (!map[k]) map[k] = { key: k, label: labelFn(b, k), collected: 0, pending: 0, invoiced: 0, count: 0 };
    const total = Number(b.total_amount || 0);
    const paid  = Number(b.paid_amount  || 0);
    map[k].invoiced += total;
    map[k].count++;
    if      (b.status === "paid")           { map[k].collected += total; }
    else if (b.status === "partially_paid") { map[k].collected += paid; map[k].pending += (total - paid); }
    else if (b.status === "pending")        { map[k].pending += total; }
  });

  return Object.values(map)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((d) => ({
      ...d,
      collected: Math.round(d.collected),
      pending:   Math.round(d.pending),
      invoiced:  Math.round(d.invoiced),
    }));
}

// Recharts custom tooltip
function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
            <span className="text-gray-500 capitalize">{p.name}</span>
          </span>
          <span className="font-semibold text-gray-800">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <span className="font-semibold text-gray-800">{name}: </span>
      <span className="text-gray-600">{value}</span>
    </div>
  );
}

const PIE_COLORS = {
  Paid:           "#4ade80",
  "Partially Paid":"#60a5fa",
  Pending:        "#fbbf24",
  Cancelled:      "#f87171",
};

const PERIODS = [
  { value: "daily",   label: "Today"    },
  { value: "monthly", label: "This Month"},
  { value: "yearly",  label: "This Year" },
  { value: "custom",  label: "Custom"   },
  { value: "all",     label: "All Time" },
];

const STATUS_COLOR = {
  paid:           "text-green-600 bg-green-50",
  partially_paid: "text-blue-600 bg-blue-50",
  pending:        "text-amber-600 bg-amber-50",
  cancelled:      "text-red-400 bg-red-50",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const { user, loading } = useProtectedRoute();
  const [bills, setBills]             = useState([]);
  const [customers, setCustomers]     = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [period, setPeriod]           = useState("all");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  useEffect(() => {
    let mounted = true;
    loadWorkshopData()
      .then((data) => {
        if (!mounted) return;
        setBills(data.bills || []);
        setCustomers(data.customers || []);
      })
      .finally(() => { if (mounted) setLoadingData(false); });
    return () => { mounted = false; };
  }, []);

  const filtered    = useMemo(() => filterBills(bills, period, customRange), [bills, period, customRange]);
  const stats       = useMemo(() => calcStats(filtered), [filtered]);
  const trendData   = useMemo(() => buildTrendData(filtered, period), [filtered, period]);

  // Status donut data
  const pieData = useMemo(() => [
    { name: "Paid",            value: stats.paidCount    },
    { name: "Partially Paid",  value: stats.partialCount },
    { name: "Pending",         value: stats.pendingCount },
    { name: "Cancelled",       value: stats.cancelledCount },
  ].filter((d) => d.value > 0), [stats]);

  // Top customers by collected revenue
  const topCustomers = useMemo(() => {
    const map = {};
    filtered.forEach((b) => {
      if (!map[b.customer_id]) map[b.customer_id] = { id: b.customer_id, collected: 0, count: 0 };
      const paid = Number(b.status === "paid" ? b.total_amount : b.paid_amount || 0);
      map[b.customer_id].collected += paid;
      map[b.customer_id].count++;
    });
    return Object.values(map)
      .sort((a, b) => b.collected - a.collected)
      .slice(0, 8)
      .map((c) => ({
        name:      customers.find((cu) => cu.id === c.id)?.name || "Unknown",
        collected: Math.round(c.collected),
        count:     c.count,
      }));
  }, [filtered, customers]);

  // Grouped breakdown (for table)
  const groups = useMemo(() => {
    if (period === "daily" || period === "custom") {
      return groupBy(
        filtered,
        (b) => toDateKey(b.created_at),
        (b, k) => formatDate(k),
        (a, b) => b.key.localeCompare(a.key)
      );
    }
    if (period === "monthly" || period === "all") {
      return groupBy(
        filtered,
        (b) => { const d = new Date(b.created_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; },
        (b, k) => { const [y, m] = k.split("-"); return new Date(y, m-1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); },
        (a, b) => b.key.localeCompare(a.key)
      );
    }
    if (period === "yearly") {
      return groupBy(
        filtered,
        (b) => String(new Date(b.created_at).getFullYear()),
        (_, k) => k,
        (a, b) => Number(b.key) - Number(a.key)
      );
    }
    return [];
  }, [filtered, period]);

  if (loading || !user || loadingData) {
    return (
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <PageSkeleton variant="billing" />
      </div>
    );
  }

  const collectionRate = stats.invoiced > 0 ? Math.round((stats.collected / stats.invoiced) * 100) : 0;
  const avgInvoice     = stats.total > 0 ? Math.round(stats.invoiced / stats.total) : 0;

  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-7">

          {/* Header */}
          <div className="mb-6 animate-fade-in">
            <h1 className="text-xl font-semibold text-gray-900">Finance</h1>
            <p className="text-xs text-gray-400 mt-1">Revenue & billing analytics for your workshop</p>
          </div>

          {/* Period picker */}
          <div className="flex flex-wrap items-center gap-2 mb-6 animate-fade-in">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  period === p.value
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
            {period === "custom" && (
              <div className="flex items-center gap-2 ml-1">
                <input type="date" value={customRange.start} onChange={(e) => setCustomRange((p) => ({ ...p, start: e.target.value }))} className="flat-input !w-auto text-xs" />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" value={customRange.end} onChange={(e) => setCustomRange((p) => ({ ...p, end: e.target.value }))} className="flat-input !w-auto text-xs" />
              </div>
            )}
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6 stagger">
            <div className="flat-card !py-4 !px-5 animate-fade-in">
              <p className="flat-label mb-1">Collected</p>
              <p className="text-lg font-bold text-green-700 tabular-nums leading-tight">{formatCurrency(stats.collected)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{stats.paidCount + stats.partialCount} invoices</p>
            </div>
            <div className="flat-card !py-4 !px-5 animate-fade-in">
              <p className="flat-label mb-1">Pending</p>
              <p className="text-lg font-bold text-amber-600 tabular-nums leading-tight">{formatCurrency(stats.pending)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{stats.pendingCount + stats.partialCount} invoices</p>
            </div>
            <div className="flat-card !py-4 !px-5 animate-fade-in">
              <p className="flat-label mb-1">Total Invoiced</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{formatCurrency(stats.invoiced)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{stats.total} invoices</p>
            </div>
            <div className="flat-card !py-4 !px-5 animate-fade-in">
              <p className="flat-label mb-1">Avg Invoice</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{formatCurrency(avgInvoice)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">per bill</p>
            </div>
            <div className="flat-card !py-4 !px-5 animate-fade-in col-span-2 lg:col-span-1">
              <p className="flat-label mb-1">Collection Rate</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{collectionRate}%</p>
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${collectionRate}%` }} />
              </div>
            </div>
          </div>

          {/* Charts row */}
          {stats.total > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">

              {/* Revenue trend — bar chart */}
              <div className="xl:col-span-2 flat-card animate-fade-in">
                <p className="text-sm font-semibold text-gray-900 mb-1">Revenue Trend</p>
                <p className="text-[11px] text-gray-400 mb-4">Collected vs pending over time</p>
                {trendData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-xs text-gray-400">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trendData} barSize={trendData.length > 12 ? 8 : 18} barGap={3}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                        width={48}
                      />
                      <Tooltip content={<RevenueTooltip />} cursor={{ fill: "#f9fafb" }} />
                      <Bar dataKey="collected" name="collected" fill="#4ade80" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="pending"   name="pending"   fill="#fbbf24" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex gap-4 mt-2">
                  {[{ color: "#4ade80", label: "Collected" }, { color: "#fbbf24", label: "Pending" }].map(({ color, label }) => (
                    <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Status donut */}
              <div className="flat-card animate-fade-in">
                <p className="text-sm font-semibold text-gray-900 mb-1">Invoice Status</p>
                <p className="text-[11px] text-gray-400 mb-4">Distribution by count</p>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] || "#d1d5db"} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-1">
                  {pieData.map(({ name, value }) => (
                    <div key={name} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[name] || "#d1d5db" }} />
                      <span className="truncate">{name}</span>
                      <span className="ml-auto font-semibold text-gray-800 shrink-0">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top customers bar chart */}
          {topCustomers.length > 1 && (
            <div className="flat-card mb-6 animate-fade-in">
              <p className="text-sm font-semibold text-gray-900 mb-1">Top Customers</p>
              <p className="text-[11px] text-gray-400 mb-4">By amount collected in this period</p>
              <ResponsiveContainer width="100%" height={Math.max(160, topCustomers.length * 36)}>
                <BarChart
                  layout="vertical"
                  data={topCustomers}
                  barSize={18}
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#374151" }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(value), "Collected"]}
                    cursor={{ fill: "#f9fafb" }}
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #f3f4f6" }}
                  />
                  <Bar dataKey="collected" fill="#60a5fa" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grouped breakdown table */}
          {groups.length === 0 ? (
            <div className="flat-card text-center py-16 animate-fade-in">
              <p className="text-sm font-medium text-gray-500">No invoices for this period</p>
              <p className="text-xs text-gray-400 mt-1">Try selecting a different time range</p>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {groups.map((group) => (
                <div key={group.key} className="flat-card p-0 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-sm font-semibold text-gray-900">{group.label}</p>
                    <div className="flex flex-wrap gap-4 text-xs tabular-nums">
                      <span className="text-green-700 font-semibold">{formatCurrency(group.stats.collected)} collected</span>
                      {group.stats.pending > 0 && <span className="text-amber-600">{formatCurrency(group.stats.pending)} pending</span>}
                      <span className="text-gray-400">{group.stats.total} invoice{group.stats.total !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="text-left py-2.5 px-5 flat-label">Invoice</th>
                        <th className="text-left py-2.5 px-5 flat-label hidden sm:table-cell">Customer</th>
                        <th className="text-left py-2.5 px-5 flat-label hidden md:table-cell">Date</th>
                        <th className="text-center py-2.5 px-5 flat-label">Status</th>
                        <th className="text-right py-2.5 px-5 flat-label">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.bills
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .map((bill) => {
                          const customer = customers.find((c) => c.id === bill.customer_id);
                          return (
                            <tr
                              key={bill.id}
                              onClick={() => window.location.href = `/billing?bill=${bill.id}`}
                              className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              <td className="py-2.5 px-5 font-medium text-gray-900 whitespace-nowrap">INV-{bill.bill_number}</td>
                              <td className="py-2.5 px-5 text-gray-600 hidden sm:table-cell">{customer?.name || "—"}</td>
                              <td className="py-2.5 px-5 text-gray-400 text-xs hidden md:table-cell">{formatDate(bill.created_at)}</td>
                              <td className="py-2.5 px-5 text-center" onClick={(e) => e.stopPropagation()}>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLOR[bill.status] || "text-gray-500 bg-gray-100"}`}>
                                  {bill.status === "partially_paid" ? "Partial" : bill.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                                {bill.status === "partially_paid" ? (
                                  <span className="flex flex-col items-end text-xs font-normal">
                                    <span className="text-gray-900 font-semibold text-sm">{formatCurrency(bill.total_amount)}</span>
                                    <span className="text-[10px] text-green-600">Paid: {formatCurrency(bill.paid_amount)}</span>
                                    <span className="text-[10px] text-amber-600">Due: {formatCurrency(Math.max(0, bill.total_amount - bill.paid_amount))}</span>
                                  </span>
                                ) : (
                                  formatCurrency(bill.total_amount)
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
