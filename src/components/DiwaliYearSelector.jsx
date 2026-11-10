"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Calendar, Sparkles } from "lucide-react";

/**
 * DiwaliYearSelector
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean, flat dropdown pill for switching between Diwali accounting cycles.
 */
export default function DiwaliYearSelector({
  selectedYear,
  onChange,
  availableYears = [],
  showAllOption = true,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentSelection = availableYears.find((y) => y.key === selectedYear);
  const displayLabel = selectedYear === "all"
    ? "All Time"
    : currentSelection
      ? currentSelection.label
      : selectedYear || "Select Year";

  const isCurrentYear = currentSelection && availableYears[0]?.key === currentSelection.key;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm transition-all focus:outline-none"
        title="Switch Diwali accounting year"
      >
        <Sparkles size={12} className="text-amber-500 shrink-0" />
        <span>{displayLabel}</span>
        {isCurrentYear && selectedYear !== "all" && (
          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
            Active
          </span>
        )}
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-52 rounded-xl bg-white shadow-xl border border-gray-100 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1 border-b border-gray-100 mb-1">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Diwali Accounting Year
            </span>
          </div>

          {availableYears.map((year, idx) => {
            const isSelected = selectedYear === year.key;
            const isLatest = idx === 0;
            return (
              <button
                key={year.key}
                type="button"
                onClick={() => {
                  onChange(year.key);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                  isSelected ? "font-semibold text-gray-900 bg-gray-50/80" : "text-gray-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-amber-500" : "bg-transparent"}`} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span>{year.label}</span>
                      {isLatest && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.2 rounded font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-normal">
                      {year.samvat}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}

          {showAllOption && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                  selectedYear === "all" ? "font-semibold text-gray-900 bg-gray-50/80" : "text-gray-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedYear === "all" ? "bg-amber-500" : "bg-transparent"}`} />
                  <div>
                    <span>All Time (Lifetime)</span>
                    <div className="text-[10px] text-gray-400 font-normal">
                      All historical invoices combined
                    </div>
                  </div>
                </div>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

