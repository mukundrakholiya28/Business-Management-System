"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Mail, Lock, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { user, loading: authLoading, login, error: authError } = useAuth();
  const router = useRouter();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [localError, setLocalError] = useState("");

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

  return (
    <div className="flex items-center justify-center min-h-screen bg-page px-4 py-12">
      <div className="w-full max-w-md flat-card animate-fade-in">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <h1 className="font-oswald font-bold text-[35px] uppercase tracking-wider text-gray-900 mb-1">Shree Royal Car</h1>
          <p className="text-xs text-gray-400 font-semibold tracking-wider uppercase">Workshop Manager</p>
        </div>

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
              <input id="si-email" type="email" placeholder="you@shreeroyal.com"
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
            {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : "Sign In"}
          </button>
        </form>

      </div>
    </div>
  );
}
