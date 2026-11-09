"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Mail, Lock, AlertCircle, WifiOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { user, loading: authLoading, login, loginOffline, error: authError } = useAuth();
  const router = useRouter();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [localError, setLocalError] = useState("");
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOffline(!navigator.onLine);
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!email || !password) { setLocalError("Please fill in all fields."); return; }
    setLoading(true);
    const result = await login(email, password);
    if (result.success) {
      router.replace("/");
    } else {
      setLocalError(result.error || "Authentication failed.");
      setLoading(false);
    }
  };

  const handleOfflineMode = () => {
    loginOffline();
    router.replace("/");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-page px-4 py-12">
      <div className="w-full max-w-md flat-card animate-fade-in">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <h1 className="font-oswald font-bold text-[35px] uppercase tracking-wider text-gray-900 mb-1">Cars</h1>
          <p className="text-xs text-gray-400 font-semibold tracking-wider uppercase">Business Management System</p>
        </div>

        {isOffline && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between gap-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <WifiOff size={15} className="text-amber-600 shrink-0" />
              <span>Offline: you can work offline with full access to local data.</span>
            </div>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSignIn} className="space-y-4">
          {(localError || authError) && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200/40 text-red-600 text-xs font-medium flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{localError || authError}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="flat-label block" htmlFor="si-email">Email Address</label>
            <div className="relative">
              <Mail size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="si-email" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="flat-input !pl-9" disabled={loading} autoComplete="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="flat-label block" htmlFor="si-password">Password</label>
            <div className="relative">
              <Lock size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="si-password" type="password" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="flat-input !pl-9" disabled={loading} autoComplete="current-password" />
            </div>
          </div>
          <button type="submit" className="flat-btn-primary w-full py-2.5 mt-2 justify-center" disabled={loading}>
            {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : "Sign In to Cloud"}
          </button>
        </form>

        {/* Offline Divider & Action */}
        <div className="mt-5 pt-5 border-t border-gray-100 space-y-3">
          <div className="text-center text-[11px] text-gray-400 uppercase tracking-wider font-medium">
            Offline Access
          </div>
          <button
            type="button"
            onClick={handleOfflineMode}
            className="w-full py-2 px-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium transition-colors flex items-center justify-center gap-2"
          >
            <WifiOff size={13} className="text-gray-500" />
            <span>Continue in Offline Mode</span>
            <ArrowRight size={12} className="text-gray-400" />
          </button>
        </div>

      </div>
    </div>
  );
}
