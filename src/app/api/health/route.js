import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json(
        { status: "unhealthy" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Ping the DB with a lightweight query
    const start = Date.now();
    const { error } = await supabase.from("customers").select("id").limit(1);
    const latency = Date.now() - start;

    if (error) {
      return NextResponse.json(
        { status: "unhealthy" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      latency: `${latency}ms`
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Health check failed", err);
    return NextResponse.json(
      { status: "unhealthy" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
