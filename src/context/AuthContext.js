"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null);
  const [loading, setLoading]       = useState(Boolean(supabase));
  const [error, setError]           = useState(
    supabase ? null : "Supabase is not configured."
  );
  // Fires once after login when background IndexedDB populate completes
  const [populateDone, setPopulateDone] = useState(false);

  useEffect(() => {
    // 1. Immediately check for a previously cached session (instant offline startup)
    let hasLocalSession = false;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cars_last_user") || localStorage.getItem("cars_offline_session");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.id) {
            setUser(parsed);
            setLoading(false);
            hasLocalSession = true;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!supabase) {
      if (!hasLocalSession) setLoading(false);
      return undefined;
    }

    // 2. Query Supabase session without hanging if offline
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
          try {
            localStorage.setItem("cars_last_user", JSON.stringify(session.user));
          } catch {}
        } else if (!hasLocalSession) {
          setUser(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn("[AuthContext] getSession offline fallback:", err.message);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        try {
          localStorage.setItem("cars_last_user", JSON.stringify(session.user));
        } catch {}
      }
      setLoading(false);
    });

    return () => subscription?.unsubscribe?.();
  }, []);

  const loginOffline = () => {
    const offlineUser = {
      id: "offline-user",
      email: "offline@cars.local",
      user_metadata: { name: "Offline User" },
      isOffline: true,
    };
    try {
      localStorage.setItem("cars_offline_session", JSON.stringify(offlineUser));
      localStorage.setItem("cars_last_user", JSON.stringify(offlineUser));
    } catch {}
    setUser(offlineUser);
    setLoading(false);
    return { success: true };
  };

  const login = async (email, password) => {
    setError(null);
    setLoading(true);

    if (!supabase) {
      const msg = "Supabase is not configured.";
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return { success: false, error: authError.message };
      }

      setUser(data.user);
      try {
        localStorage.setItem("cars_last_user", JSON.stringify(data.user));
      } catch {}
      setLoading(false);

      // Kick off IndexedDB populate in the background — does NOT block login redirect
      _backgroundPopulate(data.user.id, () => setPopulateDone((n) => !n));

      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem("cars_last_user");
      localStorage.removeItem("cars_offline_session");
    } catch {}

    try {
      const { getPendingCount } = await import("@/lib/local-repo");
      const pending = await getPendingCount();
      if (pending > 0) {
        const confirmed = window.confirm(
          `You have ${pending} unsynchronised change${pending !== 1 ? "s" : ""} that haven't uploaded yet.\n\nThey will stay stored locally and sync when you log back in.\n\nProceed with logout?`
        );
        if (!confirmed) return;
      }
    } catch {
      // local-repo not available — proceed
    }

    try {
      const { wipeUserData } = await import("@/lib/local-repo");
      await wipeUserData(user?.id);
    } catch (e) {
      console.warn("[AuthContext] wipeUserData error on logout:", e);
    }

    try {
      const { invalidateCache } = await import("@/lib/data-layer");
      invalidateCache();
    } catch {
      // local cache cleanup optional
    }

    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, loginOffline, logout, populateDone }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Background populate (non-blocking) ───────────────────────────────────────

async function _backgroundPopulate(userId, onDone) {
  try {
    const { populateIfEmpty } = await import("@/lib/data-layer");
    const didPopulate = await populateIfEmpty(userId);
    if (didPopulate) onDone?.();
  } catch (e) {
    console.warn("[AuthContext] background populate failed:", e.message);
  }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

export function useProtectedRoute() {
  const { user, loading } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [user, loading, pathname, router]);

  return { user, loading };
}
