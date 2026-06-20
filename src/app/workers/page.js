"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { SectionHeader, StatCard, EmptyState, Modal } from "@/components/ui";
import { loadWorkers, loadSalaryRecords, saveWorker, saveSalaryRecord } from "@/lib/workshop-data";
import {
  formatCurrency,
  formatDate,
  getInitials,
  getSalaryTypeStyle,
  generateId,
  MONTHS,
} from "@/lib/helpers";
import {
  Users,
  UserPlus,
  Wallet,
  IndianRupee,
  Briefcase,
  Calendar,
  Phone,
  ChevronDown,
  ChevronUp,
  Plus,
  Clock,
  TrendingUp,
} from "lucide-react";

export default function WorkersPage() {
  const { user, loading } = useProtectedRoute();
  const [workers, setWorkers] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedWorker, setExpandedWorker] = useState(null);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showPaySalary, setShowPaySalary] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadWorkers(), loadSalaryRecords()])
      .then(([w, s]) => {
        if (!mounted) return;
        setWorkers(w);
        setSalaryRecords(s);
      })
      .catch((err) => { if (mounted) showToast(err.message); })
      .finally(() => { if (mounted) setLoadingData(false); });
    return () => { mounted = false; };
  }, []);

  if (loading || !user || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F5F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400 font-medium animate-pulse">Loading workers...</span>
        </div>
      </div>
    );
  }

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const activeWorkers = workers.filter((w) => w.is_active);
  const totalPayroll = activeWorkers.reduce((s, w) => s + w.base_salary, 0);
  const totalPaid = salaryRecords
    .filter((r) => r.salary_type === "salary")
    .reduce((s, r) => s + r.amount_paid, 0);

  const getWorkerRecords = (workerId) =>
    salaryRecords
      .filter((r) => r.worker_id === workerId)
      .sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid));

  const roleColors = {
    "Head Mechanic": "#F59E0B",
    Mechanic: "#3B82F6",
    Electrician: "#10B981",
    Painter: "#EF4444",
    Helper: "#8B5CF6",
    "AC Technician": "#06B6D4",
  };

  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-7">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6 animate-fade-in">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Worker Ledger</h1>
              <p className="text-xs text-gray-400 mt-1">
                Manage staff, track salaries, and view payout history
              </p>
            </div>
            <button onClick={() => setShowAddWorker(true)} className="flat-btn-primary">
              <UserPlus size={15} strokeWidth={1.5} /> Add Worker
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7 stagger">
            <StatCard icon={Users} label="Active Workers" value={activeWorkers.length} accentColor="#F59E0B" />
            <StatCard icon={Wallet} label="Monthly Payroll" value={formatCurrency(totalPayroll)} accentColor="#8B5CF6" />
            <StatCard icon={TrendingUp} label="Total Disbursed" value={formatCurrency(totalPaid)} accentColor="#F59E0B" />
          </div>

          {/* Workers */}
          <SectionHeader title="Staff Directory" subtitle={`${workers.length} workers on record`} />

          <div className="space-y-3 stagger">
            {workers.map((worker) => {
              const isExpanded = expandedWorker === worker.id;
              const records = getWorkerRecords(worker.id);
              const roleColor = roleColors[worker.role] || "#6B7280";

              return (
                <div key={worker.id} className="flat-card flat-card-hover p-0 overflow-hidden animate-fade-in">
                  {/* Header row */}
                  <div
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-5 py-4 cursor-pointer"
                    onClick={() => setExpandedWorker(isExpanded ? null : worker.id)}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="flat-avatar w-10 h-10 text-xs rounded-xl text-white shrink-0"
                        style={{ background: roleColor }}
                      >
                        {getInitials(worker.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">{worker.name}</span>
                          {!worker.is_active && (
                            <span className="flat-pill bg-gray-100 text-gray-400 text-[10px] shrink-0">Inactive</span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-3.5 gap-y-1.5 mt-1.5 flex-wrap">
                          <span
                            className="flat-pill text-[10px] shrink-0 whitespace-nowrap"
                            style={{ background: `${roleColor}12`, color: roleColor }}
                          >
                            {worker.role}
                          </span>
                          {worker.phone && (
                            <span className="text-[11px] text-gray-400 flex items-center gap-1 whitespace-nowrap shrink-0">
                              <Phone size={10} strokeWidth={1.5} className="shrink-0" />
                              {worker.phone}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400 flex items-center gap-1 whitespace-nowrap shrink-0">
                            <Calendar size={10} strokeWidth={1.5} className="shrink-0" />
                            {formatDate(worker.joined_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0 border-gray-100 mt-2 md:mt-0 shrink-0">
                      <div className="text-left md:text-right">
                        <p className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(worker.base_salary)}
                        </p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Base Salary</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowPaySalary(worker); }}
                          className="flat-btn-primary text-xs py-1.5 px-3 shrink-0"
                        >
                          ₹ Pay
                        </button>
                        <div className="text-gray-300 p-1 shrink-0">
                          {isExpanded ? <ChevronUp size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded salary history */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-4 animate-fade-in bg-gray-50/50">
                      <p className="flat-label mb-3">Salary History ({records.length} records)</p>
                      {records.length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">No salary records yet</p>
                      ) : (
                        <div className="space-y-1.5">
                          {records.map((record) => {
                            const typeColors = {
                              salary: { bg: "#ECFDF5", color: "#16A34A" },
                              bonus: { bg: "#FEF3C7", color: "#D97706" },
                              advance: { bg: "#F3E8FF", color: "#7E22CE" },
                              deduction: { bg: "#FEF2F2", color: "#DC2626" },
                            };
                            const tc = typeColors[record.salary_type] || typeColors.salary;
                            return (
                              <div key={record.id} className="flex items-center justify-between py-2.5 px-3 bg-white rounded-lg">
                                <div className="flex items-center gap-3">
                                  <span className="status-dot" style={{ background: tc.color }} />
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="flat-pill text-[10px] capitalize shrink-0"
                                        style={{ background: tc.bg, color: tc.color }}>
                                        {record.salary_type}
                                      </span>
                                      {record.notes && (
                                        <span className="text-[11px] text-gray-400 break-words max-w-[150px] sm:max-w-xs">{record.notes}</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                                      <Clock size={9} strokeWidth={1.5} />
                                      {formatDate(record.date_paid)}
                                      {record.month && record.year && (
                                        <span> · {MONTHS[record.month - 1]} {record.year}</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums ${
                                  record.salary_type === "deduction" ? "text-red-500" : "text-gray-900"
                                }`}>
                                  {record.salary_type === "deduction" ? "-" : ""}
                                  {formatCurrency(record.amount_paid)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {showAddWorker && (
        <AddWorkerModal
          onClose={() => setShowAddWorker(false)}
          onAdd={async (workerData) => {
            try {
              const created = await saveWorker(workerData);
              setWorkers((prev) => [created, ...prev]);
              setShowAddWorker(false);
              showToast("Worker added");
            } catch (err) {
              showToast(err.message);
            }
          }}
        />
      )}

      {showPaySalary && (
        <PaySalaryModal
          worker={showPaySalary}
          onClose={() => setShowPaySalary(null)}
          onPay={async (record) => {
            try {
              const created = await saveSalaryRecord(record);
              setSalaryRecords((prev) => [created, ...prev]);
              setShowPaySalary(null);
              showToast("Payment recorded");
            } catch (err) {
              showToast(err.message);
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white rounded-xl shadow-dropdown px-4 py-2.5 text-sm font-medium animate-slide-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function AddWorkerModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [baseSalary, setBaseSalary] = useState("");

  const handleSubmit = () => {
    if (!name || !role || !baseSalary) return;
    onAdd({
      name, role, phone,
      base_salary: Number(baseSalary), is_active: true,
      joined_at: new Date().toISOString().split("T")[0],
    });
  };

  return (
    <Modal title="Add New Worker" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="flat-label block mb-1.5">Full Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="flat-input" placeholder="e.g. Ramesh Kumar" />
        </div>
        <div>
          <label className="flat-label block mb-1.5">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="flat-select">
            <option value="">Select role…</option>
            <option>Head Mechanic</option><option>Mechanic</option>
            <option>Electrician</option><option>Painter</option>
            <option>Helper</option><option>AC Technician</option>
          </select>
        </div>
        <div>
          <label className="flat-label block mb-1.5">Phone Number</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="flat-input" placeholder="e.g. 9876543210" />
        </div>
        <div>
          <label className="flat-label block mb-1.5">Base Salary (₹)</label>
          <input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="flat-input" placeholder="e.g. 18000" min="0" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="flat-btn">Cancel</button>
          <button onClick={handleSubmit} disabled={!name || !role || !baseSalary}
            className="flat-btn-primary disabled:opacity-50">
            <UserPlus size={14} strokeWidth={1.5} /> Add Worker
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PaySalaryModal({ worker, onClose, onPay }) {
  const [amount, setAmount] = useState(worker.base_salary);
  const [salaryType, setSalaryType] = useState("salary");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [notes, setNotes] = useState("");

  const handlePay = () => {
    if (!amount) return;
    onPay({
      worker_id: worker.id,
      amount_paid: Number(amount), salary_type: salaryType,
      month, year,
      date_paid: new Date().toISOString().split("T")[0],
      notes: notes || `${salaryType === "salary" ? MONTHS[month - 1] : salaryType} payment`,
    });
  };

  return (
    <Modal title={`Pay — ${worker.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-3.5 flex items-center gap-3">
          <div className="flat-avatar w-9 h-9 bg-accent-l text-accent text-xs rounded-lg">
            {getInitials(worker.name)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{worker.name}</p>
            <p className="text-[11px] text-gray-400">{worker.role} · Base: {formatCurrency(worker.base_salary)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flat-label block mb-1.5">Type</label>
            <select value={salaryType} onChange={(e) => setSalaryType(e.target.value)} className="flat-select">
              <option value="salary">Salary</option><option value="bonus">Bonus</option>
              <option value="advance">Advance</option><option value="deduction">Deduction</option>
            </select>
          </div>
          <div>
            <label className="flat-label block mb-1.5">Amount (₹)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="flat-input" min="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flat-label block mb-1.5">Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="flat-select">
              {MONTHS.map((m, i) => (<option key={i} value={i + 1}>{m}</option>))}
            </select>
          </div>
          <div>
            <label className="flat-label block mb-1.5">Year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="flat-input" />
          </div>
        </div>
        <div>
          <label className="flat-label block mb-1.5">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="flat-input" placeholder="Optional…" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="flat-btn">Cancel</button>
          <button onClick={handlePay} disabled={!amount} className="flat-btn-primary disabled:opacity-50">
            ₹ Record Payment
          </button>
        </div>
      </div>
    </Modal>
  );
}
