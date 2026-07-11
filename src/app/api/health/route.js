import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json(
        { status: "unhealthy", database: "Supabase client not initialized" },
        { status: 503 }
      );
    }

    // Ping the DB with a lightweight query
    const start = Date.now();
    const { error } = await supabase.from("customers").select("id").limit(1);
    const latency = Date.now() - start;

    if (error) {
      return NextResponse.json(
        { status: "unhealthy", database: "connection failed", error: error.message },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      latency: `${latency}ms`
    }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { status: "unhealthy", error: err.message },
      { status: 500 }
    );
  }
}
