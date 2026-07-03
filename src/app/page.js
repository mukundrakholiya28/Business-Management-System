"use client";

import React, { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { ArrowUpRight, Car, TrendingUp } from "lucide-react";
import { StatCard, StatusSelect, SectionHeader, PageSkeleton } from "@/components/ui";
import { formatCurrency, formatVehicleNumber, formatDate } from "@/lib/helpers";
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

/** Returns total all-time collected revenue */
function totalRevenue(bills) {
  return bills.reduce((s, b) => {
    if (b.status === "paid") return s + Number(b.total_amount);
    if (b.status === "partially_paid") return s + Number(b.paid_amount || 0);
    return s;
  }, 0);
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
  const allTimeRevenue = totalRevenue(bills);
  const invStats       = invoiceStats(bills);

  const pendingAmount = bills
    .reduce((s, b) => {
      if (b.status === "pending") return s + Number(b.total_amount);
      if (b.status === "partially_paid") return s + (Number(b.total_amount) - Number(b.paid_amount || 0));
      return s;
    }, 0);

  const recentBills = [...bills]
    .sort((a, b) => b.bill_number - a.bill_number)
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
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <PageSkeleton variant="dashboard" />
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
              value={formatCurrency(allTimeRevenue)}
              trendLabel="All time"
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
            <div className="xl:col-span-3 flat-card p-0 overflow-hidden animate-fade-in">
              <div className="px-5 pt-4 pb-3">
                <SectionHeader
                  title="Recent Invoices"
                  subtitle="Latest billing activity"
                  action={
                    <Link href="/billing" className="flat-btn text-xs">
                      View All <ArrowUpRight size={12} strokeWidth={1.5} />
                    </Link>
                  }
                />
              </div>
              {recentBills.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">No invoices yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-5 flat-label">Invoice</th>
                      <th className="text-left py-3 px-5 flat-label hidden sm:table-cell">Customer</th>
                      <th className="text-left py-3 px-5 flat-label hidden lg:table-cell">Vehicle</th>
                      <th className="text-left py-3 px-5 flat-label hidden xl:table-cell">Date</th>
                      <th className="text-center py-3 px-5 flat-label">Status</th>
                      <th className="text-right py-3 px-5 flat-label">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBills.map((bill) => {
                      const customer = customers.find((c) => c.id === bill.customer_id);
                      const vehicle  = vehicles.find((v) => v.id === bill.vehicle_id);
                      return (
                        <tr
                          key={bill.id}
                          onClick={() => window.location.href = `/billing?bill=${bill.id}`}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-5 font-medium text-gray-900 whitespace-nowrap">
                            INV-{bill.bill_number}
                          </td>
                          <td className="py-3 px-5 text-gray-600 hidden sm:table-cell">
                            {customer?.name}
                          </td>
                          <td className="py-3 px-5 text-gray-500 hidden lg:table-cell">
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1">
                                <Car size={12} strokeWidth={1.5} className="text-gray-400" />
                                {formatVehicleNumber(vehicle?.vehicle_number)}
                              </span>
                              {bill.kms_run && (
                                <span className="text-[10px] text-gray-400 pl-4">
                                  {Number(bill.kms_run).toLocaleString("en-IN")} km
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-5 text-gray-400 hidden xl:table-cell text-xs">
                            {formatDate(bill.created_at)}
                          </td>
                          <td className="py-3 px-5 text-center" onClick={(e) => e.stopPropagation()}>
                            <StatusSelect
                              value={bill.status}
                              onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                              stopPropagation
                            />
                          </td>
                          <td className="py-3 px-5 text-right font-semibold text-gray-900 tabular-nums">
                            {bill.status === "partially_paid" ? (
                              <div className="flex flex-col items-end text-xs font-normal">
                                <span className="text-gray-900 font-semibold text-sm">{formatCurrency(bill.total_amount)}</span>
                                <span className="text-[10px] text-green-600">Paid: {formatCurrency(bill.paid_amount)}</span>
                                <span className="text-[10px] text-amber-600 font-medium">Remaining: {formatCurrency(Math.max(0, bill.total_amount - bill.paid_amount))}</span>
                              </div>
                            ) : (
                              formatCurrency(bill.total_amount)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
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

              <div className="flat-card animate-fade-in !py-3 !px-4">
                <p className="flat-label mb-1">Finance</p>
                <p className="text-xs text-gray-400 mt-0.5">Revenue & expense reports</p>
                <Link href="/finance" className="inline-flex items-center gap-1 text-[11px] text-accent font-medium mt-1 hover:underline">
                  View Reports <ArrowUpRight size={10} strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
