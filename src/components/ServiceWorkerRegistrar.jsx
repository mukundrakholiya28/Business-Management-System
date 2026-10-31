"use client";

/**
 * ServiceWorkerRegistrar
 * Registers /sw.js on first client render.
 * Renders nothing — purely a side-effect component.
 */

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] Registered, scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
  }, []);

  return null;
}
