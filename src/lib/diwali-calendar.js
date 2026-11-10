/**
 * diwali-calendar.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vikram Samvat (Diwali to Diwali) Financial Accounting Year Calendar.
 *
 * Traditional Gujarati/Hindu accounting cycles (Chopda Pujan) run from Bestu Varas
 * (Kartak Sud 1, the day after Diwali Lakshmi Pujan) to Aso Vad Amavasya (Diwali).
 *
 * Supports:
 *   1. Automatic detection of the Diwali year from any timestamp.
 *   2. Manual overrides in settings (custom start date or custom year label).
 *   3. Helpers for querying, sorting, and UI year selectors.
 */

export const DIWALI_CALENDAR_PERIODS = [
  {
    key: "2020-2021",
    label: "FY 2020–21",
    samvat: "VS 2077",
    startDate: "2020-11-16T00:00:00.000Z",
    endDate:   "2021-11-04T23:59:59.999Z",
  },
  {
    key: "2021-2022",
    label: "FY 2021–22",
    samvat: "VS 2078",
    startDate: "2021-11-05T00:00:00.000Z",
    endDate:   "2022-10-24T23:59:59.999Z",
  },
  {
    key: "2022-2023",
    label: "FY 2022–23",
    samvat: "VS 2079",
    startDate: "2022-10-25T00:00:00.000Z",
    endDate:   "2023-11-12T23:59:59.999Z",
  },
  {
    key: "2023-2024",
    label: "FY 2023–24",
    samvat: "VS 2080",
    startDate: "2023-11-13T00:00:00.000Z",
    endDate:   "2024-10-31T23:59:59.999Z",
  },
  {
    key: "2024-2025",
    label: "FY 2024–25",
    samvat: "VS 2081",
    startDate: "2024-11-01T00:00:00.000Z",
    endDate:   "2025-10-20T23:59:59.999Z",
  },
  {
    key: "2025-2026",
    label: "FY 2025–26",
    samvat: "VS 2082",
    startDate: "2025-10-21T00:00:00.000Z",
    endDate:   "2026-11-08T23:59:59.999Z",
  },
  {
    key: "2026-2027",
    label: "FY 2026–27",
    samvat: "VS 2083",
    startDate: "2026-11-09T00:00:00.000Z",
    endDate:   "2027-10-29T23:59:59.999Z",
  },
  {
    key: "2027-2028",
    label: "FY 2027–28",
    samvat: "VS 2084",
    startDate: "2027-10-30T00:00:00.000Z",
    endDate:   "2028-10-17T23:59:59.999Z",
  },
  {
    key: "2028-2029",
    label: "FY 2028–29",
    samvat: "VS 2085",
    startDate: "2028-10-18T00:00:00.000Z",
    endDate:   "2029-11-05T23:59:59.999Z",
  },
  {
    key: "2029-2030",
    label: "FY 2029–30",
    samvat: "VS 2086",
    startDate: "2029-11-06T00:00:00.000Z",
    endDate:   "2030-10-26T23:59:59.999Z",
  },
  {
    key: "2030-2031",
    label: "FY 2030–31",
    samvat: "VS 2087",
    startDate: "2030-10-27T00:00:00.000Z",
    endDate:   "2031-11-14T23:59:59.999Z",
  },
  {
    key: "2031-2032",
    label: "FY 2031–32",
    samvat: "VS 2088",
    startDate: "2031-11-15T00:00:00.000Z",
    endDate:   "2032-11-02T23:59:59.999Z",
  },
  {
    key: "2032-2033",
    label: "FY 2032–33",
    samvat: "VS 2089",
    startDate: "2032-11-03T00:00:00.000Z",
    endDate:   "2033-10-22T23:59:59.999Z",
  },
  {
    key: "2033-2034",
    label: "FY 2033–34",
    samvat: "VS 2090",
    startDate: "2033-10-23T00:00:00.000Z",
    endDate:   "2034-11-10T23:59:59.999Z",
  },
  {
    key: "2034-2035",
    label: "FY 2034–35",
    samvat: "VS 2091",
    startDate: "2034-11-11T00:00:00.000Z",
    endDate:   "2035-10-30T23:59:59.999Z",
  },
  {
    key: "2035-2036",
    label: "FY 2035–36",
    samvat: "VS 2092",
    startDate: "2035-10-31T00:00:00.000Z",
    endDate:   "2036-10-18T23:59:59.999Z",
  },
];

/**
 * Returns the Diwali accounting period for any given date.
 * If the date is earlier than 2020 or beyond 2036, it extrapolates gracefully.
 *
 * @param {string | Date} [dateInput] - ISO date string or Date object. Defaults to now.
 * @param {Object} [customOverride] - Optional manual override settings from app_settings.
 * @returns {Object} Period object { key, label, samvat, startDate, endDate }
 */
export function getFinancialYearForDate(dateInput, customOverride = null) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const time = date.getTime();

  // 1. Check custom overrides if configured (Approach 3)
  if (customOverride && customOverride.periods && Array.isArray(customOverride.periods)) {
    const match = customOverride.periods.find((p) => {
      const s = new Date(p.startDate).getTime();
      const e = new Date(p.endDate).getTime();
      return time >= s && time <= e;
    });
    if (match) return match;
  }

  // 2. Check standard pre-configured calendar
  for (const period of DIWALI_CALENDAR_PERIODS) {
    const s = new Date(period.startDate).getTime();
    const e = new Date(period.endDate).getTime();
    if (time >= s && time <= e) {
      return period;
    }
  }

  // 3. Fallback extrapolation for extreme dates
  const yr = date.getFullYear();
  if (time < new Date(DIWALI_CALENDAR_PERIODS[0].startDate).getTime()) {
    return DIWALI_CALENDAR_PERIODS[0];
  }
  const last = DIWALI_CALENDAR_PERIODS[DIWALI_CALENDAR_PERIODS.length - 1];
  if (time > new Date(last.endDate).getTime()) {
    return {
      key: `${yr}-${yr + 1}`,
      label: `FY ${yr}–${String(yr + 1).slice(-2)}`,
      samvat: `VS ${yr + 57}`,
      startDate: `${yr}-10-25T00:00:00.000Z`,
      endDate: `${yr + 1}-11-10T23:59:59.999Z`,
    };
  }

  return DIWALI_CALENDAR_PERIODS[DIWALI_CALENDAR_PERIODS.length - 1];
}

/**
 * Returns the currently active Diwali financial year period.
 */
export function getCurrentFinancialYear(customOverride = null) {
  return getFinancialYearForDate(new Date(), customOverride);
}

/**
 * Returns a list of all defined Diwali financial years, ordered newest first.
 * Useful for dropdown filters on the Dashboard, Billing, and Finance pages.
 */
export function getAvailableFinancialYears(bills = [], customOverride = null) {
  const current = getCurrentFinancialYear(customOverride);
  const yearsMap = new Map();

  // Add all pre-configured years up to current year
  const currentIdx = DIWALI_CALENDAR_PERIODS.findIndex((p) => p.key === current.key);
  const relevantPeriods = currentIdx !== -1
    ? DIWALI_CALENDAR_PERIODS.slice(0, currentIdx + 1)
    : DIWALI_CALENDAR_PERIODS;

  for (const p of relevantPeriods) {
    yearsMap.set(p.key, { ...p });
  }

  // Also include any financial_year keys that exist in the loaded bills
  if (Array.isArray(bills)) {
    for (const b of bills) {
      const fy = b.financial_year || getFinancialYearForDate(b.created_at).key;
      if (fy && !yearsMap.has(fy)) {
        const period = getFinancialYearForDate(b.created_at);
        yearsMap.set(fy, period);
      }
    }
  }

  // Convert to array and sort DESC (newest first)
  const list = Array.from(yearsMap.values());
  list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  return list;
}

/**
 * Filters a list of bills to only those belonging to the specified financial year.
 * If fyKey is "all" or null, returns all bills.
 */
export function filterBillsByFinancialYear(bills, fyKey) {
  if (!fyKey || fyKey === "all") return bills;
  return bills.filter((b) => {
    const billFy = b.financial_year || getFinancialYearForDate(b.created_at).key;
    return billFy === fyKey;
  });
}

// ─── Session-persisted Financial Year Selection ──────────────────────────────
export const FY_SESSION_STORAGE_KEY = "cars_selected_fy";
export const FY_CHANGE_EVENT = "cars_fy_changed";

/**
 * Returns the currently selected financial year from sessionStorage,
 * or defaults to the currently active financial year.
 * Retains until app/window is closed or user changes it.
 */
export function getSelectedFinancialYear() {
  if (typeof window !== "undefined") {
    try {
      const saved = sessionStorage.getItem(FY_SESSION_STORAGE_KEY);
      if (saved) return saved;
    } catch {}
  }
  return getCurrentFinancialYear().key;
}

/**
 * Updates the selected financial year in sessionStorage and notifies all active pages.
 */
export function setSelectedFinancialYear(yearKey) {
  if (typeof window !== "undefined") {
    try {
      if (yearKey) {
        sessionStorage.setItem(FY_SESSION_STORAGE_KEY, yearKey);
      } else {
        sessionStorage.removeItem(FY_SESSION_STORAGE_KEY);
      }
      window.dispatchEvent(new CustomEvent(FY_CHANGE_EVENT, { detail: yearKey }));
    } catch {}
  }
}


