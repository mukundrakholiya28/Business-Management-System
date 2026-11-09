"use client";

import { useState, useEffect, useRef } from "react";
import {
  Download,
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  RotateCcw,
  ShieldCheck,
  Layers,
  ArrowRight,
  HardDrive,
  Users,
  Car,
  FileText,
  Building2,
} from "lucide-react";
import {
  downloadBackupFile,
  parseAndValidateBackup,
  restoreBackupData,
  generateBackupData,
} from "@/lib/backup-restore";

export default function BackupRestoreSection({ onProfileUpdated }) {
  // Current live database stats
  const [liveStats, setLiveStats] = useState(null);
  const [loadingLiveStats, setLoadingLiveStats] = useState(true);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null);

  // Import / Restore state
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedBackup, setParsedBackup] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [restoreMode, setRestoreMode] = useState("merge"); // "merge" | "clean"
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState(null);
  const [restoreError, setRestoreError] = useState(null);

  const fileInputRef = useRef(null);

  // Load current database stats
  const refreshLiveStats = async () => {
    try {
      setLoadingLiveStats(true);
      const backup = await generateBackupData();
      setLiveStats(backup.meta.summary);
    } catch (e) {
      console.warn("Could not load current database counts:", e);
    } finally {
      setLoadingLiveStats(false);
    }
  };

  useEffect(() => {
    refreshLiveStats();
  }, []);

  // Handle Export
  const handleExport = async () => {
    try {
      setExporting(true);
      setExportSuccess(null);
      const result = await downloadBackupFile();
      setExportSuccess({
        filename: result.filename,
        summary: result.summary,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    } catch (err) {
      alert("Failed to create backup: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Handle File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setParsedBackup(null);
    setRestoreSuccess(null);
    setRestoreError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      const validation = parseAndValidateBackup(text);
      if (!validation.valid) {
        setParseError(validation.error);
      } else {
        setParsedBackup(validation);
      }
    };
    reader.onerror = () => {
      setParseError("Could not read the selected file.");
    };
    reader.readAsText(file);
  };

  // Reset file selector
  const handleResetFile = () => {
    setSelectedFile(null);
    setParsedBackup(null);
    setParseError(null);
    setRestoreSuccess(null);
    setRestoreError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle Restore
  const handleRestore = async () => {
    if (!parsedBackup || !parsedBackup.data) return;

    if (restoreMode === "clean") {
      const confirmed = window.confirm(
        "CAUTION: 'Clean Restore' will completely erase current customer and billing records before restoring this backup file.\n\nAre you absolutely sure you want to proceed?"
      );
      if (!confirmed) return;
    }

    try {
      setRestoring(true);
      setRestoreError(null);
      setRestoreSuccess(null);

      const result = await restoreBackupData({
        backupData: parsedBackup.data,
        mode: restoreMode,
        onProgress: (status) => setRestoreProgress(status),
      });

      setRestoreSuccess(result.summary);
      handleResetFile();
      await refreshLiveStats();
      onProfileUpdated?.();
    } catch (err) {
      setRestoreError(err.message || "Failed to restore data from backup.");
    } finally {
      setRestoring(false);
      setRestoreProgress("");
    }
  };

  return (
    <div className="space-y-6">

      {/* ── Section Title ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Database size={16} className="text-blue-600" />
          Backup & Data Restoration
        </h2>
        <p className="text-xs text-gray-500">
          Save an offline snapshot of your business records or restore a previous backup in case of data loss or device migration.
        </p>
      </div>

      {/* ── Current Database Status ── */}
      <div className="bg-gray-50/80 rounded-xl border border-gray-200/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <Layers size={13} className="text-gray-400" />
            Current Live Database Records
          </span>
          <button
            onClick={refreshLiveStats}
            disabled={loadingLiveStats}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <RotateCcw size={11} className={loadingLiveStats ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {loadingLiveStats ? (
          <div className="text-xs text-gray-400 animate-pulse py-2">Scanning database tables...</div>
        ) : liveStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <StatBadge icon={Users} label="Customers" count={liveStats.customers} />
            <StatBadge icon={Car} label="Vehicles" count={liveStats.vehicles} />
            <StatBadge icon={FileText} label="Bills" count={liveStats.bills} />
            <StatBadge icon={Layers} label="Line Items" count={liveStats.bill_items} />
          </div>
        ) : (
          <div className="text-xs text-gray-400">Unable to load record counts.</div>
        )}
      </div>

      {/* ── 1. Create Backup (Export) ── */}
      <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 text-white shadow-sm">
                <Download size={14} />
              </span>
              <h3 className="text-sm font-semibold text-gray-900">Create & Download Backup</h3>
            </div>
            <p className="text-xs text-gray-600 max-w-lg leading-relaxed">
              Exports a complete JSON file containing your customers, vehicles, invoices, bill items, and company settings.
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            <Download size={14} className={exporting ? "animate-bounce" : ""} />
            {exporting ? "Generating Backup..." : "Download Backup (.json)"}
          </button>
        </div>

        {exportSuccess && (
          <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5 animate-fade-in shadow-xs">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-emerald-800">
                Backup successfully downloaded at {exportSuccess.time}
              </div>
              <div className="text-gray-600 text-[11px] font-mono">
                {exportSuccess.filename}
              </div>
              <div className="text-[11px] text-gray-500">
                Contains {exportSuccess.summary.customers} customers, {exportSuccess.summary.vehicles} vehicles, {exportSuccess.summary.bills} bills, and {exportSuccess.summary.bill_items} line items.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Restore Backup (Import) ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-900 text-white shadow-sm">
              <Upload size={14} />
            </span>
            <h3 className="text-sm font-semibold text-gray-900">Restore System from Backup</h3>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Upload a previously saved <code className="text-xs bg-gray-100 px-1 py-0.5 rounded text-gray-700">.json</code> backup file to restore records.
          </p>
        </div>

        {/* File Input Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,application/json"
            className="hidden"
            id="backup-file-input"
          />
          <label
            htmlFor="backup-file-input"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-2 shrink-0"
          >
            <FileJson size={14} className="text-gray-500" />
            {selectedFile ? selectedFile.name : "Select Backup File (.json)"}
          </label>

          {selectedFile && (
            <button
              onClick={handleResetFile}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear file
            </button>
          )}
        </div>

        {/* Validation Error Banner */}
        {parseError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 animate-fade-in">
            <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Backup Content Preview & Confirmation */}
        {parsedBackup && (
          <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-4 space-y-4 animate-fade-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-indigo-600" />
                  Backup File Verified & Ready
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Exported on: {new Date(parsedBackup.meta.exported_at).toLocaleString()}
                </p>
              </div>
              <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {parsedBackup.summary.total_records} Total Records
              </span>
            </div>

            {/* Records Summary Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <StatBadge icon={Users} label="Customers" count={parsedBackup.summary.customers} color="indigo" />
              <StatBadge icon={Car} label="Vehicles" count={parsedBackup.summary.vehicles} color="indigo" />
              <StatBadge icon={FileText} label="Bills" count={parsedBackup.summary.bills} color="indigo" />
              <StatBadge icon={Layers} label="Line Items" count={parsedBackup.summary.bill_items} color="indigo" />
            </div>

            {/* Restore Mode Selector */}
            <div className="bg-white rounded-lg border border-gray-200/80 p-3 space-y-2">
              <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block">
                Choose Restoration Mode:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  restoreMode === "merge" ? "border-blue-500 bg-blue-50/50" : "border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="radio"
                    name="restore-mode"
                    value="merge"
                    checked={restoreMode === "merge"}
                    onChange={() => setRestoreMode("merge")}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="font-semibold text-gray-900 block">Merge / Update (Recommended)</span>
                    <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                      Upserts backup records. Updates existing items and adds missing records without deleting newer data.
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  restoreMode === "clean" ? "border-amber-500 bg-amber-50/50" : "border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="radio"
                    name="restore-mode"
                    value="clean"
                    checked={restoreMode === "clean"}
                    onChange={() => setRestoreMode("clean")}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <span className="font-semibold text-amber-900 block">Clean Restore (Replace All)</span>
                    <span className="text-[11px] text-amber-700 leading-tight block mt-0.5">
                      Clears current customer & invoice tables and replaces them completely with the backup contents.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-gray-500">
                {restoring ? (
                  <span className="text-blue-600 font-medium animate-pulse flex items-center gap-1.5">
                    <RotateCcw size={12} className="animate-spin" />
                    {restoreProgress || "Restoring records..."}
                  </span>
                ) : (
                  "Ready to restore records into your system."
                )}
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleResetFile}
                  disabled={restoring}
                  className="w-1/2 sm:w-auto px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className={`w-1/2 sm:w-auto px-4 py-2 rounded-lg text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 ${
                    restoreMode === "clean"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {restoring ? "Restoring..." : "Restore Data Now"}
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Error Banner */}
        {restoreError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 animate-fade-in">
            <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold">Restore Failed</div>
              <div>{restoreError}</div>
            </div>
          </div>
        )}

        {/* Restore Success Banner */}
        {restoreSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-3 animate-fade-in shadow-xs">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-emerald-900 text-sm">
                Data Restoration Complete!
              </div>
              <div className="text-emerald-700 leading-relaxed">
                Successfully restored {restoreSuccess.customers} customers, {restoreSuccess.vehicles} vehicles, {restoreSuccess.bills} bills, and {restoreSuccess.bill_items} line items.
              </div>
              <div className="text-[11px] text-emerald-600 pt-1">
                All data is loaded locally and synchronized with the cloud database.
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function StatBadge({ icon: Icon, label, count, color = "gray" }) {
  const isIndigo = color === "indigo";
  return (
    <div className={`p-2 rounded-lg border ${
      isIndigo
        ? "bg-white border-indigo-100"
        : "bg-white border-gray-200/80"
    }`}>
      <div className="flex items-center justify-center gap-1 text-[11px] text-gray-500 mb-0.5">
        <Icon size={12} className={isIndigo ? "text-indigo-500" : "text-gray-400"} />
        <span>{label}</span>
      </div>
      <div className="text-sm font-semibold text-gray-900">
        {count ?? 0}
      </div>
    </div>
  );
}
