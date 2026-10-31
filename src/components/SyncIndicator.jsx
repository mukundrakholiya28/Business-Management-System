"use client";

/**
 * SyncIndicator.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact sync status widget for the Navbar.
 * Shows status dot + last-sync time + pending count.
 * Expands to a dropdown on click with details and actions.
 */

import { useState, useRef, useEffect } from "react";
import { useSyncStatus } from "@/context/SyncContext";
import { formatDateTime } from "@/lib/helpers";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  WifiOff,
} from "lucide-react";

const STATUS_CONFIG = {
  idle: {
    color:  "text-gray-400",
    dot:    "bg-gray-300",
    label:  "Idle",
    Icon:   Cloud,
  },
  syncing: {
    color:  "text-blue-500",
    dot:    "bg-blue-400 animate-pulse",
    label:  "Syncing…",
    Icon:   RefreshCw,
  },
  online: {
    color:  "text-green-600",
    dot:    "bg-green-500",
    label:  "Synced",
    Icon:   CheckCircle2,
  },
  offline: {
    color:  "text-gray-500",
    dot:    "bg-gray-400",
    label:  "Offline",
    Icon:   WifiOff,
  },
  pending: {
    color:  "text-amber-600",
    dot:    "bg-amber-400 animate-pulse",
    label:  "Pending",
    Icon:   Clock,
  },
  error: {
    color:  "text-red-500",
    dot:    "bg-red-500",
    label:  "Sync failed",
    Icon:   AlertCircle,
  },
};

export default function SyncIndicator() {
  const { status, pendingCount, failedCount, lastSyncedAt, error, triggerSync, retryFailed } =
    useSyncStatus();
  const [open, setOpen]     = useState(false);
  const [syncing, setSyncing] = useState(false);
  const dropdownRef = useRef(null);

  const cfg  = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const Icon = cfg.Icon;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await triggerSync();
    } finally {
      setSyncing(false);
    }
  }

  async function handleRetry() {
    setSyncing(true);
    try {
      await retryFailed();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors text-xs"
        aria-label="Sync status"
        title={cfg.label}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <Icon size={13} strokeWidth={1.8} className={cfg.color} />
        {pendingCount > 0 && (
          <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full px-1.5 leading-5">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 p-3 z-50 text-xs">
          {/* Status row */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
          </div>

          {/* Details */}
          <div className="space-y-1 text-gray-500 mb-3">
            {status === "offline" && (
              <p className="flex items-center gap-1">
                <WifiOff size={11} />
                Working locally — changes will sync when online
              </p>
            )}

            {pendingCount > 0 && (
              <p className="flex items-center gap-1">
                <Clock size={11} />
                {pendingCount} change{pendingCount !== 1 ? "s" : ""} pending upload
              </p>
            )}

            {failedCount > 0 && (
              <p className="flex items-center gap-1 text-red-500">
                <AlertCircle size={11} />
                {failedCount} operation{failedCount !== 1 ? "s" : ""} failed
              </p>
            )}

            {error && status === "error" && (
              <p className="text-red-500 break-words">{error}</p>
            )}

            {lastSyncedAt && (
              <p>Last synced: {formatDateTime(lastSyncedAt)}</p>
            )}

            {!lastSyncedAt && status !== "syncing" && (
              <p>Not yet synced</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={handleSyncNow}
              disabled={syncing || status === "syncing"}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw
                size={11}
                strokeWidth={2}
                className={syncing || status === "syncing" ? "animate-spin" : ""}
              />
              Sync Now
            </button>

            {failedCount > 0 && (
              <button
                onClick={handleRetry}
                disabled={syncing}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <AlertCircle size={11} strokeWidth={2} />
                Retry Failed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
