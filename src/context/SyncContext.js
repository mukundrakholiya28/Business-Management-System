"use client";

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    let unsubscribe;
    let stopWatcher;

    (async () => {
      try {
        const [{ subscribeSyncState, startConnectivityWatcher, runSync }, { getAppSetting }] =
          await Promise.all([
            import("@/lib/sync-engine"),
            import("@/lib/local-repo"),
          ]);

        // Restore persisted last-sync time
        const lastSynced = await getAppSetting("last_synced_at").catch(() => null);
        if (lastSynced) {
          setSyncState((s) => ({ ...s, lastSyncedAt: lastSynced }));
        }

        unsubscribe = subscribeSyncState((state) => setSyncState(state));
        stopWatcher = startConnectivityWatcher();

        // Fire-and-forget — does NOT block rendering
        if (userId) {
          runSync().catch(console.warn);
        }
      } catch (err) {
        console.warn("[SyncContext] init error:", err);
      }
    })();

    return () => {
      unsubscribe?.();
      stopWatcher?.();
    };
  }, [userId]); // re-run when user changes (login/logout)

  const triggerSync = useCallback(async () => {
    try {
      const [{ healNonUuidLocalRecords }, { runSync }] = await Promise.all([
        import("@/lib/local-repo"),
        import("@/lib/sync-engine"),
      ]);
      await healNonUuidLocalRecords?.();
      await runSync({ force: true });
    } catch (err) {
      console.warn("[SyncContext] triggerSync error:", err);
    }
  }, []);

  const retryFailed = useCallback(async () => {
    try {
      const [{ resetFailedOps, cleanupOrphanQueueOps, healNonUuidLocalRecords }, { runSync }] = await Promise.all([
        import("@/lib/local-repo"),
        import("@/lib/sync-engine"),
      ]);
      await healNonUuidLocalRecords?.();
      await cleanupOrphanQueueOps();
      await resetFailedOps();
      await runSync({ force: true });
    } catch (err) {
      console.warn("[SyncContext] retryFailed error:", err);
    }
  }, []);

  const clearFailed = useCallback(async () => {
    try {
      const [{ clearFailedOps }, { runSync }] = await Promise.all([
        import("@/lib/local-repo"),
        import("@/lib/sync-engine"),
      ]);
      await clearFailedOps();
      await runSync({ force: true });
    } catch (err) {
      console.warn("[SyncContext] clearFailed error:", err);
    }
  }, []);

  return (
    <SyncContext.Provider value={{ ...syncState, triggerSync, retryFailed, clearFailed }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncStatus() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    return {
      status: "idle", pendingCount: 0, failedCount: 0,
      lastSyncedAt: null, isOnline: null, error: null,
      triggerSync: () => {}, retryFailed: () => {}, clearFailed: () => {},
    };
  }
  return ctx;
}
