import { Pool } from "pg";

/**
 * Direct Postgres pool for public reference-data queries (parcels, sales,
 * CLR, comps). Client-owned data goes through the Supabase clients so RLS
 * stays the enforcement mechanism.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 5,
      // pgvector's `vector` type lives in the `extensions` schema on Supabase.
      options: "-c search_path=public,extensions",
    });
  }
  return pool;
}
