"use client";

import React, { useState, useEffect, useRef } from "react";
import { formatCurrency, getStatusStyle } from "@/lib/helpers";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import ReactDOM from "react-dom";

/**
 * Skeleton shimmer — single animated bar.
 * Usage: <Sk w="w-1/2" h="h-4" />
 */
export function Sk({ w = "w-full", h = "h-4", className = "" }) {
  return (
    <div
      className={`rounded-lg bg-gray-200 animate-pulse ${w} ${h} ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * PageSkeleton — content-only skeleton (navbar rendered separately by the page).
 * variant: "dashboard" | "billing" | "customers" | "customer-detail" | "profile" | "default"
 */
export function PageSkeleton({ variant = "default" }) {
  // Profile uses max-w-4xl; all others use max-w-7xl — matches actual page containers
  const maxW = variant === "profile" ? "max-w-4xl" : "max-w-7xl";

  return (
    <main className="flex-1">
      <div className={`${maxW} mx-auto px-5 sm:px-6 lg:px-8 py-7`}>
        {variant === "dashboard"       && <DashboardSkeleton />}
        {variant === "billing"         && <BillingSkeleton />}
        {variant === "customers"       && <CustomersSkeleton />}
        {variant === "customer-detail" && <CustomerDetailSkeleton />}
        {variant === "profile"         && <ProfileSkeleton />}
        {variant === "default"         && <DefaultSkeleton />}
      </div>
    </main>
  );
}

function ShimmerRow({ cols = [1] }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0">
      {cols.map((w, i) => <Sk key={i} w={w} h="h-3.5" />)}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-7">
      {/* Page header — same as <div className="mb-7"> */}
      <div className="space-y-1.5">
        <Sk w="w-28" h="h-5" />
        <Sk w="w-56" h="h-3" />
      </div>

      {/* Stat cards — grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-7 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flat-card space-y-3">
            <div className="flex items-center justify-between">
              <Sk w="w-24" h="h-3" />
              <Sk w="w-14" h="h-5" className="rounded-full" />
            </div>
            <Sk w="w-28" h="h-8" />
          </div>
        ))}
      </div>

      {/* Two-column layout — grid grid-cols-1 xl:grid-cols-4 gap-4 */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Recent invoices card — xl:col-span-3 */}
        <div className="xl:col-span-3 flat-card">
          {/* SectionHeader */}
          <div className="flex items-center justify-between mb-5">
            <div className="space-y-1.5"><Sk w="w-32" h="h-4" /><Sk w="w-36" h="h-3" /></div>
            <Sk w="w-16" h="h-7" className="rounded-lg" />
          </div>
          {/* Invoice rows */}
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`flex items-center justify-between py-3 ${i < 4 ? "border-b border-gray-50" : ""}`}>
              <div className="flex items-center gap-3">
                <Sk w="w-8 shrink-0" h="h-8" className="rounded-lg" />
                <div className="space-y-1.5">
                  <Sk w="w-24" h="h-3.5" />
                  <Sk w="w-36" h="h-3" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Sk w="w-16" h="h-5" className="rounded-lg" />
                <Sk w="w-20" h="h-4" />
              </div>
            </div>
          ))}
        </div>

        {/* Quick stats sidebar */}
        <div className="space-y-3">
          {[
            ["w-20","w-10","w-24"],
            ["w-16","w-10","w-20"],
          ].map((widths, i) => (
            <div key={i} className="flat-card !py-3 !px-4 space-y-1.5">
              <Sk w={widths[0]} h="h-3" />
              <Sk w={widths[1]} h="h-7" />
              <Sk w={widths[2]} h="h-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BillingSkeleton() {
  return (
    <div className="space-y-5">
      {/* Page header — flex flex-wrap items-start justify-between gap-3 mb-6 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5"><Sk w="w-20" h="h-5" /><Sk w="w-64" h="h-3" /></div>
        <Sk w="w-28" h="h-9" className="rounded-lg" />
      </div>

      {/* Toolbar — flex flex-wrap items-end gap-3 mb-5 */}
      <div className="flex flex-wrap items-end gap-3">
        <Sk w="w-48" h="h-9" className="rounded-lg flex-1 min-w-[200px]" />
        <Sk w="w-44" h="h-9" className="rounded-lg" />
        <Sk w="w-44" h="h-9" className="rounded-lg" />
      </div>

      {/* Bills table — flat-card p-0 */}
      <div className="flat-card p-0 overflow-hidden">
        {/* Table header */}
        <div className="flex gap-3 px-5 py-3 border-b border-gray-100">
          {["w-20","w-28","w-24","w-16","w-14","w-20","w-20"].map((w, i) => (
            <Sk key={i} w={w} h="h-3" />
          ))}
        </div>
        {/* Rows */}
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0">
            {["w-20","w-28","w-24","w-16","w-14","w-20","w-20"].map((w, j) => (
              <Sk key={j} w={w} h="h-3.5" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomersSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5"><Sk w="w-28" h="h-5" /><Sk w="w-72" h="h-3" /></div>
        <Sk w="w-32" h="h-9" className="rounded-lg" />
      </div>

      {/* Stat cards — grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {["Customers","Vehicles"].map((_, i) => (
          <div key={i} className="flat-card space-y-2">
            <Sk w="w-20" h="h-3" />
            <Sk w="w-12" h="h-8" />
          </div>
        ))}
      </div>

      {/* Search card */}
      <div className="flat-card">
        <Sk w="w-full" h="h-9" className="rounded-lg" />
      </div>

      {/* Customer list card */}
      <div className="flat-card p-0 overflow-hidden">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 last:border-0">
            {/* Avatar */}
            <Sk w="w-9 shrink-0" h="h-9" className="rounded-xl" />
            {/* Name + phone */}
            <div className="flex-1 space-y-1.5">
              <Sk w="w-36" h="h-3.5" />
              <Sk w="w-28" h="h-3" />
            </div>
            {/* Vehicle pills */}
            <div className="hidden sm:flex gap-1.5">
              <Sk w="w-20" h="h-5" className="rounded-full" />
            </div>
            {/* Chevron */}
            <Sk w="w-4 shrink-0" h="h-4" className="rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerDetailSkeleton() {
  return (
    <div className="space-y-5">
      {/* Back button */}
      <Sk w="w-32" h="h-4" className="rounded-lg" />

      {/* Profile card — flat-card mb-6 */}
      <div className="flat-card">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <Sk w="w-14 shrink-0" h="h-14" className="rounded-2xl" />
          {/* Name + contacts */}
          <div className="flex-1 space-y-2">
            <Sk w="w-44" h="h-5" />
            <Sk w="w-64" h="h-3" />
            <Sk w="w-24" h="h-3" />
          </div>
          {/* Summary pills */}
          <div className="flex flex-wrap gap-3 shrink-0">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5">
                <Sk w="w-12" h="h-2.5" />
                <Sk w="w-10" h="h-5" />
              </div>
            ))}
          </div>
          {/* Edit button */}
          <Sk w="w-14" h="h-8" className="rounded-lg shrink-0 self-start" />
        </div>
      </div>

      {/* Vehicle cards */}
      {[...Array(2)].map((_, i) => (
        <div key={i} className="flat-card p-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <Sk w="w-10 shrink-0" h="h-10" className="rounded-xl" />
              <div className="space-y-1.5">
                <Sk w="w-28" h="h-4" />
                <Sk w="w-44" h="h-3" />
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-right space-y-1"><Sk w="w-12" h="h-3" /><Sk w="w-8" h="h-4" /></div>
              <div className="text-right space-y-1"><Sk w="w-16" h="h-3" /><Sk w="w-12" h="h-4" /></div>
              <Sk w="w-20" h="h-8" className="rounded-lg" />
              <Sk w="w-6" h="h-6" className="rounded" />
            </div>
          </div>
          {/* Collapsed table hint */}
          <div className="border-t border-gray-100 px-5 py-8 flex gap-4">
            {["w-20","w-28","w-16","w-20","w-24"].map((w, j) => <Sk key={j} w={w} h="h-3" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Sk w="w-40" h="h-5" />
          <Sk w="w-80" h="h-3" />
        </div>
        <Sk w="w-28" h="h-9" className="rounded-lg" />
      </div>

      {/* grid grid-cols-1 lg:grid-cols-4 gap-5 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar — 3 nav buttons */}
        <div className="space-y-1">
          {[...Array(3)].map((_, i) => (
            <Sk key={i} w="w-full" h="h-10" className="rounded-xl" />
          ))}
        </div>

        {/* Form panel — lg:col-span-3 flat-card */}
        <div className="lg:col-span-3 flat-card space-y-5">
          <Sk w="w-36" h="h-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`space-y-1.5 ${i === 6 ? "sm:col-span-2" : ""}`}>
                <Sk w="w-20" h="h-3" />
                <Sk w="w-full" h="h-9" className="rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5"><Sk w="w-36" h="h-5" /><Sk w="w-56" h="h-3" /></div>
      <div className="flat-card space-y-3">
        {[...Array(4)].map((_, i) => <Sk key={i} w={i % 2 === 0 ? "w-full" : "w-3/4"} h="h-4" />)}
      </div>
    </div>
  );
}

/**
 * Flat stat card — large KPI number, uppercase label, optional trend pill
 */
export function StatCard({ label, value, trend, trendLabel }) {
  return (
    <div className="flat-card flat-card-hover animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <p className="flat-label text-black">{label}</p>
        {trend !== undefined && (
          <span
            className={`flat-pill ${
              trend > 0
                ? "bg-positive-l text-positive"
                : trend < 0
                ? "bg-negative-l text-negative"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {trend > 0 ? (
              <TrendingUp size={12} strokeWidth={1.5} />
            ) : trend < 0 ? (
              <TrendingDown size={12} strokeWidth={1.5} />
            ) : (
              <Minus size={12} strokeWidth={1.5} />
            )}
            {trendLabel || `${Math.abs(trend)}%`}
          </span>
        )}
      </div>
      <p className="text-kpi text-gray-900 tracking-tight">{value}</p>
    </div>
  );
}

/**
 * Status indicator — small colored dot + text
 */
export function StatusDot({ status }) {
  const colors = {
    paid: "#22C55E",
    pending: "#F59E0B",
    partially_paid: "#3B82F6",
    draft: "#9CA3AF",
    cancelled: "#EF4444",
  };
  const c = colors[status] || "#9CA3AF";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 capitalize">
      <span className="status-dot" style={{ background: c }} />
      {status === 'partially_paid' ? 'partially paid' : status}
    </span>
  );
}

/**
 * Status pill badge (alternative — used in tables)
 */
export function StatusBadge({ status }) {
  const map = {
    paid:      { bg: "#ECFDF5", color: "#16A34A" },
    pending:   { bg: "#FFFBEB", color: "#D97706" },
    partially_paid: { bg: "#EFF6FF", color: "#1D4ED8" },
    draft:     { bg: "#F3F4F6", color: "#6B7280" },
    cancelled: { bg: "#FEF2F2", color: "#DC2626" },
  };
  const s = map[status] || map.draft;

  return (
    <span
      className="flat-pill capitalize"
      style={{ background: s.bg, color: s.color }}
    >
      {status === 'partially_paid' ? 'partially paid' : status}
    </span>
  );
}

/**
 * Interactive status dropdown — portal-based so it escapes overflow:hidden containers.
 * onChange(newStatus) is called when user picks a different status.
 */
const STATUS_STYLES = {
  paid:      { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  pending:   { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  partially_paid: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  draft:     { bg: "bg-gray-100",  text: "text-gray-500",   border: "border-gray-200"  },
  cancelled: { bg: "bg-red-50",    text: "text-red-500",    border: "border-red-200"   },
};
const STATUS_OPTIONS = ["draft", "pending", "partially_paid", "paid", "cancelled"];

export function StatusSelect({ value, onChange }) {
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0, width: 0 });
  const triggerRef        = useRef(null);

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const cur = STATUS_STYLES[value] ?? STATUS_STYLES.draft;

  const panel = open && typeof document !== "undefined" && ReactDOM.createPortal(
    <div
      style={{ position: "absolute", top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 110), zIndex: 9999 }}
      className="bg-white border border-gray-100 rounded-xl shadow-lg py-1"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {STATUS_OPTIONS.map((s) => {
        const st = STATUS_STYLES[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => { onChange(s); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${st.text} ${s === value ? st.bg : "hover:bg-gray-50"}`}
          >
            {s === 'partially_paid' ? 'Partially Paid' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        );
      })}
    </div>,
    document.body
  );

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1 border cursor-pointer select-none ${cur.bg} ${cur.text} ${cur.border}`}
      >
        {value === 'partially_paid' ? 'Partially Paid' : value.charAt(0).toUpperCase() + value.slice(1)}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-50">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {panel}
    </div>
  );
}

/**
 * Section header — uppercase label + optional action
 */
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * Empty state
 */
export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flat-card text-center py-16">
      <div className="flat-avatar w-14 h-14 mx-auto mb-4 bg-gray-50 text-gray-300">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <p className="font-medium text-gray-500 mb-1 text-sm">{title}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}

/**
 * Modal wrapper
 */
export function Modal({ children, onClose, title, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative bg-white rounded-card-lg shadow-dropdown animate-fade-in w-full ${
          wide ? "max-w-3xl" : "max-w-lg"
        } max-h-[90vh] overflow-y-auto p-4 sm:p-6`}
        style={{ maxHeight: "calc(100vh - 48px)" }}
      >
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              className="flat-btn-ghost text-gray-400 hover:text-gray-600 p-1 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
