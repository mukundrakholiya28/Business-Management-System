"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { loadProfile, saveProfile } from "@/lib/workshop-data";
import { PageSkeleton } from "@/components/ui";
import { Building2, CreditCard, FileText, Phone, Mail, MapPin, Save } from "lucide-react";

const SECTIONS = [
  { id: "company",  label: "Company",        icon: Building2 },
  { id: "payment",  label: "Payment & Bank", icon: CreditCard },
  { id: "invoice",  label: "Invoice",        icon: FileText   },
];

export default function ProfilePage() {
  const { user, loading } = useProtectedRoute();
  const [profile, setProfile]       = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(null);
  const [activeSection, setActiveSection] = useState("company");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    loadProfile()
      .then(setProfile)
      .catch((e) => showToast(e.message))
      .finally(() => setLoadingData(false));
  }, []);

  const set = (field, value) => setProfile((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const saved = await saveProfile(profile);
      setProfile(saved);
      showToast("Profile saved");
    } catch (err) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user || loadingData) {
    return (
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <PageSkeleton variant="profile" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <main className="flex-1 pt-24 lg:pt-14">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 lg:px-8 py-7">

          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-6 animate-fade-in">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Business Profile</h1>
              <p className="text-xs text-gray-400 mt-1">
                Company details, payment info and invoice defaults — used on every PDF
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flat-btn-primary disabled:opacity-50"
            >
              <Save size={14} strokeWidth={1.5} />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

            {/* Sidebar */}
            <div className="space-y-1">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                    activeSection === id
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>

            {/* Form panel */}
            <div className="lg:col-span-3 flat-card space-y-5 animate-fade-in">

              {/* ── Company ── */}
              {activeSection === "company" && (
                <>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">Company Details</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Business Name" icon={Building2}>
                        <input value={profile.name || ""} onChange={(e) => set("name", e.target.value)} className="flat-input" placeholder="Shree Royal Car" />
                      </Field>
                      <Field label="Tagline">
                        <input value={profile.tagline || ""} onChange={(e) => set("tagline", e.target.value)} className="flat-input" placeholder="Automotive Repair & Car Wash" />
                      </Field>
                      <Field label="Established Year">
                        <input value={profile.established || ""} onChange={(e) => set("established", e.target.value)} className="flat-input" placeholder="2004" />
                      </Field>
                      <Field label="GSTIN">
                        <input value={profile.gstin || ""} onChange={(e) => set("gstin", e.target.value)} className="flat-input" placeholder="24ABCDE1234F1Z5" />
                      </Field>
                      <Field label="Phone" icon={Phone}>
                        <input value={profile.phone || ""} onChange={(e) => set("phone", e.target.value)} className="flat-input" placeholder="+91 98765 43210" />
                      </Field>
                      <Field label="Email" icon={Mail}>
                        <input value={profile.email || ""} onChange={(e) => set("email", e.target.value)} className="flat-input" placeholder="billing@shreeroyalcar.in" />
                      </Field>
                      <Field label="Address" icon={MapPin} className="sm:col-span-2">
                        <input value={profile.address || ""} onChange={(e) => set("address", e.target.value)} className="flat-input" placeholder="12 Ashram Road, Ahmedabad" />
                      </Field>
                    </div>
                  </div>
                </>
              )}

              {/* ── Payment & Bank ── */}
              {activeSection === "payment" && (
                <>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">Payment Methods</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Accepted Via" className="sm:col-span-2">
                        <input value={profile.payment_methods || ""} onChange={(e) => set("payment_methods", e.target.value)} className="flat-input" placeholder="UPI / Bank Transfer / Cash" />
                      </Field>
                      <Field label="UPI ID">
                        <input value={profile.upi_id || ""} onChange={(e) => set("upi_id", e.target.value)} className="flat-input" placeholder="shreeroyalcar@upi" />
                      </Field>
                    </div>
                  </div>

                  <div className="flat-divider" />

                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">Bank Transfer</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Bank Name">
                        <input value={profile.bank_name || ""} onChange={(e) => set("bank_name", e.target.value)} className="flat-input" placeholder="HDFC Bank" />
                      </Field>
                      <Field label="Account Number">
                        <input value={profile.account_number || ""} onChange={(e) => set("account_number", e.target.value)} className="flat-input" placeholder="50100123456789" />
                      </Field>
                      <Field label="IFSC Code">
                        <input value={profile.ifsc || ""} onChange={(e) => set("ifsc", e.target.value)} className="flat-input" placeholder="HDFC0001234" />
                      </Field>
                    </div>
                  </div>
                </>
              )}

              {/* ── Invoice defaults ── */}
              {activeSection === "invoice" && (
                <>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">Invoice Defaults</h2>
                    <div className="space-y-4">
                      <Field label="Invoice Notes / Terms" className="col-span-2">
                        <textarea
                          value={profile.invoice_notes || ""}
                          onChange={(e) => set("invoice_notes", e.target.value)}
                          rows={4}
                          className="flat-input resize-none"
                          placeholder="Payment due within 7 days of invoice date. Late payments may attract a 2% monthly surcharge."
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="flat-divider" />

                  {/* Live preview snippet */}
                  <div>
                    <p className="flat-label mb-3">Preview — how it appears on the invoice</p>
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-xs text-gray-600 leading-relaxed space-y-1">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="flat-label mb-1.5">Payment Methods</p>
                          <p><span className="text-gray-400">Accepted via</span> {profile.payment_methods || "—"}</p>
                          <p><span className="text-gray-400">UPI ID</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{profile.upi_id || "—"}</p>
                        </div>
                        <div>
                          <p className="flat-label mb-1.5">Bank Transfer</p>
                          <p><span className="text-gray-400">Bank</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{profile.bank_name || "—"}</p>
                          <p><span className="text-gray-400">Account No.</span> {profile.account_number || "—"}</p>
                          <p><span className="text-gray-400">IFSC</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{profile.ifsc || "—"}</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-200 text-gray-400 italic">
                        {profile.invoice_notes || "—"}
                      </div>
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white rounded-xl shadow-dropdown px-4 py-2.5 text-sm font-medium animate-slide-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function Field({ label, icon: Icon, className = "", children }) {
  return (
    <div className={className}>
      <label className="flat-label flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon size={11} strokeWidth={1.5} className="text-gray-400" />}
        {label}
      </label>
      {children}
    </div>
  );
}
