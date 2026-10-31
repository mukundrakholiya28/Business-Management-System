"use client";

/**
 * ConflictBanner.jsx
 * Shown when a record has sync_status === "conflict".
 * Provides simple resolution: keep local (re-queue upload) or discard (pull from server).
 */

import { AlertTriangle } from "lucide-react";

export default function ConflictBanner({ entityType, entityId, onKeepLocal, onDiscardLocal }) {
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
      <AlertTriangle size={16} strokeWidth={2} className="text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-800">Sync conflict detected</p>
        <p className="text-amber-700 text-xs mt-0.5">
          This record was modified on another device before your changes synced.
          Choose which version to keep.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onKeepLocal}
            className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
          >
            Keep my changes
          </button>
          <button
            onClick={onDiscardLocal}
            className="px-3 py-1 rounded-lg bg-white border border-amber-300 text-amber-700 text-xs font-medium hover:bg-amber-50"
          >
            Use server version
          </button>
        </div>
      </div>
    </div>
  );
}
