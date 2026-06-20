"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { StatusBadge, EmptyState, Modal } from "@/components/ui";
import { formatCurrency, formatDate, getInitials, generateId } from "@/lib/helpers";
import { loadWorkshopData, saveBillWithItems, deleteVehicle, deleteBill } from "@/lib/workshop-data";
import {
  ArrowLeft, Car, Phone, Mail, MapPin, Receipt,
  Download, Eye, Pencil, Send, ChevronDown, ChevronRight,
  FileText, Trash2, Plus, UserPlus,
} from "lucide-react";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading } = useProtectedRoute();

  const [customer, setCustomer]     = useState(null);
  const [vehicles, setVehicles]     = useState([]);
  const [bills, setBills]           = useState([]);
  const [billItems, setBillItems]   = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [expandedVehicle, setExpandedVehicle] = useState(null);
  const [selectedBill, setSelectedBill]       = useState(null);
  const [editingBill, setEditingBill]         = useState(null);
  const [showBillForm, setShowBillForm]       = useState(false);
  const [allCustomers, setAllCustomers]       = useState([]);
  const [allVehicles, setAllVehicles]         = useState([]);
  const [confirmDeleteVehicle, setConfirmDeleteVehicle] = useState(null);
  const [confirmDeleteBill, setConfirmDeleteBill]       = useState(null);
  const [toast, setToast]                     = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    loadWorkshopData()
      .then((data) => {
        if (!mounted) return;
        const found = (data.customers || []).find((c) => c.id === id);
        setCustomer(found || null);
        setVehicles((data.vehicles || []).filter((v) => v.customer_id === id));
        setBills((data.bills || []).filter((b) => b.customer_id === id));
        setBillItems(data.billItems || []);
        setAllCustomers(data.customers || []);
        setAllVehicles(data.vehicles || []);
      })
      .finally(() => { if (mounted) setLoadingData(false); });
    return () => { mounted = false; };
  }, [id]);

  // Group bills by vehicle
  const billsByVehicle = useMemo(() => {
    const map = {};
    vehicles.forEach((v) => {
      map[v.id] = bills
        .filter((b) => b.vehicle_id === v.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    });
    return map;
  }, [vehicles, bills]);

  // Summary stats
  const totalSpent = bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.total_amount, 0);
  const pendingAmt  = bills.filter((b) => b.status === "pending").reduce((s, b) => s + b.total_amount, 0);

  const exportPDF = async (bill) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const cust    = allCustomers.find((c) => c.id === bill.customer_id);
    const vehicle = allVehicles.find((v) => v.id === bill.vehicle_id);
    const items   = billItems.filter((i) => i.bill_id === bill.id);

    const doc = new jsPDF();
    doc.setFontSize(20); doc.setFont("helvetica", "bold");
    doc.text("SHREE ROYAL CAR", 105, 25, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
    doc.text("Car Workshop & Service Center", 105, 31, { align: "center" });
    doc.setDrawColor(79, 110, 247); doc.setLineWidth(0.5); doc.line(20, 36, 190, 36);
    doc.setTextColor(0); doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text(`INVOICE #INV-${bill.bill_number}`, 20, 47);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Date: ${formatDate(bill.created_at)}`, 20, 54);
    doc.text(`Status: ${bill.status.toUpperCase()}`, 20, 60);
    doc.setFont("helvetica", "bold"); doc.text("Bill To:", 130, 47);
    doc.setFont("helvetica", "normal");
    doc.text(cust?.name || "—", 130, 54);
    doc.text(cust?.phone_number || "—", 130, 60);
    doc.text(`Vehicle: ${vehicle?.vehicle_number || "—"}`, 130, 66);
    doc.text(`${vehicle?.make || ""} ${vehicle?.model || ""}`, 130, 72);
    autoTable(doc, {
      startY: 82,
      head: [["#", "Description", "Qty", "Unit Price", "Total"]],
      body: items.map((item, i) => [i + 1, item.description, item.quantity, formatCurrency(item.unit_price), formatCurrency(item.total_price)]),
      theme: "plain",
      headStyles: { fillColor: [79, 110, 247], textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 4 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });
    const y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(9);
    doc.text("Subtotal:", 140, y); doc.text(formatCurrency(bill.subtotal), 185, y, { align: "right" });
    doc.text("Tax (18% GST):", 140, y + 6); doc.text(formatCurrency(bill.tax_amount), 185, y + 6, { align: "right" });
    doc.text("Discount:", 140, y + 12); doc.text(`-${formatCurrency(bill.discount)}`, 185, y + 12, { align: "right" });
    doc.setDrawColor(230); doc.line(140, y + 16, 185, y + 16);
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Total:", 140, y + 23); doc.text(formatCurrency(bill.total_amount), 185, y + 23, { align: "right" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(160);
    doc.text("Thank you for choosing Shree Royal Car!", 105, 280, { align: "center" });
    doc.save(`INV-${bill.bill_number}.pdf`);
    showToast("PDF downloaded");
  };

  const handleSaveBill = async ({ bill, items, isEditing }) => {
    try {
      const saved = await saveBillWithItems({ bill, items, isEditing });
      const nextBill  = saved.bill;
      const nextItems = saved.items || [];
      setBills((prev) =>
        isEditing ? prev.map((b) => (b.id === nextBill.id ? nextBill : b)) : [nextBill, ...prev]
      );
      setBillItems((prev) => {
        const remaining = isEditing ? prev.filter((i) => i.bill_id !== nextBill.id) : prev;
        return [...remaining, ...nextItems];
      });
      setSelectedBill(nextBill);
      setShowBillForm(false);
      setEditingBill(null);
      showToast(isEditing ? "Invoice updated" : "Invoice created");
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteVehicle = async (vehicle) => {
    try {
      await deleteVehicle(vehicle.id);
      setVehicles((prev) => prev.filter((v) => v.id !== vehicle.id));
      setBills((prev) => prev.filter((b) => b.vehicle_id !== vehicle.id));
      setConfirmDeleteVehicle(null);
      showToast(`Vehicle ${vehicle.vehicle_number} deleted`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteBill = async (bill) => {
    try {
      await deleteBill(bill.id);
      setBills((prev) => prev.filter((b) => b.id !== bill.id));
      setBillItems((prev) => prev.filter((i) => i.bill_id !== bill.id));
      setConfirmDeleteBill(null);
      showToast(`INV-${bill.bill_number} deleted`);
    } catch (err) {
      showToast(err.message);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F5F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400 font-medium animate-pulse">Loading customer...</span>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <main className="flex-1 pt-24 pb-20 lg:pt-14 lg:pb-0">
          <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-7">
            <EmptyState icon={FileText} title="Customer not found" description="This customer may have been removed." />
            <div className="flex justify-center mt-4">
              <button onClick={() => router.push("/customers")} className="flat-btn">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Customers
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <main className="flex-1 pt-24 lg:pt-14">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-7">

          {/* Back button */}
          <button
            onClick={() => router.push("/customers")}
            className="flat-btn-ghost text-xs mb-5 -ml-1 flex items-center gap-1.5 text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={14} strokeWidth={1.5} /> Back to Customers
          </button>

          {/* Customer profile card */}
          <div className="flat-card mb-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flat-avatar w-14 h-14 bg-amber-50 text-amber-600 text-lg font-bold rounded-2xl shrink-0">
                {getInitials(customer.name)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-gray-900">{customer.name}</h1>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5">
                  {customer.phone_number && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Phone size={11} strokeWidth={1.5} /> {customer.phone_number}
                    </span>
                  )}
                  {customer.email && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Mail size={11} strokeWidth={1.5} /> {customer.email}
                    </span>
                  )}
                  {customer.address && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin size={11} strokeWidth={1.5} /> {customer.address}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">Customer since {formatDate(customer.created_at)}</p>
              </div>
              {/* Summary pills */}
              <div className="flex flex-wrap gap-3 shrink-0">
                <div className="text-center px-4 py-2 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Invoices</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{bills.length}</p>
                </div>
                <div className="text-center px-4 py-2 rounded-xl bg-green-50 border border-green-100">
                  <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Total Paid</p>
                  <p className="text-lg font-bold text-green-700 mt-0.5">{formatCurrency(totalSpent)}</p>
                </div>
                {pendingAmt > 0 && (
                  <div className="text-center px-4 py-2 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Pending</p>
                    <p className="text-lg font-bold text-amber-700 mt-0.5">{formatCurrency(pendingAmt)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Vehicles + billing history */}
          <div className="space-y-4">
            {vehicles.length === 0 ? (
              <EmptyState icon={Car} title="No vehicles" description="No vehicles are linked to this customer." />
            ) : (
              vehicles.map((vehicle, vIdx) => {
                const vehicleBills = billsByVehicle[vehicle.id] || [];
                const isExpanded   = expandedVehicle === vehicle.id || vehicles.length === 1;
                const vehicleTotal = vehicleBills.filter((b) => b.status === "paid").reduce((s, b) => s + b.total_amount, 0);

                return (
                  <div key={vehicle.id} className="flat-card p-0 overflow-hidden animate-fade-in">
                    {/* Vehicle header row */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                      onClick={() => setExpandedVehicle(isExpanded && vehicles.length > 1 ? null : vehicle.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flat-avatar w-10 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold shrink-0">
                          {vIdx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{vehicle.vehicle_number}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[vehicle.make, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Invoices</p>
                          <p className="text-sm font-semibold text-gray-900">{vehicleBills.length}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Total paid</p>
                          <p className="text-sm font-semibold text-green-700">{formatCurrency(vehicleTotal)}</p>
                        </div>
                        <button
                          className="flat-btn-primary text-xs py-1.5 px-3 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBill(null);
                            setShowBillForm({ vehicleId: vehicle.id });
                          }}
                        >
                          <Plus size={13} strokeWidth={1.5} /> New Bill
                        </button>
                        <button
                          className="flat-btn-ghost p-1.5 text-gray-400 hover:text-red-500 shrink-0"
                          title="Delete vehicle"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteVehicle(vehicle); }}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                        {vehicles.length > 1 && (
                          <span className="text-gray-300">
                            {isExpanded ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bills table */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 animate-fade-in">
                        {vehicleBills.length === 0 ? (
                          <div className="px-5 py-8 text-center text-xs text-gray-400">
                            No invoices for this vehicle yet.
                          </div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50/70">
                                <th className="text-left py-2.5 px-5 flat-label">Invoice</th>
                                <th className="text-left py-2.5 px-5 flat-label hidden sm:table-cell">Date</th>
                                <th className="text-center py-2.5 px-5 flat-label">Status</th>
                                <th className="text-right py-2.5 px-5 flat-label">Amount</th>
                                <th className="text-right py-2.5 px-5 flat-label">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vehicleBills.map((bill) => (
                                <tr key={bill.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                                  <td className="py-3 px-5 font-medium text-gray-900 whitespace-nowrap">
                                    INV-{bill.bill_number}
                                    {bill.notes && <span className="ml-2 text-xs text-gray-400 font-normal hidden md:inline">{bill.notes}</span>}
                                  </td>
                                  <td className="py-3 px-5 text-xs text-gray-400 hidden sm:table-cell">{formatDate(bill.created_at)}</td>
                                  <td className="py-3 px-5 text-center"><StatusBadge status={bill.status} /></td>
                                  <td className="py-3 px-5 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(bill.total_amount)}</td>
                                  <td className="py-3 px-5 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-0.5">
                                      <button onClick={() => setSelectedBill(bill)} className="flat-btn-ghost p-1.5" title="View"><Eye size={15} strokeWidth={1.5} /></button>
                                      <button onClick={() => { setEditingBill(bill); setShowBillForm(true); }} className="flat-btn-ghost p-1.5" title="Edit"><Pencil size={15} strokeWidth={1.5} /></button>
                                      <button onClick={() => exportPDF(bill)} className="flat-btn-ghost p-1.5" title="PDF"><Download size={15} strokeWidth={1.5} /></button>
                                      <button onClick={() => setConfirmDeleteBill(bill)} className="flat-btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={15} strokeWidth={1.5} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Bill detail modal */}
      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          items={billItems.filter((i) => i.bill_id === selectedBill.id)}
          customer={customer}
          vehicle={allVehicles.find((v) => v.id === selectedBill.vehicle_id)}
          onClose={() => setSelectedBill(null)}
          onExportPDF={() => exportPDF(selectedBill)}
          onEdit={() => { setEditingBill(selectedBill); setShowBillForm(true); setSelectedBill(null); }}
        />
      )}

      {/* Create / edit bill modal */}
      {showBillForm && (
        <CreateBillModal
          key={editingBill?.id || "new"}
          customers={allCustomers}
          vehicles={allVehicles}
          bills={bills}
          bill={editingBill}
          billItems={billItems.filter((i) => i.bill_id === editingBill?.id)}
          presetCustomerId={id}
          presetVehicleId={showBillForm?.vehicleId || editingBill?.vehicle_id || null}
          onClose={() => { setShowBillForm(false); setEditingBill(null); }}
          onSave={handleSaveBill}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white rounded-xl shadow-dropdown px-4 py-2.5 text-sm font-medium animate-slide-in">
          {toast}
        </div>
      )}

      {/* Confirm delete vehicle */}
      {confirmDeleteVehicle && (
        <Modal title="Delete Vehicle" onClose={() => setConfirmDeleteVehicle(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Delete <strong>{confirmDeleteVehicle.vehicle_number}</strong>? All invoices for this vehicle will also be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteVehicle(null)} className="flat-btn">Cancel</button>
              <button onClick={() => handleDeleteVehicle(confirmDeleteVehicle)} className="flat-btn-danger">
                <Trash2 size={14} strokeWidth={1.5} /> Delete Vehicle
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm delete bill */}
      {confirmDeleteBill && (
        <Modal title="Delete Invoice" onClose={() => setConfirmDeleteBill(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Delete <strong>INV-{confirmDeleteBill.bill_number}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteBill(null)} className="flat-btn">Cancel</button>
              <button onClick={() => handleDeleteBill(confirmDeleteBill)} className="flat-btn-danger">
                <Trash2 size={14} strokeWidth={1.5} /> Delete Invoice
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Bill detail modal ──────────────────────────────────────────
function BillDetailModal({ bill, items, customer, vehicle, onClose, onExportPDF, onEdit }) {
  return (
    <Modal title={`Invoice #INV-${bill.bill_number}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="flat-label mb-2">Customer</p>
          <p className="text-sm font-medium text-gray-900">{customer?.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{customer?.phone_number}</p>
          <p className="text-xs text-gray-400">{customer?.address}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="flat-label mb-2">Vehicle</p>
          <p className="text-sm font-medium text-gray-900">{vehicle?.vehicle_number}</p>
          <p className="text-xs text-gray-400 mt-0.5">{vehicle?.make} {vehicle?.model} ({vehicle?.year})</p>
          <p className="text-xs text-gray-400">{vehicle?.color}</p>
        </div>
      </div>
      <table className="w-full text-sm mb-5">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 flat-label">#</th>
            <th className="text-left py-2 flat-label">Description</th>
            <th className="text-right py-2 flat-label">Qty</th>
            <th className="text-right py-2 flat-label">Price</th>
            <th className="text-right py-2 flat-label">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id ?? i} className="border-b border-gray-50">
              <td className="py-2.5 text-gray-400 text-xs">{i + 1}</td>
              <td className="py-2.5 text-gray-700">{item.description}</td>
              <td className="py-2.5 text-right text-gray-500">{item.quantity}</td>
              <td className="py-2.5 text-right text-gray-500">{formatCurrency(item.unit_price)}</td>
              <td className="py-2.5 text-right font-medium text-gray-900">{formatCurrency(item.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex justify-between text-sm text-gray-500 mb-1.5"><span>Subtotal</span><span>{formatCurrency(bill.subtotal)}</span></div>
        <div className="flex justify-between text-sm text-gray-500 mb-1.5"><span>Tax (18% GST)</span><span>{formatCurrency(bill.tax_amount)}</span></div>
        <div className="flex justify-between text-sm text-gray-500 mb-2"><span>Discount</span><span>-{formatCurrency(bill.discount)}</span></div>
        <div className="flat-divider" />
        <div className="flex justify-between text-base font-bold text-gray-900 mt-2"><span>Total</span><span>{formatCurrency(bill.total_amount)}</span></div>
      </div>
      <div className="flex flex-wrap gap-2 mt-5">
        <button onClick={onExportPDF} className="flat-btn"><Download size={14} strokeWidth={1.5} /> PDF</button>
        <button onClick={onEdit} className="flat-btn"><Pencil size={14} strokeWidth={1.5} /> Edit</button>
      </div>
    </Modal>
  );
}

// ── Create / edit bill modal ───────────────────────────────────
function CreateBillModal({ customers, vehicles, bills, bill, billItems, presetCustomerId, presetVehicleId, onClose, onSave }) {
  const isEditing  = Boolean(bill);
  const [customerId, setCustomerId] = useState(bill?.customer_id || presetCustomerId || "");
  const [vehicleId, setVehicleId]   = useState(bill?.vehicle_id  || presetVehicleId  || "");
  const [items, setItems] = useState(
    billItems?.length
      ? billItems.map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price }))
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [discount, setDiscount] = useState(bill?.discount || 0);
  const [notes, setNotes]       = useState(bill?.notes    || "");
  const [status, setStatus]     = useState(bill?.status   || "draft");

  const visibleVehicles = vehicles.filter((v) => v.customer_id === customerId);
  const addItem    = () => setItems((p) => [...p, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i, f, v) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [f]: v } : it));

  const subtotal    = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmount   = Math.round(subtotal * 0.18 * 100) / 100;
  const totalAmount = subtotal + taxAmount - discount;

  const handleSave = () => {
    if (!customerId || !vehicleId || items.every((i) => !i.description.trim())) return;
    const billId = bill?.id || generateId();
    const billNumber = bill?.bill_number || Math.max(1000, ...bills.map((b) => b.bill_number)) + 1;
    const savedBill = {
      id: billId, bill_number: billNumber, customer_id: customerId, vehicle_id: vehicleId,
      subtotal, tax_amount: taxAmount, discount, total_amount: totalAmount, status, notes,
      created_at: bill?.created_at || new Date().toISOString(),
    };
    const savedItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({ id: generateId(), bill_id: billId, description: i.description, quantity: i.quantity, unit_price: i.unit_price, total_price: i.quantity * i.unit_price }));
    onSave({ bill: savedBill, items: savedItems, isEditing });
  };

  return (
    <Modal title={isEditing ? "Edit Invoice" : "New Invoice"} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flat-label block mb-1.5">Customer</label>
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId(""); }} className="flat-select">
              <option value="">Select customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone_number})</option>)}
            </select>
          </div>
          <div>
            <label className="flat-label block mb-1.5">Vehicle</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="flat-select" disabled={!customerId}>
              <option value="">Select vehicle…</option>
              {visibleVehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_number} — {v.make} {v.model}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="flat-label block mb-2">Line Items</label>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-2 p-3 bg-gray-50 rounded-xl items-start sm:items-center">
                <div className="flat-avatar w-8 h-8 bg-white text-gray-500 border border-gray-100 shrink-0">{i + 1}</div>
                <input type="text" placeholder="Description" value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} className="flat-input flex-1 min-w-0" />
                <input type="number" placeholder="Qty" value={item.quantity} min="1" onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} className="flat-input w-20" />
                <input type="number" placeholder="Price" value={item.unit_price || ""} min="0" onChange={(e) => updateItem(i, "unit_price", Number(e.target.value))} className="flat-input w-28" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 min-w-[72px] text-right tabular-nums">{formatCurrency(item.quantity * item.unit_price)}</span>
                  {items.length > 1 && <button onClick={() => removeItem(i)} className="flat-btn-ghost p-1 text-red-400"><Trash2 size={14} strokeWidth={1.5} /></button>}
                </div>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="flat-btn mt-2 text-xs"><Plus size={14} strokeWidth={1.5} /> Add Item</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="flat-label block mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="flat-select">
              {["draft","pending","paid","cancelled"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="flat-label block mb-1.5">Discount (₹)</label>
            <input type="number" value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} className="flat-input" min="0" />
          </div>
          <div>
            <label className="flat-label block mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="flat-input" placeholder="Optional…" />
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between text-sm text-gray-500 mb-1"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-sm text-gray-500 mb-1"><span>Tax (18% GST)</span><span>{formatCurrency(taxAmount)}</span></div>
          <div className="flex justify-between text-sm text-gray-500 mb-2"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
          <div className="flat-divider" />
          <div className="flex justify-between text-base font-bold text-gray-900 mt-2"><span>Total</span><span>{formatCurrency(totalAmount)}</span></div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="flat-btn">Cancel</button>
          <button onClick={handleSave} disabled={!customerId || !vehicleId || items.every((i) => !i.description.trim())} className="flat-btn-primary disabled:opacity-50">
            <Receipt size={14} strokeWidth={1.5} /> {isEditing ? "Save Changes" : "Create Invoice"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
