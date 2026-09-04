import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

/**
 * Server-side Supabase client (service_role key, bypasses RLS).
 * Only use in server components, route handlers, and server actions.
 * Never import this from a "use client" file.
 */
export function serverSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let _browserClient: SupabaseClient | null = null;

/**
 * Browser-side Supabase client (anon key, RLS enforced).
 * Safe to use in client components. Cached as a singleton.
 */
export function browserSupabase(): SupabaseClient {
  if (!_browserClient) {
    _browserClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _browserClient;
}
