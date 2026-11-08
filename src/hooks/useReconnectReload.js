"use client";
/**
 * useReconnectReload
 * Calls the provided callback whenever the app reconnects to the internet
 * after being offline. Used by pages to reload their data automatically.
 *
 * Usage:
 *   useReconnectReload(() => { loadData(); });
 */
import { useEffect } from "react";

const RECONNECT_EVENT = "src-bms:reconnected";

export function useReconnectReload(callback) {
  useEffect(() => {
    if (typeof window === "undefined" || !callback) return;

    const handler = () => {
      // Small delay so the sync engine finishes pulling before we re-read local DB
      setTimeout(callback, 800);
    };

    window.addEventListener(RECONNECT_EVENT, handler);
    return () => window.removeEventListener(RECONNECT_EVENT, handler);
  }, [callback]);
}
