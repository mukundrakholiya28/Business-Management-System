"use client";

import React, { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { SectionHeader, StatusBadge, StatusDot, EmptyState, Modal, StatusSelect } from "@/components/ui";
import {
  formatCurrency,
  formatDate,
  generateId,
  normalizeSearch,
  formatVehicleNumber,
} from "@/lib/helpers";
import { sendWhatsApp, formatWhatsAppDate } from "@/lib/whatsapp";
import { sendInvoiceEmail } from "@/lib/email";
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
  Eye,
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

export default function BillingPage() {
  const { user, loading } = useProtectedRoute();
  const [bills, setBills] = useState([]);
  const [billItems, setBillItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [showBillForm, setShowBillForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("daily");
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

  if (loading || !user || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F5F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400 font-medium animate-pulse">Checking credentials...</span>
        </div>
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
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const customer = customers.find((c) => c.id === bill.customer_id);
    const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
    const items = billItems.filter((i) => i.bill_id === bill.id);

    const doc = new jsPDF();

    // 1. Try to load custom Inter font for Rupee symbol support
    let hasCustomFont = false;
    try {
      const response = await fetch("/Inter-Regular.ttf");
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Font = window.btoa(binary);

        doc.addFileToVFS("Inter-Regular.ttf", base64Font);
        doc.addFont("Inter-Regular.ttf", "Inter", "normal");
        doc.setFont("Inter", "normal");
        hasCustomFont = true;
      }
    } catch (e) {
      console.warn("Failed to load Inter font, falling back to Helvetica", e);
    }

    // Currency Formatter fallback
    const fmt = (val) => {
      const formatted = formatCurrency(val);
      if (!hasCustomFont) {
        return formatted.replace("₹", "Rs. ");
      }
      return formatted;
    };

    // 2. Load Logo Image
    const loadLogo = () => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = "/logo.png";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };
    const logoImg = await loadLogo();

    // 3. Render Header
    if (logoImg) {
      doc.addImage(logoImg, "PNG", 20, 14, 16, 16);
      doc.setFont(hasCustomFont ? "Inter" : "helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(17, 24, 39); // Slate 900
      doc.text("SHREE ROYAL CAR", 40, 21);
      
      doc.setFont(hasCustomFont ? "Inter" : "helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(107, 114, 128); // Slate 500
      doc.text("Car Workshop & Service Center", 40, 26);
    } else {
      doc.setFont(hasCustomFont ? "Inter" : "helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(17, 24, 39);
      doc.text("SHREE ROYAL CAR", 20, 21);
      
      doc.setFont(hasCustomFont ? "Inter" : "helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text("Car Workshop & Service Center", 20, 26);
    }

    // Divider accent line
    doc.setDrawColor(79, 110, 247);
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);

    // 4. Render Invoice Meta & Bill To Info Cards
    // Left card box (Invoice Meta)
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(20, 42, 80, 32, 2, 2, "F");
    
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(`INVOICE #INV-${bill.bill_number}`, 24, 49);
    
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Date: ${formatDate(bill.created_at)}`, 24, 55);
    doc.text(`Status: ${bill.status.toUpperCase()}`, 24, 61);
    doc.text(`Payment: ${bill.payment_method.toUpperCase()}`, 24, 67);

    // Right card box (Customer / Vehicle)
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(110, 42, 80, 32, 2, 2, "F");
    
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(156, 163, 175); // Gray 400
    doc.text("BILL TO", 114, 49);
    
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(customer?.name || "—", 114, 55);
    
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Phone: ${customer?.phone_number || "—"}`, 114, 61);
    doc.text(`Vehicle: ${vehicle?.vehicle_number ? formatVehicleNumber(vehicle.vehicle_number) : "—"} · ${vehicle?.make || ""} ${vehicle?.model || ""}`, 114, 67);

    // 5. Render Line Items Table
    autoTable(doc, {
      startY: 82,
      head: [["#", "Description", "Qty", "Unit Price", "Total"]],
      body: items.map((item, i) => [
        i + 1,
        item.description,
        item.quantity,
        fmt(item.unit_price),
        fmt(item.total_price),
      ]),
      theme: "plain",
      headStyles: {
        font: hasCustomFont ? "Inter" : "helvetica",
        fontStyle: "bold",
        fillColor: [79, 110, 247],
        textColor: 255,
        fontSize: 8.5
      },
      styles: {
        font: hasCustomFont ? "Inter" : "helvetica",
        fontSize: 8.5,
        cellPadding: 5
      },
      columnStyles: {
        0: { cellWidth: 10 },
        2: { halign: "right", cellWidth: 15 },
        3: { halign: "right", cellWidth: 35 },
        4: { halign: "right", cellWidth: 35 }
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    // 6. Render Totals & Notes Block
    const y = doc.lastAutoTable.finalY + 12;

    // Render notes on the left side if present
    if (bill.notes && bill.notes.trim()) {
      doc.setFont(hasCustomFont ? "Inter" : "helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(75, 85, 99); // Slate 600
      doc.text("Notes / Remarks:", 20, y);
      
      doc.setFont(hasCustomFont ? "Inter" : "helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128); // Slate 500
      const splitNotes = doc.splitTextToSize(bill.notes, 100);
      doc.text(splitNotes, 20, y + 5);
    }

    // Render totals on the right side
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    
    doc.text("Subtotal:", 140, y);
    doc.text(fmt(bill.subtotal), 185, y, { align: "right" });
    
    let totalOffsetY = y;
    if (bill.tax_amount > 0) {
      totalOffsetY += 6;
      doc.text(`GST (${bill.gst_rate ?? 18}%):`, 140, totalOffsetY);
      doc.text(fmt(bill.tax_amount), 185, totalOffsetY, { align: "right" });
    }
    
    if (bill.discount > 0) {
      totalOffsetY += 6;
      doc.text("Discount:", 140, totalOffsetY);
      doc.text(`-${fmt(bill.discount)}`, 185, totalOffsetY, { align: "right" });
    }

    totalOffsetY += 4;
    doc.setDrawColor(229, 231, 235); // Light divider line
    doc.setLineWidth(0.5);
    doc.line(140, totalOffsetY, 185, totalOffsetY);

    totalOffsetY += 7;
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text("Total:", 140, totalOffsetY);
    doc.text(fmt(bill.total_amount), 185, totalOffsetY, { align: "right" });

    // 7. Footer
    doc.setFont(hasCustomFont ? "Inter" : "helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text("Thank you for choosing Shree Royal Car!", 105, 280, { align: "center" });

    doc.save(`INV-${bill.bill_number}.pdf`);
    showToast("PDF downloaded");
  };

  const sendToCustomer = async (bill) => {
    const customer = customers.find((c) => c.id === bill.customer_id);
    const vehicle  = vehicles.find((v) => v.id === bill.vehicle_id);
    const items    = billItems.filter((i) => i.bill_id === bill.id);
    
    let emailStatus = { success: false, error: null, attempted: false };
    let whatsappStatus = { success: false, error: null, attempted: false };

    // Send email if customer has an email address
    if (customer?.email) {
      emailStatus.attempted = true;
      try {
        await sendInvoiceEmail({ bill, items, customer, vehicle });
        emailStatus.success = true;
      } catch (err) {
        emailStatus.error = err.message || "Unknown error";
      }
    }

    // Send WhatsApp
    if (customer?.phone_number) {
      whatsappStatus.attempted = true;
      try {
        await sendWhatsApp(
          customer.phone_number,
          customer.name,
          `INV-${bill.bill_number}`,
          formatWhatsAppDate(bill.created_at)
        );
        whatsappStatus.success = true;
      } catch (err) {
        whatsappStatus.error = err.message || "Unknown error";
      }
    }

    // Consolidated status messaging and fallbacks
    if (!emailStatus.attempted && !whatsappStatus.attempted) {
      showToast("No email or phone on file for this customer.");
      return;
    }

    if (emailStatus.attempted && whatsappStatus.attempted) {
      if (emailStatus.success && whatsappStatus.success) {
        showToast(`Invoice sent via Email & WhatsApp to ${customer.name}`);
      } else if (emailStatus.success && !whatsappStatus.success) {
        showToast(`Sent via Email, but WhatsApp failed (Fallback: Email OK)`);
      } else if (!emailStatus.success && whatsappStatus.success) {
        showToast(`Sent via WhatsApp, but Email failed (Fallback: WhatsApp OK)`);
      } else {
        showToast(`Delivery failed! Email & WhatsApp both failed.`);
      }
    } else if (emailStatus.attempted) {
      if (emailStatus.success) {
        showToast(`Invoice sent via Email to ${customer.name}`);
      } else {
        showToast(`Email failed: ${emailStatus.error}. No phone for WhatsApp fallback.`);
      }
    } else if (whatsappStatus.attempted) {
      if (whatsappStatus.success) {
        showToast(`Invoice sent via WhatsApp to ${customer.name}`);
      } else {
        showToast(`WhatsApp failed: ${whatsappStatus.error}. No email for Email fallback.`);
      }
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
      setBills((prev) => prev.filter((b) => b.id !== bill.id));
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
      const saved = await saveBillWithItems({ bill, items, isEditing });
      const nextBill = saved.bill;
      const nextItems = saved.items || [];

      setBills((prev) =>
        isEditing ? prev.map((item) => (item.id === nextBill.id ? nextBill : item)) : [nextBill, ...prev]
      );
      setBillItems((prev) => {
        const remaining = isEditing ? prev.filter((item) => item.bill_id !== nextBill.id) : prev;
        return [...remaining, ...nextItems];
      });
      setSelectedBill(nextBill);
      setShowBillForm(false);
      setEditingBill(null);

      if (isEditing) {
        showToast("Invoice updated");
        return;
      }

      if (nextBill.status === "draft") {
        showToast("Invoice created as draft");
        return;
      }

      // Automatically send notifications for new invoices
      const customer = customers.find((c) => c.id === nextBill.customer_id);
      const vehicle = vehicles.find((v) => v.id === nextBill.vehicle_id);

      let emailStatus = { success: false, error: null, attempted: false };
      let whatsappStatus = { success: false, error: null, attempted: false };

      // Try WhatsApp first
      if (customer?.phone_number) {
        whatsappStatus.attempted = true;
        try {
          await sendWhatsApp(
            customer.phone_number,
            customer.name,
            `INV-${nextBill.bill_number}`,
            formatWhatsAppDate(nextBill.created_at)
          );
          whatsappStatus.success = true;
        } catch (whatsappErr) {
          whatsappStatus.error = whatsappErr.message || "Unknown error";
        }
      }

      // Try Email
      if (customer?.email) {
        emailStatus.attempted = true;
        try {
          await sendInvoiceEmail({ bill: nextBill, items: nextItems, customer, vehicle });
          emailStatus.success = true;
        } catch (emailErr) {
          emailStatus.error = emailErr.message || "Unknown error";
        }
      }

      // Formulate consolidated response toast
      if (!emailStatus.attempted && !whatsappStatus.attempted) {
        showToast("Invoice created. No contact info on file to send.");
      } else if (emailStatus.attempted && whatsappStatus.attempted) {
        if (emailStatus.success && whatsappStatus.success) {
          showToast("Invoice created & sent via Email & WhatsApp!");
        } else if (emailStatus.success && !whatsappStatus.success) {
          showToast("Invoice created. Sent via Email, but WhatsApp failed.");
        } else if (!emailStatus.success && whatsappStatus.success) {
          showToast("Invoice created. Sent via WhatsApp, but Email failed.");
        } else {
          showToast("Invoice created, but Email & WhatsApp delivery failed.");
        }
      } else if (emailStatus.attempted) {
        if (emailStatus.success) {
          showToast("Invoice created & sent via Email!");
        } else {
          showToast(`Invoice created, but Email failed: ${emailStatus.error}`);
        }
      } else if (whatsappStatus.attempted) {
        if (whatsappStatus.success) {
          showToast("Invoice created & sent via WhatsApp!");
        } else {
          showToast(`Invoice created, but WhatsApp failed: ${whatsappStatus.error}`);
        }
      }
    } catch (error) {
      showToast(error.message);
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
                      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                      .map((bill) => {
                        const customer = customers.find((c) => c.id === bill.customer_id);
                        const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
                        return (
                          <tr key={bill.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="py-3 px-5 font-medium text-gray-900 whitespace-nowrap">
                              INV-{bill.bill_number}
                            </td>
                            <td className="py-3 px-5 text-gray-600 hidden sm:table-cell">
                              {customer?.name}
                            </td>
                            <td className="py-3 px-5 text-gray-500 hidden md:table-cell">
                              <span className="inline-flex items-center gap-1">
                                <Car size={12} strokeWidth={1.5} className="text-gray-400" />
                                {formatVehicleNumber(vehicle?.vehicle_number)}
                              </span>
                            </td>
                            <td className="py-3 px-5 text-gray-400 hidden lg:table-cell text-xs">
                              {formatDate(bill.created_at)}
                            </td>
                            <td className="py-3 px-5 text-center">
                              <StatusSelect
                                value={bill.status}
                                onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                                stopPropagation
                              />
                            </td>
                            <td className="py-3 px-5 text-right font-semibold text-gray-900 tabular-nums">
                              {formatCurrency(bill.total_amount)}
                            </td>
                            <td className="py-3 px-5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-0.5">
                                <button onClick={() => setSelectedBill(bill)} className="flat-btn-ghost p-1.5" title="View"><Eye size={15} strokeWidth={1.5} /></button>
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
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .map((bill) => {
                    const customer = customers.find((c) => c.id === bill.customer_id);
                    const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
                    return (
                      <div key={bill.id} className="flat-card flex flex-col gap-3 p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 text-sm">INV-{bill.bill_number}</span>
                          <StatusSelect
                            value={bill.status}
                            onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                            stopPropagation
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-700 font-medium">{customer?.name || "—"}</p>
                          {vehicle && (
                            <p className="text-[11px] text-gray-500 flex items-center gap-1">
                              <Car size={10} strokeWidth={1.5} className="text-gray-400" />
                              {formatVehicleNumber(vehicle.vehicle_number)} · {vehicle.make} {vehicle.model}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-400">{formatDate(bill.created_at)}</p>
                        </div>
                        <div className="flat-divider my-0.5" />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase tracking-wider">Total</p>
                            <p className="text-sm font-bold text-gray-900 mt-0.5 tabular-nums">
                              {formatCurrency(bill.total_amount)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedBill(bill)} className="flat-btn-ghost p-1.5" title="View"><Eye size={14} strokeWidth={1.5} /></button>
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
        />
      )}

      {showBillForm && (
        <CreateBillModal
          key={editingBill?.id || "new-bill"}
          customers={customers}
          vehicles={vehicles}
          bill={editingBill}
          billItems={billItems.filter((item) => item.bill_id === editingBill?.id)}
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

function BillDetailModal({ bill, items, customers, vehicles, onClose, onExportPDF, onSend, onEdit, onMarkPaid, onStatusChange }) {
  const customer = customers.find((c) => c.id === bill.customer_id);
  const vehicle = vehicles.find((v) => v.id === bill.vehicle_id);
  const isOnlinePending = bill.payment_method === "online" && bill.status === "pending";
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const handleResendWhatsApp = async () => {
    setSending(true);
    setSendError(null);
    try {
      await sendWhatsApp(
        customer?.phone_number,
        customer?.name,
        `INV-${bill.bill_number}`,
        formatWhatsAppDate(bill.created_at)
      );
    } catch (err) {
      setSendError(err.message);
    } finally {
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
          <p className="text-sm font-medium text-gray-900">{formatVehicleNumber(vehicle?.vehicle_number)}</p>
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

function CreateBillModal({ customers, vehicles, bills, bill, billItems, onClose, onSave, onCreateCustomer }) {
  const isEditing = Boolean(bill);
  const [customerId, setCustomerId] = useState(bill?.customer_id || "");
  const [vehicleId, setVehicleId] = useState(bill?.vehicle_id || "");
  const [items, setItems] = useState(
    billItems.length
      ? billItems.map((item) => ({ description: item.description, quantity: item.quantity, unit_price: item.unit_price }))
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [discount, setDiscount] = useState(bill?.discount || 0);
  const [notes, setNotes] = useState(bill?.notes || "");
  const [status, setStatus] = useState(bill?.status || "draft");
  const [paymentMethod, setPaymentMethod] = useState(bill?.payment_method || "cash");
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

  const visibleVehicles = vehicles.filter((vehicle) => vehicle.customer_id === customerId);
  const addItem = () => setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0 }]);
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

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = gstEnabled ? Math.round(subtotal * (gstRate / 100) * 100) / 100 : 0;
  const totalAmount = subtotal + taxAmount - discount;

  // Both cash and online start as pending — user marks paid manually
  const derivedStatus = () => "pending";

  const buildBill = (overrideStatus) => {
    const billId = bill?.id || generateId();
    const normalizedBillNumber = bill?.bill_number || Math.max(1000, ...bills.map((entry) => entry.bill_number)) + 1;
    return {
      id: billId,
      bill_number: normalizedBillNumber,
      customer_id: customerId,
      vehicle_id: vehicleId,
      subtotal,
      tax_amount: taxAmount,
      gst_enabled: gstEnabled,
      gst_rate: gstEnabled ? gstRate : 0,
      discount,
      total_amount: totalAmount,
      status: overrideStatus,
      payment_method: paymentMethod,
      notes,
      created_at: bill?.created_at || new Date().toISOString(),
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

    onSave({ bill: savedBill, items: savedItems, isEditing });
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
      <div className="space-y-5">
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
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="flat-select" disabled={!customerId}>
              <option value="">Select vehicle…</option>
              {visibleVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {formatVehicleNumber(vehicle.vehicle_number)} — {vehicle.make} {vehicle.model}
                </option>
              ))}
            </select>
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
                    className="flat-input flex-1 sm:w-60 md:w-80"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    min="1"
                    onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                    className="flat-input w-20 shrink-0"
                  />
                  <input
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price || ""}
                    min="0"
                    onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                    className="flat-input flex-grow sm:w-28"
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

        {/* Payment method */}
        <div>
          <label className="flat-label block mb-2">Payment Method</label>
          <div className="flex gap-2">
            {[
              { value: "cash", label: "Cash", desc: isEditing ? null : "Status → Pending" },
              { value: "online", label: "Online", desc: isEditing ? null : "Status → Pending" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaymentMethod(opt.value)}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-left transition-all ${
                  paymentMethod === opt.value
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                {opt.desc && <p className="text-[11px] mt-0.5 opacity-70">{opt.desc}</p>}
              </button>
            ))}
          </div>
        </div>

        {/* Status — only shown when editing */}
        {isEditing && (
          <div>
            <label className="flat-label block mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="flat-select">
              {["draft", "pending", "paid", "cancelled"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}

        {/* Status preview for new bills */}
        {!isEditing && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2.5">
            <span>Invoice will be saved as</span>
            <span className="flat-pill font-semibold capitalize bg-amber-50 text-amber-700">
              pending
            </span>
            {paymentMethod === "online" && (
              <span className="text-gray-400">— WhatsApp link will open on create</span>
            )}
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between text-sm text-gray-500 mb-1"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          {gstEnabled && (
            <div className="flex justify-between text-sm text-gray-500 mb-1"><span>GST ({gstRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>
          )}
          <div className="flex justify-between text-sm text-gray-500 mb-2"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
          <div className="flat-divider" />
          <div className="flex justify-between text-base font-bold text-gray-900 mt-2"><span>Total</span><span>{formatCurrency(totalAmount)}</span></div>
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
            {isEditing
              ? "Save Changes"
              : paymentMethod === "online"
              ? "Create & Send via WhatsApp"
              : "Create Invoice"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
