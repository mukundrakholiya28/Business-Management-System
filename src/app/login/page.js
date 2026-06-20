"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Mail, Lock, AlertCircle, UserPlus, LogIn } from "lucide-react";

export default function LoginPage() {
  const { user, loading: authLoading, login, error: authError, loginAsDemo } = useAuth();
  const router = useRouter();
  const [tab, setTab]             = useState("signin"); // "signin" | "signup"
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading]     = useState(false);
  const [localError, setLocalError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  // Reset form on tab switch
  useEffect(() => {
    setLocalError(""); setSuccessMsg("");
    setEmail(""); setPassword(""); setConfirmPwd("");
  }, [tab]);

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

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLocalError(""); setSuccessMsg("");
    if (!email || !password || !confirmPwd) { setLocalError("Please fill in all fields."); return; }
    if (password !== confirmPwd) { setLocalError("Passwords do not match."); return; }
    if (password.length < 6) { setLocalError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setLocalError(error.message);
    } else {
      setSuccessMsg("Account created! Check your email to confirm, then sign in.");
      setTab("signin");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-page px-4 py-12">
      <div className="w-full max-w-md flat-card animate-fade-in">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <h1 className="font-vortice text-gray-900 text-xl tracking-wider mb-1">Shree Royal Car</h1>
          <p className="text-xs text-gray-400 font-semibold tracking-wider uppercase">Workshop Manager</p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
          <button
            onClick={() => setTab("signin")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "signin" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <LogIn size={14} strokeWidth={1.5} /> Sign In
          </button>
          <button
            onClick={() => setTab("signup")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "signup" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <UserPlus size={14} strokeWidth={1.5} /> Create Account
          </button>
        </div>

        {/* Success message */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200/50 text-green-700 text-xs font-medium">
            {successMsg}
          </div>
        )}

        {/* Sign In Form */}
        {tab === "signin" && (
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
        )}

        {/* Sign Up Form */}
        {tab === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-4">
            {localError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200/40 text-red-600 text-xs font-medium flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{localError}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="flat-label block" htmlFor="su-email">Email Address</label>
              <div className="relative">
                <Mail size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="su-email" type="email" placeholder="you@shreeroyal.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="flat-input !pl-9" disabled={loading} autoComplete="email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="flat-label block" htmlFor="su-password">Password</label>
              <div className="relative">
                <Lock size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="su-password" type="password" placeholder="Min. 6 characters"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="flat-input !pl-9" disabled={loading} autoComplete="new-password" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="flat-label block" htmlFor="su-confirm">Confirm Password</label>
              <div className="relative">
                <Lock size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="su-confirm" type="password" placeholder="Re-enter password"
                  value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                  className="flat-input !pl-9" disabled={loading} autoComplete="new-password" />
              </div>
            </div>
            <button type="submit" className="flat-btn-primary w-full py-2.5 mt-2 justify-center" disabled={loading}>
              {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : "Create Account"}
            </button>
            <p className="text-[11px] text-center text-gray-400 mt-2">
              A confirmation email will be sent. Verify to activate your account.
            </p>
          </form>
        )}

        {/* Divider and Demo Bypass */}
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 text-center">
          <button
            type="button"
            onClick={loginAsDemo}
            className="w-full justify-center flat-btn text-xs hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
          >
            Demo Mode (Bypass Login)
          </button>
        </div>
      </div>
    </div>
  );
}
