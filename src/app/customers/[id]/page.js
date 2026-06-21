"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { StatusSelect, EmptyState, Modal, PageSkeleton } from "@/components/ui";
import { formatCurrency, formatDate, getInitials, generateId } from "@/lib/helpers";
import { loadWorkshopData, saveBillWithItems, deleteVehicle, deleteBill, updateCustomer, saveVehicle } from "@/lib/workshop-data";
import { exportInvoicePDF, generateInvoicePDF } from "@/lib/pdf";
import { supabase } from "@/lib/supabase";
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
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle]   = useState(null);

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
    const cust    = allCustomers.find((c) => c.id === bill.customer_id);
    const vehicle = allVehicles.find((v) => v.id === bill.vehicle_id);
    const items   = billItems.filter((i) => i.bill_id === bill.id);
    await exportInvoicePDF({ bill, items, customer: cust, vehicle }, showToast);
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

  const handleEditCustomer = async (updated) => {
    try {
      const saved = await updateCustomer(updated);
      setCustomer(saved);
      setShowEditCustomer(false);
      showToast("Customer updated");
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleSaveVehicle = (savedVehicle, isEditing) => {
    if (isEditing) {
      setVehicles((prev) => prev.map((v) => (v.id === savedVehicle.id ? savedVehicle : v)));
      setAllVehicles((prev) => prev.map((v) => (v.id === savedVehicle.id ? savedVehicle : v)));
      showToast("Vehicle updated");
    } else {
      setVehicles((prev) => [savedVehicle, ...prev]);
      setAllVehicles((prev) => [savedVehicle, ...prev]);
      setExpandedVehicle(savedVehicle.id);
      showToast("Vehicle added");
    }
  };

  const handleStatusChange = async (bill, newStatus) => {
    if (bill.status === newStatus) return;
    try {
      const saved = await saveBillWithItems({
        bill: { ...bill, status: newStatus },
        isEditing: true,
      });
      setBills((prev) => prev.map((b) => (b.id === bill.id ? saved.bill : b)));
      showToast(`Status updated to ${newStatus}`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const sendToCustomer = async (bill) => {
    if (!customer?.phone_number) {
      showToast("No phone number on file for this customer.");
      return;
    }

    const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
    const items = billItems.filter((i) => i.bill_id === bill.id);

    let pdfUrl = null;
    let pdfBase64 = null;
    let pdfBlob = null;

    try {
      showToast("Generating invoice PDF...");
      const pdf = await generateInvoicePDF({ bill, items, customer, vehicle });
      if (pdf) {
        pdfBlob = pdf.output("blob");

        // Convert to base64 for email
        pdfBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });

        // Upload to Supabase Storage if supabase is ready
        if (supabase) {
          try {
            // Get user ID
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || "anonymous";
            const filePath = `${userId}/INV-${bill.bill_number}.pdf`;

            // Try creating bucket in case it doesn't exist
            await supabase.storage.createBucket('invoices', { public: true }).catch(() => {});

            const { error: uploadError } = await supabase.storage
              .from('invoices')
              .upload(filePath, pdfBlob, {
                contentType: 'application/pdf',
                upsert: true,
              });

            if (uploadError) {
              if (uploadError.message?.includes("Bucket not found")) {
                console.warn(
                  "Supabase Storage bucket 'invoices' not found. " +
                  "Please create the bucket in your Supabase dashboard or run the storage SQL schema. " +
                  "Full error:", uploadError
                );
              } else {
                console.error("Storage upload failed:", uploadError);
              }
            } else {
              const { data: urlData } = supabase.storage
                .from('invoices')
                .getPublicUrl(filePath);
              pdfUrl = urlData?.publicUrl;
            }
          } catch (storageErr) {
            console.error("Storage upload error:", storageErr);
          }
        }
      }
    } catch (pdfErr) {
      console.error("Failed to generate PDF:", pdfErr);
      showToast("PDF generation failed, sending messages without PDF attachment...");
    }

    let emailSent = null;
    let emailError = null;

    if (customer?.email) {
      try {
        showToast("Sending invoice email...");
        const { sendInvoiceEmail } = await import("@/lib/email");
        const resData = await sendInvoiceEmail({
          bill,
          items,
          customer,
          vehicle,
          pdfBase64,
          pdfUrl,
        });
        emailSent = resData;
      } catch (err) {
        emailError = err.message;
        console.error("Failed to send email:", err);
      }
    }

    try {
      // Check if native sharing is available for the PDF file (mobile/PWA support)
      let sharedNatively = false;
      if (pdfBlob && navigator.share && navigator.canShare) {
        const pdfFile = new File([pdfBlob], `INV-${bill.bill_number}.pdf`, { type: "application/pdf" });
        if (navigator.canShare({ files: [pdfFile] })) {
          try {
            await navigator.share({
              files: [pdfFile],
              title: `Invoice INV-${bill.bill_number}`,
              text: `Hello ${customer.name},\n\nThank you for choosing Shree Royal Car! Your invoice INV-${bill.bill_number} has been generated.\nTotal Amount: ${formatCurrency(bill.total_amount)}\n\nBest regards,\nShree Royal Car Team`,
            });
            sharedNatively = true;
            if (emailSent) {
              if (emailSent.redirected) {
                showToast(`Email redirected to sandbox (${emailSent.authorizedEmail}) & native share opened`);
              } else {
                showToast(`Email sent & native share opened for ${customer.name}`);
              }
            } else if (emailError) {
              showToast(`Native share opened, but email failed: ${emailError}`);
            } else {
              showToast(`Native share opened (No email on file for ${customer.name})`);
            }
          } catch (shareErr) {
            console.warn("Native share cancelled or failed:", shareErr);
          }
        }
      }

      if (!sharedNatively) {
        const { sendWhatsApp } = await import("@/lib/whatsapp");
        const { formatCurrency } = await import("@/lib/helpers");
        sendWhatsApp(
          customer.phone_number,
          customer.name,
          `INV-${bill.bill_number}`,
          formatCurrency(bill.total_amount),
          pdfUrl
        );

        if (emailSent) {
          if (emailSent.redirected) {
            showToast(`Email redirected to sandbox (${emailSent.authorizedEmail}) & WhatsApp opened`);
          } else {
            showToast(`Email sent & WhatsApp opened for ${customer.name}`);
          }
        } else if (emailError) {
          showToast(`WhatsApp opened, but email failed: ${emailError}`);
        } else {
          showToast(`WhatsApp opened (No email on file for ${customer.name})`);
        }
      }
    } catch (err) {
      showToast(`Failed to open WhatsApp: ${err.message}`);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <PageSkeleton variant="customer-detail" />
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
      <main className="flex-1">
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
              <button
                onClick={() => setShowEditCustomer(true)}
                className="flat-btn text-xs shrink-0 self-start"
              >
                <Pencil size={13} strokeWidth={1.5} /> Edit
              </button>
            </div>
          </div>

          {/* Section Header */}
          <div className="flex items-center justify-between mb-4 animate-fade-in">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Vehicles & Invoices</h2>
            <button
              onClick={() => {
                setEditingVehicle(null);
                setShowVehicleForm(true);
              }}
              className="flat-btn-primary text-xs"
            >
              <Plus size={13} strokeWidth={1.5} /> Add Vehicle
            </button>
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
                          className="flat-btn-ghost p-1.5 text-gray-500 hover:text-gray-900 shrink-0"
                          title="Edit vehicle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingVehicle(vehicle);
                            setShowVehicleForm(true);
                          }}
                        >
                          <Pencil size={14} strokeWidth={1.5} />
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
                          <>
                            {/* Desktop Table view */}
                            <div className="hidden sm:block">
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
                                      <td className="py-3 px-5 text-center">
                                        <StatusSelect
                                          value={bill.status}
                                          onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                                        />
                                      </td>
                                      <td className="py-3 px-5 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(bill.total_amount)}</td>
                                      <td className="py-3 px-5 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-0.5">
                                          <button onClick={() => setSelectedBill(bill)} className="flat-btn-ghost p-1.5" title="View"><Eye size={15} strokeWidth={1.5} /></button>
                                          <button onClick={() => { setEditingBill(bill); setShowBillForm(true); setSelectedBill(null); }} className="flat-btn-ghost p-1.5" title="Edit"><Pencil size={15} strokeWidth={1.5} /></button>
                                          <button onClick={() => exportPDF(bill)} className="flat-btn-ghost p-1.5" title="PDF"><Download size={15} strokeWidth={1.5} /></button>
                                          <button onClick={() => sendToCustomer(bill)} className="flat-btn-ghost p-1.5 text-accent" title="Send"><Send size={15} strokeWidth={1.5} /></button>
                                          <button onClick={() => setConfirmDeleteBill(bill)} className="flat-btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={15} strokeWidth={1.5} /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Mobile list view */}
                            <div className="sm:hidden divide-y divide-gray-100">
                              {vehicleBills.map((bill) => (
                                <div key={bill.id} className="p-4 flex flex-col gap-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-gray-900 text-xs">INV-{bill.bill_number}</span>
                                    <StatusSelect
                                      value={bill.status}
                                      onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                                    />
                                  </div>
                                  <div className="flex items-end justify-between">
                                    <div>
                                      <p className="text-[10px] text-gray-400">{formatDate(bill.created_at)}</p>
                                      {bill.notes && <p className="text-[10px] text-gray-500 mt-0.5">{bill.notes}</p>}
                                    </div>
                                    <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(bill.total_amount)}</span>
                                  </div>
                                  <div className="flex items-center justify-end gap-1 border-t border-gray-50/50 pt-2">
                                    <button onClick={() => setSelectedBill(bill)} className="flat-btn-ghost p-1.5" title="View"><Eye size={14} strokeWidth={1.5} /></button>
                                    <button onClick={() => { setEditingBill(bill); setShowBillForm(true); setSelectedBill(null); }} className="flat-btn-ghost p-1.5" title="Edit"><Pencil size={14} strokeWidth={1.5} /></button>
                                    <button onClick={() => exportPDF(bill)} className="flat-btn-ghost p-1.5" title="PDF"><Download size={14} strokeWidth={1.5} /></button>
                                    <button onClick={() => sendToCustomer(bill)} className="flat-btn-ghost p-1.5 text-accent" title="Send"><Send size={14} strokeWidth={1.5} /></button>
                                    <button onClick={() => setConfirmDeleteBill(bill)} className="flat-btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={14} strokeWidth={1.5} /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
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

      {showEditCustomer && (
        <CustomerEditModal
          customer={customer}
          onClose={() => setShowEditCustomer(false)}
          onSave={handleEditCustomer}
        />
      )}

      {showVehicleForm && (
        <VehicleModal
          customerId={id}
          vehicle={editingVehicle}
          onClose={() => {
            setShowVehicleForm(false);
            setEditingVehicle(null);
          }}
          onSave={handleSaveVehicle}
        />
      )}

      {/* Bill detail modal */}
      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          items={billItems.filter((i) => i.bill_id === selectedBill.id)}
          customer={customer}
          vehicle={allVehicles.find((v) => v.id === selectedBill.vehicle_id)}
          onClose={() => setSelectedBill(null)}
          onExportPDF={() => exportPDF(selectedBill)}
          onSend={() => sendToCustomer(selectedBill)}
          onEdit={() => { setEditingBill(selectedBill); setShowBillForm(true); setSelectedBill(null); }}
          onStatusChange={(newStatus) => handleStatusChange(selectedBill, newStatus)}
          showToast={showToast}
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
function BillDetailModal({ bill, items, customer, vehicle, onClose, onExportPDF, onEdit, onStatusChange, onSend, showToast }) {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const handleResendWhatsApp = async () => {
    setSending(true);
    setSendError(null);
    try {
      const { sendWhatsApp } = await import("@/lib/whatsapp");
      const { formatCurrency } = await import("@/lib/helpers");
      sendWhatsApp(
        customer?.phone_number,
        customer?.name,
        `INV-${bill.bill_number}`,
        formatCurrency(bill.total_amount)
      );
      setSending(false);
    } catch (err) {
      setSendError(err.message);
      setSending(false);
    }
  };

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

      {/* Line Items Table — Desktop */}
      <div className="hidden sm:block">
        <table className="w-full text-sm mb-5">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 flat-label">#</th>
              <th className="text-left py-2 flat-label">Description</th>
              <th className="text-right py-2 flat-label">Qty</th>
              <th className="text-right py-2 flat-label">Unit Price</th>
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
      </div>

      {/* Line Items List — Mobile */}
      <div className="sm:hidden space-y-2 mb-5">
        <p className="flat-label mb-2">Items</p>
        {items.map((item, i) => (
          <div key={item.id ?? i} className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1 text-xs">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-gray-900 flex gap-2">
                <span className="text-gray-400">{i + 1}.</span>
                {item.description}
              </span>
              <span className="font-semibold text-gray-900 shrink-0">
                {formatCurrency(item.total_price)}
              </span>
            </div>
            <div className="text-gray-500 pl-4">
              Qty: {item.quantity} · Price: {formatCurrency(item.unit_price)}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex justify-between text-sm text-gray-500 mb-1.5">
          <span>Subtotal</span><span>{formatCurrency(bill.subtotal)}</span>
        </div>
        {bill.tax_amount > 0 && (
          <div className="flex justify-between text-sm text-gray-500 mb-1.5">
            <span>GST ({bill.gst_rate ?? 18}%)</span><span>{formatCurrency(bill.tax_amount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>Discount</span><span>-{formatCurrency(bill.discount)}</span>
        </div>
        <div className="flat-divider" />
        <div className="flex justify-between text-base font-bold text-gray-900 mt-2">
          <span>Total</span><span>{formatCurrency(bill.total_amount)}</span>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Status</span>
            <StatusSelect value={bill.status} onChange={onStatusChange} />
          </div>
          {bill.payment_method && (
            <p className="text-xs text-gray-400">
              Payment: <span className="capitalize font-medium text-gray-600">{bill.payment_method}</span>
            </p>
          )}
        </div>
      </div>

      {bill.payment_method === "online" && bill.status === "pending" && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">Awaiting online payment</p>
              <p className="text-[11px] text-amber-600 mt-0.5">Once confirmed, mark as paid via the status dropdown or resend the link.</p>
            </div>
            <button
              onClick={handleResendWhatsApp}
              disabled={sending}
              className="flat-btn text-xs shrink-0 disabled:opacity-50"
            >
              <Send size={13} strokeWidth={1.5} />
              {sending ? "Sending…" : "Resend Link"}
            </button>
          </div>
          {sendError && <p className="text-[11px] text-red-500">{sendError}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={onExportPDF} className="flat-btn"><Download size={14} strokeWidth={1.5} /> PDF</button>
        <button onClick={onEdit} className="flat-btn"><Pencil size={14} strokeWidth={1.5} /> Edit</button>
        {!(bill.payment_method === "online" && bill.status === "pending") && (
          <button onClick={onSend} className="flat-btn-primary"><Send size={14} strokeWidth={1.5} /> Send</button>
        )}
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
  const [discount, setDiscount]         = useState(bill?.discount || 0);
  const [notes, setNotes]               = useState(bill?.notes    || "");
  const [status, setStatus]             = useState(bill?.status   || "draft");
  const [paymentMethod, setPaymentMethod] = useState(bill?.payment_method || "cash");
  const [gstEnabled, setGstEnabled]     = useState(bill?.tax_amount > 0 ?? true);
  const [gstRate, setGstRate]           = useState(bill?.gst_rate ?? 18);

  const visibleVehicles = vehicles.filter((v) => v.customer_id === customerId);
  const addItem    = () => setItems((p) => [...p, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i, f, v) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [f]: v } : it));

  const subtotal    = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmount   = gstEnabled ? Math.round(subtotal * (gstRate / 100) * 100) / 100 : 0;
  const totalAmount = subtotal + taxAmount - discount;

  const derivedStatus = () => "pending";

  const buildBill = (overrideStatus) => {
    const billId     = bill?.id || generateId();
    const billNumber = bill?.bill_number || Math.max(1000, ...bills.map((b) => b.bill_number)) + 1;
    return {
      id: billId, bill_number: billNumber, customer_id: customerId, vehicle_id: vehicleId,
      subtotal, tax_amount: taxAmount, gst_enabled: gstEnabled, gst_rate: gstEnabled ? gstRate : 0,
      discount, total_amount: totalAmount, status: overrideStatus, payment_method: paymentMethod,
      notes, created_at: bill?.created_at || new Date().toISOString(),
    };
  };

  const buildItems = (billId) =>
    items.filter((i) => i.description.trim()).map((i) => ({
      id: generateId(), bill_id: billId, description: i.description,
      quantity: i.quantity, unit_price: i.unit_price, total_price: i.quantity * i.unit_price,
    }));

  const canSave = customerId && vehicleId && items.some((i) => i.description.trim());

  const handleSaveDraft = () => {
    if (!canSave) return;
    const savedBill = buildBill("draft");
    onSave({ bill: savedBill, items: buildItems(savedBill.id), isEditing });
  };

  const handleSave = () => {
    if (!canSave) return;
    const finalStatus = isEditing ? status : derivedStatus();
    const savedBill   = buildBill(finalStatus);
    const savedItems  = buildItems(savedBill.id);

    // Removed automatic WhatsApp sending - user will use Send button instead

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
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flat-avatar w-7 h-7 bg-white text-gray-500 border border-gray-100 shrink-0 text-xs">
                    {i + 1}
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)}
                    className="flat-input flex-1 sm:w-60 md:w-80"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    min="1"
                    onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                    className="flat-input w-20 shrink-0"
                  />
                  <input
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price || ""}
                    min="0"
                    onChange={(e) => updateItem(i, "unit_price", Number(e.target.value))}
                    className="flat-input flex-grow sm:w-28"
                  />
                  <div className="flex items-center gap-2 shrink-0 min-w-[80px] justify-end">
                    <span className="text-sm font-semibold text-gray-700 tabular-nums">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="flat-btn-ghost p-1 text-red-400">
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="flat-btn mt-2 text-xs"><Plus size={14} strokeWidth={1.5} /> Add Item</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flat-label block mb-1.5">Discount (₹)</label>
            <input type="number" value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} className="flat-input" min="0" />
          </div>
          <div>
            <label className="flat-label block mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="flat-input" placeholder="Optional…" />
          </div>
        </div>

        {/* GST */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">GST</p>
              <p className="text-xs text-gray-400 mt-0.5">Apply GST to this invoice</p>
            </div>
            <button
              type="button"
              onClick={() => setGstEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${gstEnabled ? "bg-accent" : "bg-gray-200"}`}
              aria-pressed={gstEnabled}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${gstEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {gstEnabled && (
            <div className="flex items-center gap-3">
              <label className="flat-label shrink-0">GST Rate (%)</label>
              <div className="flex gap-2 flex-wrap">
                {[5, 12, 18, 28].map((rate) => (
                  <button key={rate} type="button" onClick={() => setGstRate(rate)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${gstRate === rate ? "border-accent bg-accent/10 text-accent" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                    {rate}%
                  </button>
                ))}
                <input type="number" value={gstRate} min="0" max="100" onChange={(e) => setGstRate(Number(e.target.value))} className="flat-input !w-20 text-xs" placeholder="Custom" />
              </div>
            </div>
          )}
        </div>

        {/* Payment method */}
        <div>
          <label className="flat-label block mb-2">Payment Method</label>
          <div className="flex gap-2">
            {[
              { value: "cash",   label: "💵 Cash",   desc: isEditing ? null : "Status → Pending" },
              { value: "online", label: "📲 Online", desc: isEditing ? null : "Status → Pending" },
            ].map((opt) => (
              <button key={opt.value} type="button" onClick={() => setPaymentMethod(opt.value)}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-left transition-all ${paymentMethod === opt.value ? "border-amber-400 bg-amber-50 text-amber-800" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                <p className="text-sm font-medium">{opt.label}</p>
                {opt.desc && <p className="text-[11px] mt-0.5 opacity-70">{opt.desc}</p>}
              </button>
            ))}
          </div>
        </div>

        {/* Status — editing only */}
        {isEditing && (
          <div>
            <label className="flat-label block mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="flat-select">
              {["draft","pending","paid","cancelled"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}

        {/* Status preview — new bills */}
        {!isEditing && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2.5">
            <span>Invoice will be saved as</span>
            <span className="flat-pill font-semibold capitalize bg-amber-50 text-amber-700">pending</span>
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between text-sm text-gray-500 mb-1"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          {gstEnabled && <div className="flex justify-between text-sm text-gray-500 mb-1"><span>GST ({gstRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
          <div className="flex justify-between text-sm text-gray-500 mb-2"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
          <div className="flat-divider" />
          <div className="flex justify-between text-base font-bold text-gray-900 mt-2"><span>Total</span><span>{formatCurrency(totalAmount)}</span></div>
        </div>

        <div className="flex justify-end gap-2 flex-wrap">
          <button onClick={onClose} className="flat-btn">Cancel</button>
          {!isEditing && (
            <button onClick={handleSaveDraft} disabled={!canSave} className="flat-btn disabled:opacity-50">
              <FileText size={14} strokeWidth={1.5} /> Save as Draft
            </button>
          )}
          <button onClick={handleSave} disabled={!canSave} className="flat-btn-primary disabled:opacity-50">
            <Receipt size={14} strokeWidth={1.5} /> {isEditing ? "Save Changes" : "Create Invoice"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CustomerEditModal({ customer, onClose, onSave }) {
  const [name, setName]       = useState(customer.name || "");
  const [phone, setPhone]     = useState(customer.phone_number || "");
  const [email, setEmail]     = useState(customer.email || "");
  const [address, setAddress] = useState(customer.address || "");

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) return;
    onSave({ ...customer, name: name.trim(), phone_number: phone.trim(), email: email.trim(), address: address.trim() });
  };

  return (
    <Modal title="Edit Customer" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={name}    onChange={(e) => setName(e.target.value)}    className="flat-input" placeholder="Customer name" />
          <input value={phone}   onChange={(e) => setPhone(e.target.value)}   className="flat-input" placeholder="Phone number" />
          <input value={email}   onChange={(e) => setEmail(e.target.value)}   className="flat-input" placeholder="Email" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="flat-input" placeholder="Address" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}      className="flat-btn">Cancel</button>
          <button onClick={handleSubmit} className="flat-btn-primary">Save Changes</button>
        </div>
      </div>
    </Modal>
  );
}

function VehicleModal({ customerId, vehicle, onClose, onSave }) {
  const isEditing = Boolean(vehicle);
  const [vehicleNumber, setVehicleNumber] = useState(vehicle?.vehicle_number || "");
  const [make, setMake] = useState(vehicle?.make || "");
  const [model, setModel] = useState(vehicle?.model || "");
  const [year, setYear] = useState(vehicle?.year || "");
  const [color, setColor] = useState(vehicle?.color || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!vehicleNumber.trim()) {
      setError("Vehicle number is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveVehicle(
        {
          id: vehicle?.id,
          customer_id: customerId,
          vehicle_number: vehicleNumber,
          make: make || null,
          model: model || null,
          year: year ? Number(year) : null,
          color: color || null,
          original_vehicle_number: vehicle?.vehicle_number,
        },
        isEditing
      );
      onSave(saved, isEditing);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEditing ? "Edit Vehicle" : "Add Vehicle"} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-medium border border-red-100">
            {error}
          </div>
        )}
        <div>
          <label className="flat-label block mb-1">Vehicle Number *</label>
          <input
            type="text"
            required
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
            placeholder="e.g. GJ01AB1234"
            className="flat-input"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flat-label block mb-1">Make</label>
            <input
              type="text"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="e.g. Hyundai"
              className="flat-input"
            />
          </div>
          <div>
            <label className="flat-label block mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. i20"
              className="flat-input"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flat-label block mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2021"
              className="flat-input"
            />
          </div>
          <div>
            <label className="flat-label block mb-1">Color</label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="e.g. White"
              className="flat-input"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="flat-btn">Cancel</button>
          <button type="submit" disabled={saving} className="flat-btn-primary">
            {saving ? "Saving…" : "Save Vehicle"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
