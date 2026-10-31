"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError]     = useState(supabase ? null : "Supabase is not configured. Please contact the administrator.");

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    // Restore session from Supabase (reads JWT from localStorage automatically)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Keep in sync with auth state changes (login / logout / token refresh)
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
      const message = "Supabase is not configured. Please contact the administrator.";
      setError(message);
      setLoading(false);
      return { success: false, error: message };
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

      // Trigger initial populate after login
      try {
        const { initialPopulate } = await import("@/lib/sync-engine");
        await initialPopulate(data.user.id);
      } catch (syncErr) {
        console.warn("[AuthContext] initial sync after login failed:", syncErr.message);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    if (!supabase) return;

    // Warn if there are pending unsynced changes
    try {
      const { getPendingCount } = await import("@/lib/local-repo");
      const pending = await getPendingCount();
      if (pending > 0) {
        const confirmed = window.confirm(
          `You have ${pending} unsynchronised change${pending !== 1 ? "s" : ""} that haven't been uploaded yet.\n\nIf you log out now, these changes will remain stored locally and will sync when you log back in.\n\nProceed with logout?`
        );
        if (!confirmed) return;
      }
    } catch (e) {
      // If local-repo isn't available (SSR / first load), proceed with logout
    }

    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

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
