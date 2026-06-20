"use client";

import React, { useState, useEffect, useRef } from "react";
import { formatCurrency, getStatusStyle } from "@/lib/helpers";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import ReactDOM from "react-dom";

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
 * Interactive status dropdown — portal-based so it escapes overflow:hidden containers.
 * onChange(newStatus) is called when user picks a different status.
 */
const STATUS_STYLES = {
  paid:      { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  pending:   { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  draft:     { bg: "bg-gray-100",  text: "text-gray-500",   border: "border-gray-200"  },
  cancelled: { bg: "bg-red-50",    text: "text-red-500",    border: "border-red-200"   },
};
const STATUS_OPTIONS = ["draft", "pending", "paid", "cancelled"];

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
            {s.charAt(0).toUpperCase() + s.slice(1)}
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
        {value.charAt(0).toUpperCase() + value.slice(1)}
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
