"use client";

import React, { useState } from "react";
import { Sparkles, Calendar, CheckCircle2, RefreshCw, Info } from "lucide-react";
import {
  getCurrentFinancialYear,
  DIWALI_CALENDAR_PERIODS,
} from "@/lib/diwali-calendar";
import { formatDate } from "@/lib/helpers";

export default function DiwaliSettingsSection({ onMigrated }) {
  const currentYear = getCurrentFinancialYear();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleRunMigration = async () => {
    setRunning(true);
    setMsg(null);
    try {
      const { getDb } = await import("@/lib/local-db");
      const { migrateExistingBillsToDiwaliYears, setAppSetting } = await import("@/lib/local-repo");
      const db = getDb();
      // Allow re-running
      await setAppSetting("diwali_migration_v1_done", false);
      await migrateExistingBillsToDiwaliYears(db);
      setMsg({ type: "success", text: "All past invoices successfully re-sequenced starting from INV-1 for each financial year!" });
      if (onMigrated) onMigrated();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Cycle Highlight */}
      <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/60">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0 mt-0.5">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Active Cycle: {currentYear.label} ({currentYear.samvat})
              </h2>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Current accounting year spans from{" "}
              <span className="font-medium text-gray-900">{formatDate(currentYear.startDate)}</span> to{" "}
              <span className="font-medium text-gray-900">{formatDate(currentYear.endDate)}</span>.
            </p>
            <p className="text-[11px] text-amber-800/80 mt-1">
              • Invoices for this year start at <strong>INV-1</strong> and automatically increment.
              <br />• On next Diwali (Bestu Varas), invoice numbers will automatically restart from <strong>INV-1</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Manual re-sequence action */}
      <div className="p-4 rounded-xl bg-white border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Financial Year (FY) Invoice Re-sequencing</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Partitions historical invoices into their respective financial years and resets numbering to 1 for each year.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunMigration}
            disabled={running}
            className="flat-btn text-xs flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw size={13} className={running ? "animate-spin" : ""} />
            {running ? "Processing…" : "Re-sequence Invoices"}
          </button>
        </div>

        {msg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              msg.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-red-50 text-red-700 border border-red-100"
            }`}
          >
            {msg.type === "success" ? <CheckCircle2 size={14} /> : <Info size={14} />}
            <span>{msg.text}</span>
          </div>
        )}
      </div>

      {/* Schedule Table */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
          Financial Year (Diwali Cycle) Schedule
        </h3>
        <div className="border border-gray-100 rounded-xl overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-medium">
              <tr>
                <th className="py-2.5 px-4">Financial Year</th>
                <th className="py-2.5 px-4">Samvat</th>
                <th className="py-2.5 px-4">Start (Bestu Varas)</th>
                <th className="py-2.5 px-4">End (Diwali)</th>
                <th className="py-2.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {DIWALI_CALENDAR_PERIODS.slice(3, 10).map((period) => {
                const isActive = period.key === currentYear.key;
                return (
                  <tr key={period.key} className={isActive ? "bg-amber-50/40 font-medium" : "hover:bg-gray-50/50"}>
                    <td className="py-2.5 px-4 text-gray-900">{period.label}</td>
                    <td className="py-2.5 px-4 text-gray-500">{period.samvat}</td>
                    <td className="py-2.5 px-4 text-gray-600">{formatDate(period.startDate)}</td>
                    <td className="py-2.5 px-4 text-gray-600">{formatDate(period.endDate)}</td>
                    <td className="py-2.5 px-4 text-center">
                      {isActive ? (
                        <span className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-800 font-bold">
                          Current
                        </span>
                      ) : new Date(period.endDate) < new Date() ? (
                        <span className="text-gray-400 text-[10px]">Archived</span>
                      ) : (
                        <span className="text-blue-600 text-[10px]">Upcoming</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

