"use client";

import { formatCurrency, getStatusStyle } from "@/lib/helpers";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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
    draft: "#9CA3AF",
    cancelled: "#EF4444",
  };
  const c = colors[status] || "#9CA3AF";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 capitalize">
      <span className="status-dot" style={{ background: c }} />
      {status}
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
    draft:     { bg: "#F3F4F6", color: "#6B7280" },
    cancelled: { bg: "#FEF2F2", color: "#DC2626" },
  };
  const s = map[status] || map.draft;

  return (
    <span
      className="flat-pill capitalize"
      style={{ background: s.bg, color: s.color }}
    >
      {status}
    </span>
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
        } max-h-[90vh] overflow-y-auto p-6`}
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
