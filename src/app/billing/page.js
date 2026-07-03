"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { SectionHeader, StatusBadge, StatusDot, EmptyState, Modal, StatusSelect, PageSkeleton, PhoneNumber } from "@/components/ui";
import {
  formatCurrency,
  formatDate,
  generateId,
  normalizeSearch,
  formatVehicleNumber,
  formatPhoneNumber,
} from "@/lib/helpers";
import { sendWhatsApp } from "@/lib/whatsapp";
import { exportInvoicePDF, generateInvoicePDF } from "@/lib/pdf";
import { supabase } from "@/lib/supabase";
import {
  loadWorkshopData,
  saveBillWithItems,
  saveCustomerWithVehicles,
  deleteBill,
} from "@/lib/workshop-data";
import {
  Plus,
  FileText,
  Download,
  Send,
  Trash2,
  Car,
  Receipt,
  Search,
  Pencil,
  UserPlus,
} from "lucide-react";

const TIME_FILTERS = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

function toDateKey(dateValue) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function billMatchesTimeFilter(bill, filter, customRange) {
  if (filter === "all") {
    return true;
  }

  const billDate = new Date(bill.created_at);
  const today = new Date();

  if (filter === "daily") {
    return toDateKey(billDate) === toDateKey(today);
  }

  if (filter === "monthly") {
    return billDate.getFullYear() === today.getFullYear() && billDate.getMonth() === today.getMonth();
  }

  if (filter === "yearly") {
    return billDate.getFullYear() === today.getFullYear();
  }

  if (filter === "custom") {
    const start = customRange.start ? new Date(customRange.start) : null;
    const end = customRange.end ? new Date(customRange.end) : null;
    const normalizedBill = new Date(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
    if (start && normalizedBill < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
    if (end && normalizedBill > new Date(end.getFullYear(), end.getMonth(), end.getDate())) return false;
  }

  return true;
}

function BillingPage() {
  const { user, loading } = useProtectedRoute();
  const searchParams = useSearchParams();
  const [bills, setBills] = useState([]);
  const [billItems, setBillItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [showBillForm, setShowBillForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteBill, setConfirmDeleteBill] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    let mounted = true;

    loadWorkshopData()
      .then((data) => {
        if (!mounted) return;
        setCustomers(data.customers || []);
        setVehicles(data.vehicles || []);
        setBills(data.bills || []);
        setBillItems(data.billItems || []);
      })
      .catch((error) => {
        if (!mounted) return;
        showToast(error.message);
      })
      .finally(() => {
        if (mounted) setLoadingData(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Auto-open bill from URL param (e.g. navigating from dashboard)
  useEffect(() => {
    const billId = searchParams.get("bill");
    if (!billId || loadingData || bills.length === 0) return;
    const match = bills.find((b) => b.id === billId);
    if (match) setSelectedBill(match);
  }, [searchParams, bills, loadingData]);

  if (loading || !user || loadingData) {
    return (
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <PageSkeleton variant="billing" />
      </div>
    );
  }

  const filteredBills = bills.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (!billMatchesTimeFilter(b, timeFilter, customRange)) return false;
    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery);
      const customer = customers.find((c) => c.id === b.customer_id);
      const vehicle = vehicles.find((v) => v.id === b.vehicle_id);
      return (
        normalizeSearch(`INV${b.bill_number}`).includes(q) ||
        normalizeSearch(customer?.name).includes(q) ||
        normalizeSearch(vehicle?.vehicle_number).includes(q)
      );
    }
    return true;
  });

  const openNewBillForm = () => {
    setEditingBill(null);
    setShowBillForm(true);
  };

  const openEditBillForm = (bill) => {
    setEditingBill(bill);
    setShowBillForm(true);
  };

  const exportPDF = async (bill) => {
    let pdfUrl = bill.pdf_url || null;

    if (pdfUrl) {
      window.open(`${pdfUrl}?t=${Date.now()}`, '_blank');
      showToast("Opening PDF...");
      return;
    }

    const customer = customers.find((c) => c.id === bill.customer_id);
    const vehicle  = vehicles.find((v) => v.id === bill.vehicle_id);
    const items    = billItems.filter((i) => i.bill_id === bill.id);

    try {
      showToast("Generating & storing invoice PDF...");
      const pdf = await generateInvoicePDF({ bill, items, customer, vehicle });
      if (pdf) {
        const pdfBlob = pdf.output("blob");

        if (supabase) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || "anonymous";
            const filePath = `${userId}/INV-${bill.bill_number}.pdf`;

            await supabase.storage.createBucket('invoices', { public: true }).catch(() => {});
            const { error: uploadError } = await supabase.storage
              .from('invoices')
              .upload(filePath, pdfBlob, {
                contentType: 'application/pdf',
                upsert: true,
                cacheControl: '0',
              });

            if (uploadError) {
              console.error("Storage upload failed on download fallback:", uploadError);
            } else {
              const { data: urlData } = supabase.storage
                .from('invoices')
                .getPublicUrl(filePath);
              pdfUrl = urlData?.publicUrl;

              // Save the pdf_url to the DB so it's cached for future use
              const billWithPdf = { ...bill, pdf_url: pdfUrl };
              const saved = await saveBillWithItems({ bill: billWithPdf, items: undefined, isEditing: true });
              
              // Update local state
              setBills((prev) => prev.map((b) => (b.id === bill.id ? saved.bill : b)));
            }
          } catch (storageErr) {
            console.error("Storage upload error on download fallback:", storageErr);
          }
        }

        // Trigger local download/open
        await exportInvoicePDF({ bill, items, customer, vehicle }, showToast);
      }
    } catch (err) {
      console.error("Failed to generate PDF on download fallback:", err);
      showToast("Failed to generate PDF.");
    }
  };

  const sendToCustomer = async (bill) => {
    const customer = customers.find((c) => c.id === bill.customer_id);
    const vehicle  = vehicles.find((v) => v.id === bill.vehicle_id);
    const items    = billItems.filter((i) => i.bill_id === bill.id);

    if (!customer?.phone_number) {
      showToast("No phone number on file for this customer.");
      return;
    }

    let pdfUrl = bill.pdf_url || null;
    let pdfBase64 = null;
    let pdfBlob = null;

    if (!pdfUrl) {
      showToast("No stored PDF found. Please save the invoice to generate it.");
      return;
    }

    try {
      showToast("Fetching stored PDF...");
      const response = await fetch(`${pdfUrl}?t=${Date.now()}`);
      if (!response.ok) throw new Error("Failed to fetch PDF from server.");
      pdfBlob = await response.blob();
      pdfBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });
    } catch (fetchErr) {
      console.error("Could not fetch cached PDF:", fetchErr);
      showToast("Failed to retrieve invoice PDF. Please save it again.");
      return;
    }

    let emailSent = null;
    let emailError = null;

    if (customer?.email) {
      try {
        showToast("Sending invoice email...");
        const { sendInvoiceEmail } = await import("@/lib/email");
        const resData = await sendInvoiceEmail({ bill, items, customer, vehicle, pdfBase64, pdfUrl });
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
              text: `Hello ${customer.name}, 👋\n\nThank you for choosing Shree Royal Car! We hope you had a great experience with our vehicle services. 🚗✨\n\nYour invoice INV-${bill.bill_number} has been generated:\n• Total Amount: ${formatCurrency(bill.total_amount)}\n\nBest regards,\nShree Royal Car Team`,
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
        sendWhatsApp(
          customer.phone_number,
          customer.name,
          `INV-${bill.bill_number}`,
          formatCurrency(bill.total_amount),
          pdfUrl // Pass the public storage URL so the customer can open the PDF link
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

  const handleMarkPaid = async (bill) => {
    const updatedBill = { ...bill, status: "paid" };
    try {
      const saved = await saveBillWithItems({ bill: updatedBill, isEditing: true });
      setBills((prev) => prev.map((b) => (b.id === bill.id ? saved.bill : b)));
      setSelectedBill(saved.bill);
      showToast("Invoice marked as paid");
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleStatusChange = async (bill, newStatus) => {
    if (bill.status === newStatus) return;
    if (newStatus === "partially_paid") {
      openEditBillForm(bill);
      return;
    }
    const updatedBill = { ...bill, status: newStatus };
    try {
      const saved = await saveBillWithItems({ bill: updatedBill, isEditing: true });
      setBills((prev) => prev.map((b) => (b.id === bill.id ? saved.bill : b)));
      if (selectedBill?.id === bill.id) setSelectedBill(saved.bill);
      showToast(`Status updated to ${newStatus}`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteBill = async (bill) => {
    try {
      await deleteBill(bill.id);
      setBills((prev) =>
        prev
          .filter((b) => b.id !== bill.id)
          .map((b) => {
            if (b.bill_number > bill.bill_number) {
              return { ...b, bill_number: b.bill_number - 1 };
            }
            return b;
          })
      );
      setBillItems((prev) => prev.filter((i) => i.bill_id !== bill.id));
      if (selectedBill?.id === bill.id) setSelectedBill(null);
      setConfirmDeleteBill(null);
      showToast(`INV-${bill.bill_number} deleted`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleSaveBill = async ({ bill, items, isEditing }) => {
    try {
      showToast(isEditing ? "Saving changes..." : "Saving invoice...");
      
      const customer = customers.find((c) => c.id === bill.customer_id);
      const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);

      if (isEditing) {
        // Edit flow:
        // 1. Save DB record immediately
        const saved = await saveBillWithItems({ bill, items, isEditing });
        const nextBill = saved.bill;
        const nextItems = saved.items || [];

        // 2. Instantly update UI and close modal
        setBills((prev) => prev.map((item) => (item.id === nextBill.id ? nextBill : item)));
        setBillItems((prev) => {
          const remaining = prev.filter((item) => item.bill_id !== nextBill.id);
          return [...remaining, ...nextItems];
        });
        setSelectedBill(nextBill);
        setShowBillForm(false);
        setEditingBill(null);
        showToast("Invoice updated");

        // 3. Generate & upload PDF in the background
        (async () => {
          try {
            const pdf = await generateInvoicePDF({ bill: nextBill, items: nextItems, customer, vehicle });
            if (pdf && supabase) {
              const pdfBlob = pdf.output("blob");
              const { data: { user } } = await supabase.auth.getUser();
              const userId = user?.id || "anonymous";
              const filePath = `${userId}/INV-${nextBill.bill_number}.pdf`;

              await supabase.storage.createBucket('invoices', { public: true }).catch(() => {});
              const { error: uploadError } = await supabase.storage
                .from('invoices')
                .upload(filePath, pdfBlob, {
                  contentType: 'application/pdf',
                  upsert: true,
                  cacheControl: '0',
                });

              if (!uploadError) {
                const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(filePath);
                const pdfUrl = urlData?.publicUrl;
                if (pdfUrl) {
                  const billWithPdf = { ...nextBill, pdf_url: pdfUrl };
                  const updatedSaved = await saveBillWithItems({ bill: billWithPdf, items: undefined, isEditing: true });
                  const finalBill = updatedSaved.bill;
                  setBills((prev) => prev.map((item) => (item.id === finalBill.id ? finalBill : item)));
                  setSelectedBill((prev) => prev?.id === finalBill.id ? finalBill : prev);
                  console.log("Background PDF generation & upload complete:", pdfUrl);
                }
              }
            }
          } catch (pdfErr) {
            console.error("Background PDF generation failed:", pdfErr.message);
          }
        })();

      } else {
        // Create flow:
        // 1. Save DB record immediately to get serial bill_number
        const saved = await saveBillWithItems({ bill, items, isEditing });
        const nextBill = saved.bill;
        const nextItems = saved.items || [];

        // 2. Instantly update UI and close modal
        setBills((prev) => [nextBill, ...prev]);
        setBillItems((prev) => [...prev, ...nextItems]);
        setSelectedBill(nextBill);
        setShowBillForm(false);
        setEditingBill(null);
        showToast("Invoice created successfully");

        // 3. Generate & upload PDF in the background
        (async () => {
          try {
            const pdf = await generateInvoicePDF({ bill: nextBill, items: nextItems, customer, vehicle });
            if (pdf && supabase) {
              const pdfBlob = pdf.output("blob");
              const { data: { user } } = await supabase.auth.getUser();
              const userId = user?.id || "anonymous";
              const filePath = `${userId}/INV-${nextBill.bill_number}.pdf`;

              await supabase.storage.createBucket('invoices', { public: true }).catch(() => {});
              const { error: uploadError } = await supabase.storage
                .from('invoices')
                .upload(filePath, pdfBlob, {
                  contentType: 'application/pdf',
                  upsert: true,
                  cacheControl: '0',
                });

              if (!uploadError) {
                const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(filePath);
                const pdfUrl = urlData?.publicUrl;
                if (pdfUrl) {
                  const billWithPdf = { ...nextBill, pdf_url: pdfUrl };
                  const updatedSaved = await saveBillWithItems({ bill: billWithPdf, items: undefined, isEditing: true });
                  const finalBill = updatedSaved.bill;
                  setBills((prev) => prev.map((item) => (item.id === finalBill.id ? finalBill : item)));
                  setSelectedBill((prev) => prev?.id === finalBill.id ? finalBill : prev);
                  console.log("Background PDF generation & upload complete:", pdfUrl);
                }
              }
            }
          } catch (pdfErr) {
            console.error("Background PDF generation failed:", pdfErr.message);
          }
        })();
      }
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleCreateCustomer = async (customer, newVehicles) => {
    try {
      const created = await saveCustomerWithVehicles({ customer, vehicles: newVehicles });
      setCustomers((prev) => [created.customer, ...prev]);
      setVehicles((prev) => [...created.vehicles, ...prev]);
      return created;
    } catch (error) {
      showToast(error.message);
      return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-7">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6 animate-fade-in">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
              <p className="text-xs text-gray-400 mt-1">
                Manage invoices, filter records, and edit bills
              </p>
            </div>
            <button onClick={openNewBillForm} className="flat-btn-primary">
              <Plus size={15} strokeWidth={1.5} /> New Invoice
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-end gap-3 mb-5 animate-fade-in">
            <div className="flex-1 min-w-[200px] relative">
              <label className="flat-label block mb-1">Search</label>
              <Search size={15} strokeWidth={1.5} className="absolute left-3 bottom-[11px] text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoices…"
                className="flat-input !pl-9"
              />
            </div>
            <div className="w-full sm:w-auto sm:min-w-[170px]">
              <label className="flat-label block mb-1">Time Period</label>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="flat-select"
              >
                {TIME_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[170px]">
              <label className="flat-label block mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flat-select capitalize"
              >
                {[
                  { value: "all", label: "All" },
                  { value: "draft", label: "Draft" },
                  { value: "pending", label: "Pending" },
                  { value: "partially_paid", label: "Partially Paid" },
                  { value: "paid", label: "Paid" },
                  { value: "cancelled", label: "Cancelled" },
                ].map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            {timeFilter === "custom" && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="flat-input !w-auto"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="flat-input !w-auto"
                />
              </div>
            )}
          </div>

          {/* Bills */}
          {filteredBills.length === 0 ? (
            <EmptyState icon={FileText} title="No invoices found" description="Try adjusting your filters or create a new invoice." />
          ) : (
            <>
              {/* Desktop view: Table */}
              <div className="hidden md:block flat-card p-0 overflow-hidden animate-fade-in">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-5 flat-label">Invoice</th>
                      <th className="text-left py-3 px-5 flat-label hidden sm:table-cell">Customer</th>
                      <th className="text-left py-3 px-5 flat-label hidden md:table-cell">Vehicle</th>
                      <th className="text-left py-3 px-5 flat-label hidden lg:table-cell">Date</th>
                      <th className="text-center py-3 px-5 flat-label">Status</th>
                      <th className="text-right py-3 px-5 flat-label">Amount</th>
                      <th className="text-right py-3 px-5 flat-label">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills
                      .sort((a, b) => b.bill_number - a.bill_number)
                      .map((bill) => {
                        const customer = customers.find((c) => c.id === bill.customer_id);
                        const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
                        return (
                          <tr
                            key={bill.id}
                            onClick={() => setSelectedBill(bill)}
                            className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-5 font-medium text-gray-900 whitespace-nowrap">
                              INV-{bill.bill_number}
                            </td>
                            <td className="py-3 px-5 text-gray-600 hidden sm:table-cell">
                              {customer?.name}
                            </td>
                            <td className="py-3 px-5 text-gray-500 hidden md:table-cell">
                              <div className="flex flex-col">
                                <span className="inline-flex items-center gap-1">
                                  <Car size={12} strokeWidth={1.5} className="text-gray-400" />
                                  {formatVehicleNumber(vehicle?.vehicle_number)}
                                </span>
                                {bill.kms_run && (
                                  <span className="text-[10px] text-gray-400 pl-4">
                                    {Number(bill.kms_run).toLocaleString("en-IN")} km
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-5 text-gray-400 hidden lg:table-cell text-xs">
                              {formatDate(bill.created_at)}
                            </td>
                            <td className="py-3 px-5 text-center" onClick={(e) => e.stopPropagation()}>
                              <StatusSelect
                                value={bill.status}
                                onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                                stopPropagation
                              />
                            </td>
                            <td className="py-3 px-5 text-right font-semibold text-gray-900 tabular-nums">
                              {bill.status === "partially_paid" ? (
                                <div className="flex flex-col items-end text-xs font-normal">
                                  <span className="text-gray-900 font-semibold text-sm">{formatCurrency(bill.total_amount)}</span>
                                  <span className="text-[10px] text-green-600">Paid: {formatCurrency(bill.paid_amount)}</span>
                                  <span className="text-[10px] text-amber-600 font-medium">Remaining: {formatCurrency(Math.max(0, bill.total_amount - bill.paid_amount))}</span>
                                </div>
                              ) : (
                                formatCurrency(bill.total_amount)
                              )}
                            </td>
                            <td className="py-3 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-0.5">
                                <button onClick={() => openEditBillForm(bill)} className="flat-btn-ghost p-1.5" title="Edit"><Pencil size={15} strokeWidth={1.5} /></button>
                                <button onClick={() => exportPDF(bill)} className="flat-btn-ghost p-1.5" title="PDF"><Download size={15} strokeWidth={1.5} /></button>
                                <button onClick={() => sendToCustomer(bill)} className="flat-btn-ghost p-1.5 text-accent" title="Send"><Send size={15} strokeWidth={1.5} /></button>
                                <button onClick={() => setConfirmDeleteBill(bill)} className="flat-btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={15} strokeWidth={1.5} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Mobile view: Card List */}
              <div className="md:hidden space-y-3 animate-fade-in">
                {filteredBills
                  .sort((a, b) => b.bill_number - a.bill_number)
                  .map((bill) => {
                    const customer = customers.find((c) => c.id === bill.customer_id);
                    const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
                    return (
                      <div
                        key={bill.id}
                        onClick={() => setSelectedBill(bill)}
                        className="flat-card flex flex-col gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 text-sm">INV-{bill.bill_number}</span>
                          <div onClick={(e) => e.stopPropagation()}>
                            <StatusSelect
                              value={bill.status}
                              onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                              stopPropagation
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-700 font-medium">{customer?.name || "—"}</p>
                          {vehicle && (
                            <p className="text-[11px] text-gray-500 flex items-center gap-1">
                              <Car size={10} strokeWidth={1.5} className="text-gray-400" />
                              {formatVehicleNumber(vehicle.vehicle_number)} · {vehicle.make} {vehicle.model}
                              {bill.kms_run && ` · ${Number(bill.kms_run).toLocaleString("en-IN")} km`}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-400">{formatDate(bill.created_at)}</p>
                        </div>
                        <div className="flat-divider my-0.5" />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase tracking-wider">Total</p>
                            <p className="text-sm font-bold text-gray-900 mt-0.5 tabular-nums">
                              {bill.status === "partially_paid" ? (
                                <span className="flex flex-col items-start text-xs font-normal">
                                  <span className="text-gray-900 font-bold text-sm">{formatCurrency(bill.total_amount)}</span>
                                  <span className="text-[10px] text-green-600">Paid: {formatCurrency(bill.paid_amount)}</span>
                                  <span className="text-[10px] text-amber-600 font-medium">Remaining: {formatCurrency(Math.max(0, bill.total_amount - bill.paid_amount))}</span>
                                </span>
                              ) : (
                                formatCurrency(bill.total_amount)
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => openEditBillForm(bill)} className="flat-btn-ghost p-1.5" title="Edit"><Pencil size={14} strokeWidth={1.5} /></button>
                            <button onClick={() => exportPDF(bill)} className="flat-btn-ghost p-1.5" title="PDF"><Download size={14} strokeWidth={1.5} /></button>
                            <button onClick={() => sendToCustomer(bill)} className="flat-btn-ghost p-1.5 text-accent" title="Send"><Send size={14} strokeWidth={1.5} /></button>
                            <button onClick={() => setConfirmDeleteBill(bill)} className="flat-btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={14} strokeWidth={1.5} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </main>

      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          items={billItems.filter((i) => i.bill_id === selectedBill.id)}
          customers={customers}
          vehicles={vehicles}
          onClose={() => setSelectedBill(null)}
          onExportPDF={() => exportPDF(selectedBill)}
          onSend={() => sendToCustomer(selectedBill)}
          onEdit={() => openEditBillForm(selectedBill)}
          onMarkPaid={() => handleMarkPaid(selectedBill)}
          onStatusChange={(newStatus) => handleStatusChange(selectedBill, newStatus)}
          showToast={showToast}
        />
      )}
      {showBillForm && (
        <CreateBillModal
          key={editingBill?.id || "new-bill"}
          customers={customers}
          vehicles={vehicles}
          bill={editingBill}
          billItems={billItems.filter((item) => item.bill_id === editingBill?.id)}
          allBillItems={billItems}
          onClose={() => setShowBillForm(false)}
          onSave={handleSaveBill}
          onCreateCustomer={handleCreateCustomer}
          bills={bills}
        />
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white rounded-xl shadow-dropdown px-4 py-2.5 text-sm font-medium animate-slide-in">
          {toast}
        </div>
      )}

      {confirmDeleteBill && (
        <Modal title="Delete Invoice" onClose={() => setConfirmDeleteBill(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Delete <strong>INV-{confirmDeleteBill.bill_number}</strong>? This will permanently remove
              the invoice and all its line items. This cannot be undone.
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

function BillDetailModal({ bill, items, customers, vehicles, onClose, onExportPDF, onSend, onEdit, onMarkPaid, onStatusChange, showToast }) {
  const customer = customers.find((c) => c.id === bill.customer_id);
  const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
  const isOnlinePending = bill.payment_method === "online" && bill.status === "pending";
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const handleResendWhatsApp = async () => {
    setSending(true);
    setSendError(null);
    try {
      sendWhatsApp(
        customer?.phone_number,
        customer?.name,
        `INV-${bill.bill_number}`,
        formatCurrency(bill.total_amount),
        bill.pdf_url
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
          <p className="text-xs text-gray-400 mt-0.5">
            <PhoneNumber phone={customer?.phone_number} display={formatPhoneNumber(customer?.phone_number)} />
          </p>
          <p className="text-xs text-gray-400">{customer?.address}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="flat-label mb-2">Vehicle</p>
          <p className="text-sm font-medium text-gray-900">{formatVehicleNumber(vehicle?.vehicle_number)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{vehicle?.make} {vehicle?.model} ({vehicle?.year})</p>
          <p className="text-xs text-gray-400">{vehicle?.color}</p>
          {bill.kms_run && (
            <p className="text-xs font-semibold text-gray-700 mt-1.5">
              Odometer: {Number(bill.kms_run).toLocaleString("en-IN")} km
            </p>
          )}
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
          <span>Total Amount</span><span>{formatCurrency(bill.total_amount)}</span>
        </div>
        {bill.paid_amount > 0 && (
          <>
            <div className="flex justify-between text-sm text-gray-500 mt-1">
              <span>Amount Paid</span><span>{formatCurrency(bill.paid_amount)}</span>
            </div>
            {bill.payment_history && Array.isArray(bill.payment_history) && bill.payment_history.length > 0 && (
              <div className="mt-1.5 pl-3 border-l-2 border-gray-200 space-y-1">
                {bill.payment_history.map((pay, pIdx) => (
                  <div key={pIdx} className="flex justify-between text-xs text-gray-400 tabular-nums">
                    <span>{formatDate(pay.date)}</span>
                    <span>{formatCurrency(pay.amount)} {pay.method ? `(${pay.method})` : ""}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flat-divider my-1.5" />
            <div className="flex justify-between text-sm font-bold text-blue-600">
              <span>Amount Remaining</span><span>{formatCurrency(Math.max(0, bill.total_amount - bill.paid_amount))}</span>
            </div>
          </>
        )}
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

      {/* Online pending — action strip */}
      {isOnlinePending && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">Awaiting online payment</p>
              <p className="text-[11px] text-amber-600 mt-0.5">Once confirmed, mark as paid manually or resend the link.</p>
            </div>
            <button
              onClick={handleResendWhatsApp}
              disabled={sending}
              className="flat-btn text-xs shrink-0 disabled:opacity-50"
            >
              <Send size={13} strokeWidth={1.5} />
              {sending ? "Sending…" : "Resend Link"}
            </button>
            <button onClick={onMarkPaid} className="flat-btn-primary text-xs shrink-0">
              ✓ Mark Paid
            </button>
          </div>
          {sendError && (
            <p className="text-[11px] text-red-500">{sendError}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={onExportPDF} className="flat-btn"><Download size={14} strokeWidth={1.5} /> PDF</button>
        <button onClick={onEdit} className="flat-btn"><Pencil size={14} strokeWidth={1.5} /> Edit</button>
        {!isOnlinePending && (
          <button onClick={onSend} className="flat-btn-primary"><Send size={14} strokeWidth={1.5} /> Send</button>
        )}
      </div>
    </Modal>
  );
}

function CreateBillModal({ customers, vehicles, bills, bill, billItems, allBillItems, onClose, onSave, onCreateCustomer }) {
  const isEditing = Boolean(bill);
  const [customerId, setCustomerId] = useState(bill?.customer_id || "");
  const [vehicleId, setVehicleId] = useState(bill?.vehicle_id || "");
  const [items, setItems] = useState(
    billItems.length
      ? billItems.map((item) => ({ description: item.description, quantity: item.quantity, unit_price: item.unit_price }))
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [discount, setDiscount] = useState(bill?.discount || 0);
  const [paymentHistory, setPaymentHistory] = useState(
    bill?.payment_history && Array.isArray(bill.payment_history)
      ? bill.payment_history
      : bill?.paid_amount > 0
      ? [{ date: bill.created_at || new Date().toISOString(), amount: bill.paid_amount, method: bill.payment_method || "cash" }]
      : []
  );
  const paidAmount = paymentHistory.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const [notes, setNotes] = useState(bill?.notes || "");
  const [kmsRun, setKmsRun] = useState(bill?.kms_run || "");
  const [status, setStatus] = useState(bill?.status || "draft");
  const [billDate, setBillDate] = useState(
    bill?.created_at
      ? new Date(bill.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [gstEnabled, setGstEnabled] = useState(bill?.tax_amount > 0 ?? true);
  const [gstRate, setGstRate] = useState(bill?.gst_rate ?? 18);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerVehicles, setCustomerVehicles] = useState([
    { vehicle_number: "", make: "", model: "", year: "", color: "" },
  ]);

  const shouldFocusNewItem = useRef(false);
  const selectEnterCount = useRef({ customer: 0, vehicle: 0 });

  useEffect(() => {
    if (shouldFocusNewItem.current) {
      const nextEl = document.querySelector(`[data-nav="item-desc-${items.length - 1}"]`);
      if (nextEl) {
        nextEl.focus();
        shouldFocusNewItem.current = false;
      }
    }
  }, [items.length]);

  const visibleVehicles = vehicles.filter((vehicle) => vehicle.customer_id === customerId);
  const addItem = () => {
    setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0 }]);
  };
  const removeItem = (index) => setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  const updateItem = (index, field, value) =>
    setItems((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));

  const addCustomerVehicle = () => {
    setCustomerVehicles((prev) => [...prev, { vehicle_number: "", make: "", model: "", year: "", color: "" }]);
  };

  const removeCustomerVehicle = (index) => {
    setCustomerVehicles((prev) => prev.filter((_, vehicleIndex) => vehicleIndex !== index));
  };

  const updateCustomerVehicle = (index, field, value) => {
    setCustomerVehicles((prev) => prev.map((vehicle, vehicleIndex) => (vehicleIndex === index ? { ...vehicle, [field]: value } : vehicle)));
  };

  const baseServices = [
    "Full Body Wash & Vacuum",
    "Engine Oil Change",
    "Oil Filter Replacement",
    "Brake Pad Replacement",
    "AC Gas Charging & Service",
    "Wheel Alignment & Balancing",
    "Interior Detailing & Polish",
    "Teflon / Ceramic Coating",
    "Coolant Flush & Top-Up",
    "Wiper Blade Replacement",
    "Battery Health Check & Replace",
    "Bumper Denting & Painting",
    "Scratch & Swirl Removal",
    "Spark Plug Replacement",
    "Air Filter Replacement",
  ];

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const carModel = selectedVehicle?.model ? selectedVehicle.model.trim() : "";

  const suggestions = [];
  if (carModel) {
    suggestions.push(
      `${carModel} Engine Oil Change`,
      `${carModel} Oil Filter Replacement`,
      `${carModel} Brake Pad Replacement`,
      `${carModel} AC Filter Replacement`,
      `${carModel} Bumper Denting & Painting`,
      `${carModel} Spark Plug Replacement`
    );
  }
  if (allBillItems) {
    allBillItems.forEach((item) => {
      const desc = item.description?.trim();
      if (desc && !baseServices.includes(desc) && !suggestions.includes(desc)) {
        suggestions.push(desc);
      }
    });
  }
  baseServices.forEach((service) => {
    if (!suggestions.includes(service)) {
      suggestions.push(service);
    }
  });

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = gstEnabled ? Math.round(subtotal * (gstRate / 100) * 100) / 100 : 0;
  const totalAmount = subtotal + taxAmount - discount;

  useEffect(() => {
    if (status !== "draft" && status !== "cancelled") {
      if (paidAmount >= totalAmount && totalAmount > 0) {
        setStatus("paid");
      } else if (paidAmount > 0) {
        setStatus("partially_paid");
      } else {
        setStatus("pending");
      }
    }
  }, [paidAmount, totalAmount]);

  // Both cash and online start as pending — user marks paid manually
  const derivedStatus = () => "pending";

  const buildBill = (overrideStatus) => {
    const billId = bill?.id || generateId();
    const normalizedBillNumber = bill?.bill_number || (bills && bills.length > 0 ? Math.max(0, ...bills.map((entry) => entry.bill_number)) + 1 : 1);
    
    let finalStatus = overrideStatus;
    if (finalStatus === "paid" || finalStatus === "partially_paid" || finalStatus === "pending") {
      if (paidAmount >= totalAmount) {
        finalStatus = "paid";
      } else if (paidAmount > 0) {
        finalStatus = "partially_paid";
      } else {
        finalStatus = "pending";
      }
    }

    return {
      id: billId,
      bill_number: normalizedBillNumber,
      customer_id: customerId,
      vehicle_id: vehicleId,
      kms_run: kmsRun ? Number(kmsRun) : null,
      subtotal,
      tax_amount: taxAmount,
      gst_enabled: gstEnabled,
      gst_rate: gstEnabled ? gstRate : 0,
      discount,
      total_amount: totalAmount,
      status: finalStatus,
      payment_method: null,
      paid_amount: paidAmount,
      notes,
      payment_history: paymentHistory,
      created_at: billDate
        ? new Date(billDate + "T00:00:00").toISOString()
        : bill?.created_at || new Date().toISOString(),
    };
  };

  const buildItems = (billId) =>
    items
      .filter((item) => item.description.trim())
      .map((item) => ({
        id: generateId(),
        bill_id: billId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
      }));

  const canSave = customerId && vehicleId && items.some((item) => item.description.trim());

  const handleSaveDraft = () => {
    if (!canSave) return;
    const savedBill = buildBill("draft");
    onSave({ bill: savedBill, items: buildItems(savedBill.id), isEditing });
  };

  const handleSave = () => {
    if (!canSave) return;
    const finalStatus = isEditing ? status : derivedStatus();
    const savedBill = buildBill(finalStatus);
    const savedItems = buildItems(savedBill.id);

    // Removed automatic WhatsApp sending - user will use Send button instead

    onSave({ bill: savedBill, items: savedItems, isEditing });
  };

  const handleKeyDown = (e) => {
    // Check if Numpad Plus was pressed
    if (e.code === "NumpadAdd") {
      e.preventDefault();
      addItem();
      shouldFocusNewItem.current = true;
      return;
    }

    if (e.key === "Enter") {
      const target = e.target;
      const nav = target.getAttribute("data-nav");
      
      // Don't intercept Enter if it's not one of our tracked inputs
      if (!nav) return;

      // Handle dropdowns (Customer and Vehicle)
      if (nav === "customer" || nav === "vehicle") {
        if (!selectEnterCount.current[nav]) {
          // First Enter on select: let it open, set count to 1
          selectEnterCount.current[nav] = 1;
        } else {
          // Second Enter on select: move to next
          e.preventDefault();
          selectEnterCount.current[nav] = 0;
          
          if (nav === "customer") {
            const nextEl = document.querySelector('[data-nav="vehicle"]');
            if (nextEl) nextEl.focus();
          } else if (nav === "vehicle") {
            const nextEl = document.querySelector('[data-nav="billDate"]');
            if (nextEl) nextEl.focus();
          }
        }
        return;
      }

      e.preventDefault();

      if (nav === "billDate") {
        const nextEl = document.querySelector('[data-nav="kmsRun"]');
        if (nextEl) nextEl.focus();
      } else if (nav === "kmsRun") {
        const nextEl = document.querySelector('[data-nav="item-desc-0"]');
        if (nextEl) nextEl.focus();
      } else if (nav.startsWith("item-desc-")) {
        const idx = parseInt(nav.replace("item-desc-", ""), 10);
        const nextEl = document.querySelector(`[data-nav="item-qty-${idx}"]`);
        if (nextEl) nextEl.focus();
      } else if (nav.startsWith("item-qty-")) {
        const idx = parseInt(nav.replace("item-qty-", ""), 10);
        const nextEl = document.querySelector(`[data-nav="item-price-${idx}"]`);
        if (nextEl) nextEl.focus();
      } else if (nav.startsWith("item-price-")) {
        const idx = parseInt(nav.replace("item-price-", ""), 10);
        const nextEl = document.querySelector(`[data-nav="item-desc-${idx + 1}"]`);
        if (nextEl) {
          nextEl.focus();
        } else {
          const discountEl = document.querySelector('[data-nav="discount"]');
          if (discountEl) discountEl.focus();
        }
      } else if (nav === "discount") {
        const nextEl = document.querySelector('[data-nav="paidAmount"]');
        if (nextEl) nextEl.focus();
      } else if (nav === "paidAmount") {
        const nextEl = document.querySelector('[data-nav="notes"]');
        if (nextEl) nextEl.focus();
      } else if (nav === "notes") {
        if (canSave) {
          handleSave();
        }
      }
    }
  };

  const handleCreateCustomer = async () => {
    if (!customerName.trim() || !customerPhone.trim()) return;

    const validVehicles = customerVehicles.filter((vehicle) => vehicle.vehicle_number.trim());
    if (!validVehicles.length) return;

    const customerIdValue = generateId();
    const newCustomer = {
      id: customerIdValue,
      name: customerName.trim(),
      phone_number: customerPhone.trim(),
      email: customerEmail.trim(),
      address: customerAddress.trim(),
      created_at: new Date().toISOString(),
    };

    const vehiclesForCustomer = validVehicles.map((vehicle) => ({
      id: generateId(),
      customer_id: customerIdValue,
      vehicle_number: vehicle.vehicle_number.trim(),
      make: vehicle.make.trim(),
      model: vehicle.model.trim(),
      year: vehicle.year ? Number(vehicle.year) : null,
      color: vehicle.color.trim(),
    }));

    const duplicateVehicle = vehiclesForCustomer.some((vehicle) => vehicles.some((existing) => existing.vehicle_number === vehicle.vehicle_number));
    if (duplicateVehicle) return;

    const created = await onCreateCustomer(newCustomer, vehiclesForCustomer);
    if (!created) return;
    setCustomerId(created.customer.id);
    setVehicleId(created.vehicles[0]?.id || "");
    setShowCustomerForm(false);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setCustomerAddress("");
    setCustomerVehicles([{ vehicle_number: "", make: "", model: "", year: "", color: "" }]);
  };

  return (
    <Modal title={isEditing ? "Edit Invoice" : "Create New Invoice"} onClose={onClose} wide>
      <div className="space-y-5" onKeyDown={handleKeyDown}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flat-label mb-1">Customer</p>
            <p className="text-xs text-gray-400">A customer can own multiple cars, but each car belongs to one customer only.</p>
          </div>
          <button onClick={() => setShowCustomerForm((prev) => !prev)} className="flat-btn text-xs">
            <UserPlus size={14} strokeWidth={1.5} /> Add New Customer
          </button>
        </div>

        {showCustomerForm && (
          <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="flat-input" placeholder="Customer name" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="flat-input" placeholder="Phone number" />
              <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="flat-input" placeholder="Email" />
              <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="flat-input" placeholder="Address" />
            </div>

            <div className="space-y-2">
              {customerVehicles.map((vehicle, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input value={vehicle.vehicle_number} onChange={(e) => updateCustomerVehicle(index, "vehicle_number", e.target.value)} className="flat-input sm:col-span-2" placeholder="Car number" />
                  <input value={vehicle.make} onChange={(e) => updateCustomerVehicle(index, "make", e.target.value)} className="flat-input" placeholder="Make" />
                  <input value={vehicle.model} onChange={(e) => updateCustomerVehicle(index, "model", e.target.value)} className="flat-input" placeholder="Model" />
                  <div className="flex items-center gap-2">
                    <input value={vehicle.year} onChange={(e) => updateCustomerVehicle(index, "year", e.target.value)} className="flat-input" placeholder="Year" />
                    {customerVehicles.length > 1 && (
                      <button onClick={() => removeCustomerVehicle(index)} className="flat-btn-ghost p-2 text-red-400">
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={addCustomerVehicle} className="flat-btn text-xs">
                <Plus size={14} strokeWidth={1.5} /> Add Another Car
              </button>
              <button onClick={handleCreateCustomer} className="flat-btn-primary text-xs">
                Create Customer
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flat-label block mb-1.5">Customer</label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setVehicleId("");
              }}
              onFocus={() => { selectEnterCount.current.customer = 0; }}
              data-nav="customer"
              className="flat-select"
            >
              <option value="">Select customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.phone_number})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flat-label block mb-1.5">Vehicle</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              onFocus={() => { selectEnterCount.current.vehicle = 0; }}
              data-nav="vehicle"
              className="flat-select"
              disabled={!customerId}
            >
              <option value="">Select vehicle…</option>
              {visibleVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {formatVehicleNumber(vehicle.vehicle_number)} — {vehicle.make} {vehicle.model}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flat-label block mb-1.5">Invoice Date</label>
            <input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              data-nav="billDate"
              className="flat-input"
            />
          </div>
          <div>
            <label className="flat-label block mb-1.5">Odometer (km)</label>
            <input
              type="number"
              value={kmsRun || ""}
              onChange={(e) => setKmsRun(e.target.value ? Number(e.target.value) : "")}
              data-nav="kmsRun"
              className="flat-input"
              min="0"
              placeholder="e.g. 45000"
            />
          </div>
        </div>

        <div>
          <label className="flat-label block mb-2">Line Items</label>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-2 p-3 bg-gray-50 rounded-xl items-start sm:items-center">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flat-avatar w-7 h-7 bg-white text-gray-500 border border-gray-100 shrink-0 text-xs">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(index, "description", e.target.value)}
                    data-nav={`item-desc-${index}`}
                    className="flat-input flex-1 sm:w-60 md:w-80"
                    list={`suggestions-${index}`}
                  />
                  <datalist id={`suggestions-${index}`}>
                    {suggestions.map((sug, sIdx) => (
                      <option key={sIdx} value={sug} />
                    ))}
                  </datalist>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    min="1"
                    onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                    data-nav={`item-qty-${index}`}
                    className="flat-input flex-1 sm:w-20"
                  />
                  <input
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price || ""}
                    min="0"
                    onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                    data-nav={`item-price-${index}`}
                    className="flat-input flex-2 sm:w-28"
                  />
                  <div className="flex items-center gap-2 shrink-0 min-w-[80px] justify-end">
                    <span className="text-sm font-semibold text-gray-700 tabular-nums">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(index)} className="flat-btn-ghost p-1 text-red-400">
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

        <div className="space-y-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex justify-between items-center">
            <span className="flat-label block">Payment Parts / History</span>
            <button
              type="button"
              onClick={() => setPaymentHistory(prev => [...prev, { date: new Date().toISOString().slice(0, 10), amount: 0, method: "cash" }])}
              className="flat-btn text-xs px-2 py-1"
            >
              + Add Payment Part
            </button>
          </div>
          {paymentHistory.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {paymentHistory.map((pay, pIdx) => (
                <div key={pIdx} className="flex gap-2 items-center flex-wrap sm:flex-nowrap bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm">
                  <input
                    type="date"
                    value={pay.date ? pay.date.slice(0, 10) : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPaymentHistory(prev => prev.map((p, idx) => idx === pIdx ? { ...p, date: val ? new Date(val + "T12:00:00").toISOString() : p.date } : p));
                    }}
                    className="flat-input text-xs !w-full sm:!w-40"
                  />
                  <input
                    type="number"
                    placeholder="Amount (₹)"
                    value={pay.amount || ""}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPaymentHistory(prev => prev.map((p, idx) => idx === pIdx ? { ...p, amount: val } : p));
                    }}
                    className="flat-input text-xs !w-full sm:!w-32"
                    min="0"
                  />
                  <select
                    value={pay.method || "cash"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPaymentHistory(prev => prev.map((p, idx) => idx === pIdx ? { ...p, method: val } : p));
                    }}
                    className="flat-select text-xs !w-full sm:!w-32 capitalize"
                  >
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPaymentHistory(prev => prev.filter((_, idx) => idx !== pIdx))}
                    className="flat-btn-ghost p-1.5 text-red-500 hover:bg-red-50"
                    title="Delete Payment Part"
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flat-label block mb-1.5">Discount (₹)</label>
            <input
              type="number"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
              data-nav="discount"
              className="flat-input"
              min="0"
            />
          </div>
          <div>
            <label className="flat-label block mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-nav="notes"
              className="flat-input"
              placeholder="Optional…"
            />
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                gstEnabled ? "bg-accent" : "bg-gray-200"
              }`}
              aria-pressed={gstEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  gstEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {gstEnabled && (
            <div className="flex items-center gap-3">
              <label className="flat-label shrink-0">GST Rate (%)</label>
              <div className="flex gap-2 flex-wrap">
                {[5, 12, 18, 28].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setGstRate(rate)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      gstRate === rate
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
                <input
                  type="number"
                  value={gstRate}
                  min="0"
                  max="100"
                  onChange={(e) => setGstRate(Number(e.target.value))}
                  className="flat-input !w-20 text-xs"
                  placeholder="Custom"
                />
              </div>
            </div>
          )}
        </div>

        {/* Status — only shown when editing */}
        {isEditing && (
          <div>
            <label className="flat-label block mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => {
                const newStatus = e.target.value;
                setStatus(newStatus);
                if (newStatus === "paid") {
                  setPaymentHistory([{ date: new Date().toISOString(), amount: totalAmount, method: bill?.payment_method || "cash" }]);
                } else if (newStatus === "pending" || newStatus === "draft" || newStatus === "cancelled") {
                  setPaymentHistory([]);
                } else if (newStatus === "partially_paid") {
                  if (paidAmount <= 0 || paidAmount >= totalAmount) {
                    setPaymentHistory([{ date: new Date().toISOString(), amount: Math.round((totalAmount / 2) * 100) / 100, method: bill?.payment_method || "cash" }]);
                  }
                }
              }}
              className="flat-select capitalize"
            >
              {["draft", "pending", "partially_paid", "paid", "cancelled"].map((v) => (
                <option key={v} value={v}>{v === 'partially_paid' ? 'partially paid' : v}</option>
              ))}
            </select>
          </div>
        )}

        {/* Status preview for new bills */}
        {!isEditing && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2.5">
            <span>Invoice will be saved as</span>
            <span className={`flat-pill font-semibold capitalize ${
              paidAmount >= totalAmount
                ? "bg-green-50 text-green-700"
                : paidAmount > 0
                ? "bg-blue-50 text-blue-700"
                : "bg-amber-50 text-amber-700"
            }`}>
              {paidAmount >= totalAmount ? "paid" : paidAmount > 0 ? "partially paid" : "pending"}
            </span>
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between text-sm text-gray-500 mb-1"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          {gstEnabled && (
            <div className="flex justify-between text-sm text-gray-500 mb-1"><span>GST ({gstRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>
          )}
          <div className="flex justify-between text-sm text-gray-500 mb-2"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
          <div className="flat-divider" />
          <div className="flex justify-between text-base font-bold text-gray-900 mt-2"><span>Total Amount</span><span>{formatCurrency(totalAmount)}</span></div>
          {paidAmount > 0 && (
            <>
              <div className="flex justify-between text-sm text-gray-500 mt-1"><span>Amount Paid</span><span>{formatCurrency(paidAmount)}</span></div>
              <div className="flat-divider my-1.5" />
              <div className="flex justify-between text-sm font-bold text-blue-600"><span>Amount Remaining</span><span>{formatCurrency(Math.max(0, totalAmount - paidAmount))}</span></div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 flex-wrap">
          <button onClick={onClose} className="flat-btn">Cancel</button>
          {!isEditing && (
            <button
              onClick={handleSaveDraft}
              disabled={!canSave}
              className="flat-btn disabled:opacity-50"
            >
              <FileText size={14} strokeWidth={1.5} /> Save as Draft
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flat-btn-primary disabled:opacity-50"
          >
            <Receipt size={14} strokeWidth={1.5} />
            {isEditing ? "Save Changes" : "Create Invoice"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function BillingPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <PageSkeleton variant="billing" />
      </div>
    }>
      <BillingPage />
    </Suspense>
  );
}
