"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { useProtectedRoute } from "@/context/AuthContext";
import { EmptyState, Modal, SectionHeader, PageSkeleton, PhoneNumber } from "@/components/ui";
import { formatDate, getInitials, normalizeSearch, formatVehicleNumber, formatPhoneNumber } from "@/lib/helpers";
import { loadWorkshopData, saveCustomerWithVehicles, deleteCustomer, updateCustomer } from "@/lib/workshop-data";
import Link from "next/link";
import { Plus, Search, UserPlus, Users, ChevronRight, Trash2, Pencil } from "lucide-react";

function emptyVehicle() {
  return { vehicle_number: "", make: "", model: "", year: "", color: "" };
}

export default function CustomersPage() {
  const { user, loading } = useProtectedRoute();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // customer to confirm delete
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let mounted = true;

    loadWorkshopData()
      .then((data) => {
        if (!mounted) return;
        setCustomers(data.customers || []);
        setVehicles(data.vehicles || []);
      })
      .catch((error) => {
        if (!mounted) return;
        setToast(error.message);
      })
      .finally(() => {
        if (mounted) setLoadingData(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredCustomers = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    return customers.filter((customer) => {
      if (!q) return true;
      const customerVehicles = vehicles.filter((v) => v.customer_id === customer.id);
      return (
        normalizeSearch(customer.name).includes(q) ||
        normalizeSearch(customer.phone_number).includes(q) ||
        customerVehicles.some((v) =>
          normalizeSearch(v.vehicle_number).includes(q) ||
          normalizeSearch(v.make).includes(q) ||
          normalizeSearch(v.model).includes(q)
        )
      );
    });
  }, [customers, vehicles, searchQuery]);

  const handleCreateCustomer = async (customer, newVehicles) => {
    try {
      const created = await saveCustomerWithVehicles({ customer, vehicles: newVehicles });
      setCustomers((prev) => [created.customer, ...prev]);
      setVehicles((prev) => [...created.vehicles, ...prev]);
      setShowCreate(false);
      showToast("Customer created");
      return created;
    } catch (error) {
      showToast(error.message);
      return null;
    }
  };

  const handleDeleteCustomer = async (customer) => {
    try {
      await deleteCustomer(customer.id);
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      setVehicles((prev) => prev.filter((v) => v.customer_id !== customer.id));
      setConfirmDelete(null);
      showToast(`${customer.name} deleted`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleEditCustomer = async (updated) => {
    try {
      const saved = await updateCustomer(updated);
      setCustomers((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      setEditingCustomer(null);
      showToast("Customer updated");
    } catch (err) {
      showToast(err.message);
    }
  };

  if (loading || loadingData || !user) {
    return (
      <div className="flex flex-col min-h-screen bg-page">
        <Navbar />
        <PageSkeleton variant="customers" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-page">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-7">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6 animate-fade-in">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
              <p className="text-xs text-gray-400 mt-1">Manage customers and their cars in one place.</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="flat-btn-primary">
              <UserPlus size={15} strokeWidth={1.5} /> Add Customer
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 stagger">
            <div className="flat-card">
              <p className="flat-label mb-1">Customers</p>
              <p className="text-kpi-sm text-gray-900">{customers.length}</p>
            </div>
            <div className="flat-card">
              <p className="flat-label mb-1">Vehicles</p>
              <p className="text-kpi-sm text-gray-900">{vehicles.length}</p>
            </div>
          </div>

          <div className="flat-card animate-fade-in mb-5">
            <div className="flex items-center gap-3">
              <Search size={15} strokeWidth={1.5} className="text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers or car numbers…"
                className="flat-input"
              />
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No customers found"
              description="Add a customer with one or more cars to get started."
            />
          ) : (
            <div className="flat-card p-0 overflow-hidden animate-fade-in">
              {filteredCustomers.map((customer, idx) => {
                const customerVehicles = vehicles.filter((vehicle) => vehicle.customer_id === customer.id);
                return (
                  <div
                    key={customer.id}
                    className={`flex items-center gap-2 px-5 py-3.5 ${
                      idx < filteredCustomers.length - 1 ? "border-b border-gray-100" : ""
                    }`}
                  >
                    <Link
                      href={`/customers/${customer.id}`}
                      className="flex-1 flex items-center justify-between gap-4 group cursor-pointer min-w-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flat-avatar w-9 h-9 bg-amber-50 text-amber-600 text-xs font-semibold rounded-xl shrink-0">
                          {getInitials(customer.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-amber-600 transition-colors">{customer.name}</p>
                          <p className="text-xs text-gray-400">
                            <PhoneNumber phone={customer.phone_number} display={formatPhoneNumber(customer.phone_number)} />
                            {customer.email ? ` · ${customer.email}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="hidden sm:flex gap-1.5">
                          {customerVehicles.map((v) => (
                            <span key={v.id} className="flat-pill bg-gray-100 text-gray-500 text-[11px]">
                              {formatVehicleNumber(v.vehicle_number)}
                            </span>
                          ))}
                        </div>
                        <span className="flat-pill bg-gray-100 text-gray-500 whitespace-nowrap sm:hidden">
                          {customerVehicles.length} car{customerVehicles.length === 1 ? "" : "s"}
                        </span>
                        <ChevronRight size={14} strokeWidth={1.5} className="text-gray-300 group-hover:text-amber-400 transition-colors" />
                      </div>
                    </Link>
                    <button
                      onClick={() => setEditingCustomer(customer)}
                      className="flat-btn-ghost p-1.5 text-gray-400 hover:text-amber-500 shrink-0"
                      title="Edit customer"
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(customer)}
                      className="flat-btn-ghost p-1.5 text-gray-400 hover:text-red-500 shrink-0 ml-1"
                      title="Delete customer"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {editingCustomer && (
        <CustomerEditModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSave={handleEditCustomer}
        />
      )}

      {showCreate && (
        <CustomerCreateModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreateCustomer}
        />
      )}

      {confirmDelete && (
        <Modal title="Delete Customer" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Delete <strong>{confirmDelete.name}</strong>? This will permanently remove the customer,
              all their vehicles, and all associated invoices. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flat-btn">Cancel</button>
              <button onClick={() => handleDeleteCustomer(confirmDelete)} className="flat-btn-danger">
                <Trash2 size={14} strokeWidth={1.5} /> Delete Everything
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white rounded-xl shadow-dropdown px-4 py-2.5 text-sm font-medium animate-slide-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function CustomerCreateModal({ onClose, onSave }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [vehicles, setVehicles] = useState([emptyVehicle()]);

  const addVehicle = () => setVehicles((prev) => [...prev, emptyVehicle()]);
  const removeVehicle = (index) => setVehicles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  const updateVehicle = (index, field, value) =>
    setVehicles((prev) => prev.map((vehicle, itemIndex) => (itemIndex === index ? { ...vehicle, [field]: value } : vehicle)));

  const handleSubmit = async () => {
    await onSave(
      {
        id: undefined,
        name: customerName,
        phone_number: customerPhone,
        email: customerEmail,
        address: customerAddress,
        created_at: new Date().toISOString(),
      },
      vehicles
    );
  };

  return (
    <Modal title="Add Customer" onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="flat-input" placeholder="Customer name" />
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="flat-input" placeholder="Phone number" />
          <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="flat-input" placeholder="Email" />
          <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="flat-input" placeholder="Address" />
        </div>

        <div>
          <SectionHeader title="Cars" subtitle="One customer can have multiple cars, but each car is linked to only one customer." />
          <div className="space-y-2">
            {vehicles.map((vehicle, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 bg-gray-50 rounded-xl">
                <input value={vehicle.vehicle_number} onChange={(e) => updateVehicle(index, "vehicle_number", e.target.value)} className="flat-input sm:col-span-2" placeholder="Car number" />
                <input value={vehicle.make} onChange={(e) => updateVehicle(index, "make", e.target.value)} className="flat-input" placeholder="Make" />
                <input value={vehicle.model} onChange={(e) => updateVehicle(index, "model", e.target.value)} className="flat-input" placeholder="Model" />
                <div className="flex items-center gap-2">
                  <input value={vehicle.year} onChange={(e) => updateVehicle(index, "year", e.target.value)} className="flat-input" placeholder="Year" />
                  {vehicles.length > 1 && (
                    <button onClick={() => removeVehicle(index)} className="flat-btn-ghost p-2 text-red-400">
                      <Plus size={14} strokeWidth={1.5} className="rotate-45" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button onClick={addVehicle} className="flat-btn mt-2 text-xs">
            <Plus size={14} strokeWidth={1.5} /> Add Another Car
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="flat-btn">Cancel</button>
          <button onClick={handleSubmit} className="flat-btn-primary">Create Customer</button>
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
          <button onClick={onClose}       className="flat-btn">Cancel</button>
          <button onClick={handleSubmit}  className="flat-btn-primary">Save Changes</button>
        </div>
      </div>
    </Modal>
  );
}