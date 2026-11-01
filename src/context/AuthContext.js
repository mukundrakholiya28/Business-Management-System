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
    if (!supabase) return undefined;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    if (!supabase) return;

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

    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, populateDone }}>
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
