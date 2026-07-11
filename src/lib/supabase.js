import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Verifies the Supabase JWT token passed in the Authorization header.
 * Returns { authenticated: true, user } if valid, or throws/returns error.
 */
export async function authenticateRequest(request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  
  if (!token) {
    return { authenticated: false, error: "Missing authorization token" };
  }
  
  if (!supabase) {
    return { authenticated: false, error: "Supabase client not initialized" };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { authenticated: false, error: error?.message || "Invalid authorization token" };
    }
    return { authenticated: true, user };
  } catch (err) {
    return { authenticated: false, error: err.message };
  }
}
