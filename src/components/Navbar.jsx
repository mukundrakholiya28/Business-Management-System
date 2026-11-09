"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, User, WifiOff } from "lucide-react";
import GlobalSearch from "./GlobalSearch";
import SyncIndicator from "./SyncIndicator";
import { useAuth } from "@/context/AuthContext";
import { useSyncStatus } from "@/context/SyncContext";

const navItems = [
  { href: "/",          label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/billing",   label: "Billing"   },
  { href: "/finance",   label: "Finance"   },
];

export default function Navbar() {
  const pathname   = usePathname();
  const { logout } = useAuth();
  const { status } = useSyncStatus();
  const isOffline  = status === "offline";

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("theme");

    const handleWheel = (e) => {
      if (document.activeElement?.type === "number") {
        document.activeElement.blur();
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <header className="flat-navbar sticky top-0 z-40 w-full">

      {/* ── Main row ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center">

        {/* Brand */}
        <Link href="/" className="shrink-0 hover:opacity-80 transition-opacity flex items-center gap-2">
          <span className="font-oswald font-bold text-[22px] uppercase tracking-wider text-gray-900 whitespace-nowrap">
            Cars
          </span>
        </Link>

        {/* Desktop nav — absolutely centred */}
        <nav className="hidden lg:flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2">
          {navItems.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap
                  ${isActive ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side — with deliberate gap after the centered nav */}
        <div className="flex items-center gap-1 ml-auto shrink-0">

          {/* Offline indicator — icon only, no banner */}
          {isOffline && (
            <span
              title="You're offline — changes are saved locally and will sync when you reconnect"
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-500"
              aria-label="Offline"
            >
              <WifiOff size={14} strokeWidth={2} />
            </span>
          )}

          {/* Extra spacing between nav and search on desktop */}
          <div className="hidden lg:block w-4" />

          <GlobalSearch />
          <SyncIndicator />

          <Link
            href="/profile"
            className={`flat-btn-ghost p-1.5 text-gray-500 hover:text-gray-900 ${pathname === "/profile" ? "text-gray-900" : ""}`}
            title="Profile & Settings"
          >
            <Settings size={16} strokeWidth={1.5} />
          </Link>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 flat-btn-ghost px-2 sm:px-3 py-1.5 text-gray-500 hover:text-red-500 text-[13px] font-medium"
            aria-label="Log Out"
          >
            <LogOut size={16} strokeWidth={1.5} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile search portal target */}
      <div id="mobile-search-container" className="lg:hidden relative" />

      {/* Mobile pill nav */}
      <div className="lg:hidden border-t border-gray-100">
        <div className="px-4 sm:px-6">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-2">
            {navItems.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 whitespace-nowrap
                    ${isActive ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

    </header>
  );
}
