"use client";

/**
 * SyncContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * React context that exposes sync state to the entire app and manages the
 * connectivity watcher lifecycle.
 *
 * Usage:
 *   const { status, pendingCount, failedCount, lastSyncedAt, isOnline, triggerSync } = useSyncStatus();
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

const SyncContext = createContext(null);

export function SyncProvider({ children, userId }) {
  const [syncState, setSyncState] = useState({
    status:       "idle",
    pendingCount: 0,
    failedCount:  0,
    lastSyncedAt: null,
    isOnline:     null,
    error:        null,
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    let unsubscribe;
    let stopWatcher;

    // Dynamic import to avoid SSR issues
    (async () => {
      try {
        const { subscribeSyncState, startConnectivityWatcher, runSync, initialPopulate, getAppSetting } =
          await import("@/lib/sync-engine");

        // Restore last sync time from IndexedDB
        const { getAppSetting: getLS } = await import("@/lib/local-repo");
        const lastSynced = await getLS("last_synced_at").catch(() => null);
        if (lastSynced) {
          setSyncState((s) => ({ ...s, lastSyncedAt: lastSynced }));
        }

        // Subscribe to sync state changes
        unsubscribe = subscribeSyncState((state) => {
          setSyncState(state);
        });

        // Start connectivity watcher
        stopWatcher = startConnectivityWatcher();

        // Run initial sync if user is authenticated
        if (userId) {
          await runSync();
        }
      } catch (err) {
        console.warn("[SyncContext] Failed to initialize sync engine:", err);
      }
    })();

    return () => {
      unsubscribe?.();
      stopWatcher?.();
    };
  }, [isMounted, userId]);

  const triggerSync = useCallback(async () => {
    try {
      const { runSync } = await import("@/lib/sync-engine");
      await runSync();
    } catch (err) {
      console.warn("[SyncContext] triggerSync error:", err);
    }
  }, []);

  const retryFailed = useCallback(async () => {
    try {
      const { resetFailedOps } = await import("@/lib/local-repo");
      const { runSync } = await import("@/lib/sync-engine");
      await resetFailedOps();
      await runSync();
    } catch (err) {
      console.warn("[SyncContext] retryFailed error:", err);
    }
  }, []);

  return (
    <SyncContext.Provider value={{ ...syncState, triggerSync, retryFailed }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncStatus() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    return {
      status:       "idle",
      pendingCount: 0,
      failedCount:  0,
      lastSyncedAt: null,
      isOnline:     null,
      error:        null,
      triggerSync:  () => {},
      retryFailed:  () => {},
    };
  }
  return ctx;
}
