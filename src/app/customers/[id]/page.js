"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { StatusSelect, EmptyState, Modal, PageSkeleton, PhoneNumber } from "@/components/ui";
import { formatCurrency, formatDate, getInitials, generateId, formatPhoneNumber, getLocalDateString } from "@/lib/helpers";
import { loadWorkshopData, saveBillWithItems, deleteVehicle, deleteBill, updateCustomer, saveVehicle } from "@/lib/workshop-data";
import { exportInvoicePDF, generateInvoicePDF } from "@/lib/pdf";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Car, Phone, Mail, MapPin, Receipt,
  Download, Pencil, Send, ChevronDown, ChevronRight,
  FileText, Trash2, Plus, UserPlus,
} from "lucide-react";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading } = useProtectedRoute();

  const [customer, setCustomer]     = useState(null);
  const [vehicles, setVehicles]     = useState([]);
  const [bills, setBills]           = useState([]);
  const [allBills, setAllBills]     = useState([]);
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
        setAllBills(data.bills || []);
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
        .sort((a, b) => b.bill_number - a.bill_number);
    });
    return map;
  }, [vehicles, bills]);

  // Summary stats
  const totalSpent = bills.reduce((s, b) => {
    if (b.status === "paid") return s + Number(b.total_amount);
    if (b.status === "partially_paid") return s + Number(b.paid_amount || 0);
    return s;
  }, 0);

  const pendingAmt = bills.reduce((s, b) => {
    if (b.status === "pending") return s + Number(b.total_amount);
    if (b.status === "partially_paid") return s + (Number(b.total_amount) - Number(b.paid_amount || 0));
    return s;
  }, 0);

  const exportPDF = async (bill) => {
    let pdfUrl = bill.pdf_url || null;

    if (pdfUrl) {
      window.open(`${pdfUrl}?t=${Date.now()}`, '_blank');
      showToast("Opening PDF...");
      return;
    }

    const cust    = allCustomers.find((c) => c.id === bill.customer_id);
    const vehicle = allVehicles.find((v) => v.id === bill.vehicle_id);
    const items   = billItems.filter((i) => i.bill_id === bill.id);

    try {
      showToast("Generating & storing invoice PDF...");
      const pdf = await generateInvoicePDF({ bill, items, customer: cust, vehicle });
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
        await exportInvoicePDF({ bill, items, customer: cust, vehicle }, showToast);
      }
    } catch (err) {
      console.error("Failed to generate PDF on download fallback:", err);
      showToast("Failed to generate PDF.");
    }
  };

  const handleSaveBill = async ({ bill, items, isEditing }) => {
    try {
      showToast(isEditing ? "Saving changes..." : "Saving invoice...");
      
      const vehicle = allVehicles.find((v) => v.id === bill.vehicle_id);

      if (isEditing) {
        // Edit flow:
        // 1. Save DB record immediately
        const saved = await saveBillWithItems({ bill, items, isEditing });
        const nextBill  = saved.bill;
        const nextItems = saved.items || [];

        // 2. Instantly update UI and close modal
        setBills((prev) => prev.map((b) => (b.id === nextBill.id ? nextBill : b)));
        setAllBills((prev) => prev.map((b) => (b.id === nextBill.id ? nextBill : b)));
        setBillItems((prev) => {
          const remaining = prev.filter((i) => i.bill_id !== nextBill.id);
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
                  setBills((prev) => prev.map((b) => (b.id === finalBill.id ? finalBill : b)));
                  setAllBills((prev) => prev.map((b) => (b.id === finalBill.id ? finalBill : b)));
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
        setAllBills((prev) => [nextBill, ...prev]);
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
                  setBills((prev) => prev.map((b) => (b.id === finalBill.id ? finalBill : b)));
                  setAllBills((prev) => prev.map((b) => (b.id === finalBill.id ? finalBill : b)));
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
      setAllBills((prev) =>
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
    if (newStatus === "partially_paid") {
      setEditingBill(bill);
      setShowBillForm(true);
      setSelectedBill(null);
      return;
    }
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

    const pdfUrl = bill.pdf_url || null;
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
        const { sendWhatsApp } = await import("@/lib/whatsapp");
        const { formatCurrency } = await import("@/lib/helpers");
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
                      <Phone size={11} strokeWidth={1.5} />
                      <PhoneNumber phone={customer.phone_number} display={formatPhoneNumber(customer.phone_number)} />
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
                const vehicleTotal = vehicleBills.reduce((s, b) => {
                  if (b.status === "paid") return s + Number(b.total_amount);
                  if (b.status === "partially_paid") return s + Number(b.paid_amount || 0);
                  return s;
                }, 0);

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
                                    <tr
                                      key={bill.id}
                                      onClick={() => setSelectedBill(bill)}
                                      className="border-t border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                                    >
                                      <td className="py-3 px-5 font-medium text-gray-900 whitespace-nowrap">
                                        INV-{bill.bill_number}
                                        {bill.notes && <span className="ml-2 text-xs text-gray-400 font-normal hidden md:inline">{bill.notes}</span>}
                                      </td>
                                      <td className="py-3 px-5 text-xs text-gray-400 hidden sm:table-cell">{formatDate(bill.created_at)}</td>
                                      <td className="py-3 px-5 text-center" onClick={(e) => e.stopPropagation()}>
                                        <StatusSelect
                                          value={bill.status}
                                          onChange={(newStatus) => handleStatusChange(bill, newStatus)}
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
                                <div
                                  key={bill.id}
                                  onClick={() => setSelectedBill(bill)}
                                  className="p-4 flex flex-col gap-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-gray-900 text-xs">INV-{bill.bill_number}</span>
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <StatusSelect
                                        value={bill.status}
                                        onChange={(newStatus) => handleStatusChange(bill, newStatus)}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-end justify-between">
                                    <div>
                                      <p className="text-[10px] text-gray-400">{formatDate(bill.created_at)}</p>
                                      {bill.notes && <p className="text-[10px] text-gray-500 mt-0.5">{bill.notes}</p>}
                                    </div>
                                    <span className="text-sm font-bold text-gray-900 tabular-nums text-right">
                                      {bill.status === "partially_paid" ? (
                                        <span className="flex flex-col items-end text-xs font-normal">
                                          <span className="text-gray-900 font-bold text-sm">{formatCurrency(bill.total_amount)}</span>
                                          <span className="text-[10px] text-green-600">Paid: {formatCurrency(bill.paid_amount)}</span>
                                          <span className="text-[10px] text-amber-600 font-medium">Remaining: {formatCurrency(Math.max(0, bill.total_amount - bill.paid_amount))}</span>
                                        </span>
                                      ) : (
                                        formatCurrency(bill.total_amount)
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-end gap-1 border-t border-gray-50/50 pt-2" onClick={(e) => e.stopPropagation()}>
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

      {showBillForm && (
        <CreateBillModal
          key={editingBill?.id || "new"}
          customers={allCustomers}
          vehicles={allVehicles}
          bills={allBills}
          bill={editingBill}
          billItems={billItems.filter((i) => i.bill_id === editingBill?.id)}
          allBillItems={billItems}
          presetCustomerId={id}
          presetVehicleId={showBillForm?.vehicleId || editingBill?.vehicle_id || null}
          onClose={() => { setShowBillForm(false); setEditingBill(null); }}
          onSave={handleSaveBill}
          onAddVehicle={(newVeh) => {
            setAllVehicles((prev) => [newVeh, ...prev]);
            setVehicles((prev) => [newVeh, ...prev]);
          }}
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
function CreateBillModal({ customers, vehicles, bills, bill, billItems, allBillItems, presetCustomerId, presetVehicleId, onClose, onSave, onAddVehicle }) {
  const isEditing  = Boolean(bill);
  const [customerId, setCustomerId] = useState(bill?.customer_id || presetCustomerId || "");
  const [vehicleId, setVehicleId]   = useState(bill?.vehicle_id  || presetVehicleId  || "");
  const [items, setItems] = useState(
    billItems?.length
      ? billItems.map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price }))
      : [{ description: "", quantity: 1, unit_price: 0 }]
  );
  const [discount, setDiscount]         = useState(bill?.discount || 0);
  const [paymentHistory, setPaymentHistory] = useState(
    bill?.payment_history && Array.isArray(bill.payment_history)
      ? bill.payment_history
      : bill?.paid_amount > 0
      ? [{ date: bill.created_at || new Date().toISOString(), amount: bill.paid_amount, method: bill.payment_method || "cash" }]
      : []
  );
  const paidAmount = paymentHistory.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const [notes, setNotes]               = useState(bill?.notes    || "");
  const [kmsRun, setKmsRun]             = useState(bill?.kms_run || "");
  const [status, setStatus]             = useState(bill?.status   || "draft");
  const [gstEnabled, setGstEnabled]     = useState(bill?.tax_amount > 0 ?? true);
  const [gstRate, setGstRate]           = useState(bill?.gst_rate ?? 18);
  const [billDate, setBillDate]         = useState(
    bill?.created_at
      ? getLocalDateString(bill.created_at)
      : getLocalDateString(new Date())
  );
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [newVehicleNumber, setNewVehicleNumber] = useState("");
  const [newVehicleMake, setNewVehicleMake] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehicleYear, setNewVehicleYear] = useState("");
  const [newVehicleColor, setNewVehicleColor] = useState("");

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

  const visibleVehicles = vehicles.filter((v) => v.customer_id === customerId);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef(null);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.toLowerCase().trim();
    const list = customers || [];
    if (!query) return list;
    return list.filter((c) =>
      (c.name && c.name.toLowerCase().includes(query)) ||
      (c.phone_number && c.phone_number.includes(query))
    );
  }, [customers, customerSearch]);

  const selectedCustomer = (customers || []).find((c) => c.id === customerId);

  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const vehicleDropdownRef = useRef(null);

  const filteredVehicles = useMemo(() => {
    const query = vehicleSearch.toLowerCase().trim();
    const list = visibleVehicles || [];
    if (!query) return list;
    return list.filter((v) =>
      (v.vehicle_number && v.vehicle_number.toLowerCase().includes(query)) ||
      (v.make && v.make.toLowerCase().includes(query)) ||
      (v.model && v.model.toLowerCase().includes(query))
    );
  }, [visibleVehicles, vehicleSearch]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
        setCustomerSearch("");
      }
      if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(e.target)) {
        setShowVehicleDropdown(false);
        setVehicleSearch("");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
  const addItem    = () => {
    setItems((p) => [...p, { description: "", quantity: 1, unit_price: 0 }]);
  };
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i, f, v) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [f]: v } : it));

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

  const subtotal    = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmount   = gstEnabled ? Math.round(subtotal * (gstRate / 100) * 100) / 100 : 0;
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

  const derivedStatus = () => "pending";

  const buildBill = (overrideStatus) => {
    const billId     = bill?.id || generateId();
    const billNumber = bill?.bill_number || (bills && bills.length > 0 ? Math.max(0, ...bills.map((b) => b.bill_number)) + 1 : 1);
    
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
      id: billId, bill_number: billNumber, customer_id: customerId, vehicle_id: vehicleId,
      kms_run: kmsRun ? Number(kmsRun) : null,
      subtotal, tax_amount: taxAmount, gst_enabled: gstEnabled, gst_rate: gstEnabled ? gstRate : 0,
      discount, total_amount: totalAmount, status: finalStatus, payment_method: null,
      paid_amount: paidAmount, notes,
      payment_history: paymentHistory,
      created_at: billDate
        ? new Date(billDate + "T00:00:00").toISOString()
        : bill?.created_at || new Date().toISOString(),
    };
  };

  const buildItems = (billId) =>
    items.filter((i) => i.description.trim()).map((i) => ({
      id: generateId(), bill_id: billId, description: i.description,
      quantity: i.quantity, unit_price: i.unit_price, total_price: i.quantity * i.unit_price,
    }));

  const handleCreateVehicle = async () => {
    if (!customerId) return;
    if (newVehicleYear) {
      const yr = Number(newVehicleYear);
      if (isNaN(yr) || yr < 1886 || yr > new Date().getFullYear() + 1) {
        alert("Please enter a valid vehicle year.");
        return;
      }
    }
    const cleanNumber = newVehicleNumber.trim().toUpperCase();
    try {
      const newVeh = await saveVehicle({
        customer_id: customerId,
        vehicle_number: cleanNumber,
        make: newVehicleMake.trim() || null,
        model: newVehicleModel.trim() || null,
        year: newVehicleYear ? Number(newVehicleYear) : null,
        color: newVehicleColor.trim() || null,
      }, false);

      if (newVeh) {
        if (onAddVehicle) {
          onAddVehicle(newVeh);
        }
        setVehicleId(newVeh.id);
        setShowVehicleForm(false);
        setNewVehicleNumber("");
        setNewVehicleMake("");
        setNewVehicleModel("");
        setNewVehicleYear("");
        setNewVehicleColor("");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const canSave = true; // All fields are optional!

  const handleSaveDraft = () => {
    if (billDate && isNaN(new Date(billDate).getTime())) {
      alert("Please enter a valid invoice date.");
      return;
    }
    const savedBill = buildBill("draft");
    onSave({ bill: savedBill, items: buildItems(savedBill.id), isEditing });
  };

  const handleSave = () => {
    if (billDate && isNaN(new Date(billDate).getTime())) {
      alert("Please enter a valid invoice date.");
      return;
    }
    const finalStatus = isEditing ? status : derivedStatus();
    const savedBill   = buildBill(finalStatus);
    const savedItems  = buildItems(savedBill.id);

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
        handleSave();
      } else if (nav === "new-veh-num") {
        const nextEl = document.querySelector('[data-nav="new-veh-make"]');
        if (nextEl) nextEl.focus();
      } else if (nav === "new-veh-make") {
        const nextEl = document.querySelector('[data-nav="new-veh-model"]');
        if (nextEl) nextEl.focus();
      } else if (nav === "new-veh-model") {
        const nextEl = document.querySelector('[data-nav="new-veh-year"]');
        if (nextEl) nextEl.focus();
      } else if (nav === "new-veh-year") {
        const nextEl = document.querySelector('[data-nav="new-veh-color"]');
        if (nextEl) nextEl.focus();
      } else if (nav === "new-veh-color") {
        handleCreateVehicle();
      }
    }
  };

  return (
    <Modal title={isEditing ? "Edit Invoice" : "New Invoice"} onClose={onClose} wide>
      <div className="space-y-5" onKeyDown={handleKeyDown}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flat-label mb-1">Customer / Vehicle Details</p>
          </div>
          <div className="flex gap-2">
            {customerId && (
              <button onClick={() => setShowVehicleForm((prev) => !prev)} className="flat-btn text-xs">
                <Plus size={14} strokeWidth={1.5} /> Add Vehicle to Customer
              </button>
            )}
          </div>
        </div>

        {showVehicleForm && customerId && (
          <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4 animate-fade-in">
            <p className="text-xs font-semibold text-gray-700">Add Vehicle to {customers.find(c => c.id === customerId)?.name || "selected customer"}</p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <input value={newVehicleNumber} onChange={(e) => setNewVehicleNumber(e.target.value)} data-nav="new-veh-num" className="flat-input sm:col-span-2" placeholder="Car number (optional)" />
              <input value={newVehicleMake} onChange={(e) => setNewVehicleMake(e.target.value)} data-nav="new-veh-make" className="flat-input" placeholder="Make (optional)" />
              <input value={newVehicleModel} onChange={(e) => setNewVehicleModel(e.target.value)} data-nav="new-veh-model" className="flat-input" placeholder="Model (optional)" />
              <div className="flex items-center gap-2">
                <input value={newVehicleYear} onChange={(e) => setNewVehicleYear(e.target.value)} data-nav="new-veh-year" className="flat-input" placeholder="Year (optional)" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <input value={newVehicleColor} onChange={(e) => setNewVehicleColor(e.target.value)} data-nav="new-veh-color" className="flat-input sm:col-span-2" placeholder="Color (optional)" />
              <button onClick={handleCreateVehicle} className="flat-btn-primary text-xs sm:col-span-3">
                Add Vehicle
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative" ref={customerDropdownRef}>
            <label className="flat-label block mb-1.5">Customer</label>
            <div className="relative">
              <input
                type="text"
                className="flat-input w-full pr-8"
                placeholder={selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone_number})` : "Search & select customer..."}
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                data-nav="customer"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <ChevronDown size={16} />
              </div>
            </div>
            {showCustomerDropdown && (
              <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-100 rounded-xl shadow-dropdown py-1">
                {filteredCustomers.length === 0 ? (
                  <p className="text-xs text-gray-400 italic p-3 text-center">No customers found</p>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(c.id);
                        setVehicleId("");
                        setCustomerSearch("");
                        setShowCustomerDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex flex-col gap-0.5 ${c.id === customerId ? 'bg-gray-50 font-medium' : ''}`}
                    >
                      <span className="text-gray-900 font-medium">{c.name}</span>
                      <span className="text-gray-500">{c.phone_number}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={vehicleDropdownRef}>
            <div className="flex justify-between items-center mb-1.5">
              <label className="flat-label block">Vehicle</label>
              {customerId && (
                <button
                  type="button"
                  onClick={() => setShowVehicleForm((prev) => !prev)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5"
                >
                  <Plus size={12} /> Add Vehicle
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                className="flat-input w-full pr-8"
                placeholder={
                  selectedVehicle
                    ? `${formatVehicleNumber(selectedVehicle.vehicle_number)} — ${selectedVehicle.make || ""} ${selectedVehicle.model || ""}`.trim()
                    : customerId
                    ? "Search & select vehicle..."
                    : "Select a customer first..."
                }
                value={vehicleSearch}
                onChange={(e) => {
                  setVehicleSearch(e.target.value);
                  setShowVehicleDropdown(true);
                }}
                onFocus={() => {
                  if (customerId) setShowVehicleDropdown(true);
                }}
                disabled={!customerId}
                data-nav="vehicle"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <ChevronDown size={16} />
              </div>
            </div>
            {showVehicleDropdown && customerId && (
              <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-100 rounded-xl shadow-dropdown py-1">
                {filteredVehicles.length === 0 ? (
                  <p className="text-xs text-gray-400 italic p-3 text-center">No vehicles found</p>
                ) : (
                  filteredVehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVehicleId(v.id);
                        setVehicleSearch("");
                        setShowVehicleDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex flex-col gap-0.5 ${v.id === vehicleId ? 'bg-gray-50 font-medium' : ''}`}
                    >
                      <span className="text-gray-900 font-medium">{formatVehicleNumber(v.vehicle_number) || "Temporary Number"}</span>
                      <span className="text-gray-500">{v.make || ""} {v.model || ""}</span>
                    </button>
                  ))
                )}
              </div>
            )}
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
                    data-nav={`item-desc-${i}`}
                    className="flat-input flex-1 sm:w-60 md:w-80"
                    list={`suggestions-${i}`}
                  />
                  <datalist id={`suggestions-${i}`}>
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
                    onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                    data-nav={`item-qty-${i}`}
                    className="flat-input w-20 shrink-0"
                  />
                  <input
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price || ""}
                    min="0"
                    onChange={(e) => updateItem(i, "unit_price", Number(e.target.value))}
                    data-nav={`item-price-${i}`}
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

        <div className="space-y-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex justify-between items-center">
            <span className="flat-label block">Payment Parts / History</span>
            <button
              type="button"
              onClick={() => setPaymentHistory(prev => [...prev, { date: getLocalDateString(new Date()), amount: 0, method: "cash" }])}
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
                    value={pay.date ? getLocalDateString(pay.date) : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPaymentHistory(prev => prev.map((p, idx) => idx === pIdx ? { ...p, date: val ? new Date(val + "T00:00:00").toISOString() : p.date } : p));
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

        {/* Status — editing only */}
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
              {["draft","pending","partially_paid","paid","cancelled"].map((v) => (
                <option key={v} value={v}>{v === 'partially_paid' ? 'partially paid' : v}</option>
              ))}
            </select>
          </div>
        )}

        {/* Status preview — new bills */}
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
          {gstEnabled && <div className="flex justify-between text-sm text-gray-500 mb-1"><span>GST ({gstRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
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
    onSave({ ...customer, name: name.trim(), phone_number: phone.trim(), email: email.trim(), address: address.trim() });
  };

  return (
    <Modal title="Edit Customer" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={name}    onChange={(e) => setName(e.target.value)}    className="flat-input" placeholder="Customer name" />
          <input value={phone}   onChange={(e) => setPhone(e.target.value)}   className="flat-input" placeholder="Phone number (optional)" />
          <input value={email}   onChange={(e) => setEmail(e.target.value)}   className="flat-input" placeholder="Email (optional)" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="flat-input" placeholder="Address (optional)" />
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
          <label className="flat-label block mb-1">Vehicle Number (optional)</label>
          <input
            type="text"
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
            placeholder="e.g. GJ01AB1234 (optional)"
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
              placeholder="e.g. Hyundai (optional)"
              className="flat-input"
            />
          </div>
          <div>
            <label className="flat-label block mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. i20 (optional)"
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
              placeholder="e.g. 2021 (optional)"
              className="flat-input"
            />
          </div>
          <div>
            <label className="flat-label block mb-1">Color</label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="e.g. White (optional)"
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
