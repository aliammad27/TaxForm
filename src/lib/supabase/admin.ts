import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server-only: bypasses RLS. Used for storage uploads,
 * background processing, and writes to service-managed tables.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
