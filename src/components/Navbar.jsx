"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, UserCircle } from "lucide-react";
import GlobalSearch from "./GlobalSearch";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { href: "/",          label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/billing",   label: "Billing"   },
  { href: "/finance",   label: "Finance"   },
];

export default function Navbar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("theme");

    // Prevent scroll wheel from changing numbers in active number input
    const handleWheel = (e) => {
      if (document.activeElement && document.activeElement.type === "number") {
        document.activeElement.blur();
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return (
    <header className="flat-navbar sticky top-0 z-40 w-full">

      {/* â”€â”€ Single row: Brand | Nav (centred) | Search + Logout â”€â”€ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center">

        {/* Brand â€” left */}
        <Link href="/" className="shrink-0 hover:opacity-80 transition-opacity">
          <span className="font-oswald font-bold text-[18px] uppercase tracking-wider text-gray-900 whitespace-nowrap">
            Shree Royal Car
          </span>
        </Link>

        {/* Desktop nav â€” absolutely centred */}
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

        {/* Search + Logout â€” pushed to right */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <GlobalSearch />
          <Link
            href="/profile"
            className={`flat-btn-ghost p-1.5 text-gray-500 hover:text-gray-900 ${pathname === '/profile' ? 'text-gray-900' : ''}`}
            title="Profile"
          >
            <UserCircle size={18} strokeWidth={1.5} />
          </Link>
          <Link
            href="/profile"
            className={`flat-btn-ghost p-1.5 text-gray-500 hover:text-gray-900 ${pathname === '/profile' ? 'text-gray-900' : ''}`}
            title="Settings"
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

      {/* Target container for mobile search portal */}
      <div id="mobile-search-container" className="lg:hidden relative" />

      {/* â”€â”€ Mobile-only pill nav strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                    ${isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    }`}
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
