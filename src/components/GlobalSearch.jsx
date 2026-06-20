"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Phone, ArrowRight } from "lucide-react";
import { loadWorkshopData } from "@/lib/workshop-data";
import { normalizeSearch, formatVehicleNumber, getInitials } from "@/lib/helpers";

export default function GlobalSearch() {
  const [query, setQuery]         = useState("");
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles]   = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [focused, setFocused]     = useState(false);
  const router    = useRouter();
  const inputRef  = useRef(null);
  const wrapperRef = useRef(null);

  // Load data once on first focus
  const ensureData = () => {
    if (dataLoaded) return;
    loadWorkshopData().then((data) => {
      setCustomers(data.customers || []);
      setVehicles(data.vehicles   || []);
      setDataLoaded(true);
    }).catch(() => {});
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setFocused(false);
      }
    };
    const handleKey = (e) => { if (e.key === "Escape") { setFocused(false); setQuery(""); } };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Build results
  const results = [];
  if (query.trim().length >= 2) {
    const q = normalizeSearch(query);
    customers.forEach((c) => {
      if (normalizeSearch(c.name).includes(q) || normalizeSearch(c.phone_number).includes(q)) {
        results.push({ type: "customer", customer: c, vehicles: vehicles.filter((v) => v.customer_id === c.id) });
      }
    });
    vehicles.forEach((v) => {
      if (normalizeSearch(v.vehicle_number).includes(q)) {
        const customer = customers.find((c) => c.id === v.customer_id);
        if (!results.find((r) => r.type === "customer" && r.customer.id === customer?.id)) {
          results.push({ type: "vehicle", vehicle: v, customer });
        }
      }
    });
  }

  const handleResultClick = (result) => {
    const customerId = result.type === "customer" ? result.customer.id : result.customer?.id;
    router.push(customerId ? `/customers/${customerId}` : "/customers");
    setQuery("");
    setFocused(false);
  };

  const showDropdown = focused && query.trim().length >= 2;

  return (
    <div ref={wrapperRef} className="relative">
      {/* Permanent search bar */}
      <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 w-full max-w-xs sm:max-w-sm lg:max-w-md">
        <Search size={14} strokeWidth={1.5} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setFocused(true); ensureData(); }}
          placeholder="Search customers, cars…"
          className="bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400 w-full"
        />
        {query && (
          <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="shrink-0 text-gray-400 hover:text-gray-600">
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {showDropdown && (
        <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-dropdown border border-gray-100 z-50 animate-fade-in overflow-hidden">
          {results.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="p-1.5 max-h-80 overflow-y-auto">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleResultClick(r)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                >
                  {r.type === "customer" ? (
                    <>
                      <div className="flat-avatar w-8 h-8 bg-amber-50 text-amber-600 text-xs font-semibold rounded-lg shrink-0">
                        {getInitials(r.customer.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.customer.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-gray-400">{r.customer.phone_number}</span>
                          {r.vehicles.map((v) => (
                            <span key={v.id} className="text-[11px] text-gray-400">
                              {formatVehicleNumber(v.vehicle_number)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ArrowRight size={13} strokeWidth={1.5} className="text-gray-300 group-hover:text-amber-400 shrink-0 transition-colors" />
                    </>
                  ) : (
                    <>
                      <div className="flat-avatar w-8 h-8 bg-gray-100 text-gray-500 text-[10px] font-semibold rounded-lg shrink-0">
                        {formatVehicleNumber(r.vehicle.vehicle_number).slice(-4)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{formatVehicleNumber(r.vehicle.vehicle_number)}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{r.vehicle.make} {r.vehicle.model} · {r.customer?.name}</p>
                      </div>
                      <ArrowRight size={13} strokeWidth={1.5} className="text-gray-300 group-hover:text-amber-400 shrink-0 transition-colors" />
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="px-4 py-2 border-t border-gray-50 flex justify-between text-[10px] text-gray-400">
            <span><kbd className="px-1 py-0.5 bg-gray-50 rounded font-mono">ESC</kbd> to close</span>
            <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
