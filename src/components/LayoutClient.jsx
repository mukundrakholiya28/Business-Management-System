"use client";

/**
 * LayoutClient.jsx
 * Client-side layout wrapper that:
 *  1. Wraps the app in SyncProvider (initialises sync engine after auth)
 *  2. Renders the OfflineBanner
 */

import { useAuth } from "@/context/AuthContext";
import { SyncProvider } from "@/context/SyncContext";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export default function LayoutClient({ children }) {
  const { user } = useAuth();

  return (
    <SyncProvider userId={user?.id ?? null}>
      <ServiceWorkerRegistrar />
      {children}
    </SyncProvider>
  );
}
