"use client";

/**
 * OfflineBanner.jsx
 * Non-intrusive banner that appears at the top when the app goes offline.
 */

import { useSyncStatus } from "@/context/SyncContext";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const { status } = useSyncStatus();

  if (status !== "offline") return null;

  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2
                 bg-gray-800 text-white text-xs py-1.5 px-4 text-center"
    >
      <WifiOff size={12} strokeWidth={2} />
      <span>You&rsquo;re offline — your changes are saved locally and will sync when you reconnect.</span>
    </div>
  );
}
