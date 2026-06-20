"use client";

import React, { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { ArrowUpRight } from "lucide-react";
import { StatCard, StatusSelect, SectionHeader } from "@/components/ui";
import { formatCurrency, formatVehicleNumber } from "@/lib/helpers";
import Link from "next/link";
import { loadWorkshopData, saveBillWithItems } from "@/lib/workshop-data";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOf(year, month) { return new Date(year, month, 1); }
function endOf(year, month)   { return new Date(year, month + 1, 0, 23, 59, 59, 999); }

function billsInRange(bills, from, to) {
  return bills.filter((b) => {
    const d = new Date(b.created_at);
    return d >= from && d <= to;
  });
}

/** Returns { value, trend (%), trendLabel } comparing this month vs last month */
function revenueStats(bills) {
  const now   = new Date();
  const yr    = now.getFullYear();
  const mo    = now.getMonth();

  const thisPaid = billsInRange(bills, startOf(yr, mo), endOf(yr, mo))
    .filter((b) => b.status === "paid")
    .reduce((s, b) => s + Number(b.total_amount), 0);

  const lastPaid = billsInRange(bills, startOf(yr, mo - 1), endOf(yr, mo - 1))
    .filter((b) => b.status === "paid")
    .reduce((s, b) => s + Number(b.total_amount), 0);

  const trend = lastPaid === 0
    ? (thisPaid > 0 ? 100 : 0)
    : Math.round(((thisPaid - lastPaid) / lastPaid) * 100);

  const sign = trend >= 0 ? "+" : "";
  return { value: thisPaid, trend, trendLabel: `${sign}${trend}%` };
}

/** Returns { value, trend (count delta), trendLabel } for invoice count */
function invoiceStats(bills) {
  const now = new Date();
  const yr  = now.getFullYear();
  const mo  = now.getMonth();

  const thisCount = billsInRange(bills, startOf(yr, mo), endOf(yr, mo)).length;
  const lastCount = billsInRange(bills, startOf(yr, mo - 1), endOf(yr, mo - 1)).length;
  const delta     = thisCount - lastCount;

  const sign = delta >= 0 ? "+" : "";
  const trendLabel = delta === 0
    ? "same as last month"
    : `${sign}${delta} this month`;

  return { value: bills.length, trend: delta, trendLabel };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading } = useProtectedRoute();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles]   = useState([]);
  const [bills, setBills]         = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    let mounted = true;
    loadWorkshopData()
      .then((data) => {
        if (!mounted) return;
        setCustomers(data.customers || []);
        setVehicles(data.vehicles   || []);
        setBills(data.bills         || []);
      })
      .catch((err) => { if (mounted) setError(err.message); })
      .finally(() => { if (mounted) setLoadingData(false); });
    return () => { mounted = false; };
  }, []);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const rev      = revenueStats(bills);
  const invStats = invoiceStats(bills);

  const pendingAmount = bills
    .filter((b) => b.status === "pending")
    .reduce((s, b) => s + Number(b.total_amount), 0);

  const recentBills = [...bills]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const handleStatusChange = async (bill, newStatus) => {
    if (bill.status === newStatus) return;
    const updated = { ...bill, status: newStatus };
    try {
      const saved = await saveBillWithItems({ bill: updated, isEditing: true });
      setBills((prev) => prev.map((b) => (b.id === bill.id ? saved.bill : b)));
    } catch (err) {
      console.error("[dashboard status update]", err.message);
    }
  };

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (loading || !user || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F5F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400 font-medium animate-pulse">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F5F7]">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-7">

          {/* Header */}
          <div className="mb-7 animate-fade-in">
            <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-400 mt-1">
              Workshop overview · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-7 stagger">
            <StatCard
              label="Total Revenue"
              value={formatCurrency(rev.value)}
              trend={rev.trend}
              trendLabel={rev.trendLabel}
            />
            <StatCard
              label="Pending Amount"
              value={formatCurrency(pendingAmount)}
            />
            <StatCard
              label="Total Invoices"
              value={invStats.value}
              trend={invStats.trend}
              trendLabel={invStats.trendLabel}
            />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

            {/* Recent invoices */}
            <div className="xl:col-span-3 flat-card animate-fade-in">
              <SectionHeader
                title="Recent Invoices"
                subtitle="Latest billing activity"
                action={
                  <Link href="/billing" className="flat-btn text-xs">
                    View All <ArrowUpRight size={12} strokeWidth={1.5} />
                  </Link>
                }
              />
              <div className="space-y-0">
                {recentBills.length === 0 && (
                  <p className="text-xs text-gray-400 py-6 text-center">No invoices yet.</p>
                )}
                {recentBills.map((bill, idx) => {
                  const customer = customers.find((c) => c.id === bill.customer_id);
                  const vehicle  = vehicles.find((v) => v.id === bill.vehicle_id);
                  return (
                    <div
                      key={bill.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 ${
                        idx < recentBills.length - 1 ? "border-b border-gray-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flat-avatar w-8 h-8 bg-gray-100 text-gray-500 rounded-lg text-xs font-semibold shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 whitespace-nowrap">
                            INV-{bill.bill_number}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {customer?.name} · {formatVehicleNumber(vehicle?.vehicle_number)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pl-11 sm:pl-0">
                        <StatusSelect
                          value={bill.status}
                          onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                        />
                        <span className="text-sm font-semibold text-gray-900 min-w-[72px] text-right tabular-nums">
                          {formatCurrency(bill.total_amount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick stats */}
            <div className="space-y-3">
              <div className="flat-card animate-fade-in !py-3 !px-4">
                <p className="flat-label mb-1">Customers</p>
                <p className="text-2xl font-bold text-gray-900">{customers.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">Registered</p>
                <Link href="/customers" className="inline-flex items-center gap-1 text-[11px] text-accent font-medium mt-1 hover:underline">
                  View Customers <ArrowUpRight size={10} strokeWidth={1.5} />
                </Link>
              </div>

              <div className="flat-card animate-fade-in !py-3 !px-4">
                <p className="flat-label mb-1">Vehicles</p>
                <p className="text-2xl font-bold text-gray-900">{vehicles.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">Registered</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
