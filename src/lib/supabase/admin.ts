import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key.
 *
 * ⚠️ Bypasses Row Level Security. NEVER import this from client code or expose
 * the key to the browser. Use only for trusted backend jobs (e.g. populating
 * catalog embeddings) where tenant isolation is enforced in the query itself.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
