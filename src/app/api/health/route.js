import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  let dbStatus = "disconnected";
  let latency = null;

  try {
    if (supabase) {
      // Lightweight 1.5s timeout check so health endpoint never hangs if offline
      const start = Date.now();
      const dbPromise = supabase.from("customers").select("id").limit(1);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database timeout")), 1500)
      );

      const { error } = await Promise.race([dbPromise, timeoutPromise]);
      latency = `${Date.now() - start}ms`;
      dbStatus = error ? "disconnected" : "connected";
    }
  } catch {
    dbStatus = "offline";
  }

  // The local server is always healthy (HTTP 200), regardless of internet/database availability.
  // This allows the Electron desktop app to start in < 300ms even when completely offline.
  return NextResponse.json(
    {
      status: "healthy",
      server: "online",
      database: dbStatus,
      latency,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
