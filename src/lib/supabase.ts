/**
 * Supabase browser client for Realtime subscriptions.
 *
 * NOTE: You must enable Realtime on the `games` table in the Supabase dashboard:
 *   Database → Replication → Enable for `games` table
 *
 * When `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset,
 * returns null so the dashboard still loads (live score updates are skipped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: Promise<SupabaseClient> | null = null;

/** Loaded on first use: supabase-js is about 76 KB gzipped and only the live slate needs it. */
export function getSupabaseBrowser(): Promise<SupabaseClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Promise.resolve(null);
  browserClient ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(url, key));
  return browserClient;
}
