import { getPool } from "./db";
import { hasDatabaseUrl } from "./env";

export type HealthCheck = {
  name: string;
  status: "pass" | "fail";
  detail?: string;
};

export type HealthReport = {
  ok: boolean;
  checks: HealthCheck[];
};

/** Minimum parcels expected after seed fixture is applied. */
export const PARCELS_FIXTURE_MINIMUM = 300;

export async function runHealthChecks(): Promise<HealthReport> {
  const checks: HealthCheck[] = [];

  if (!hasDatabaseUrl()) {
    checks.push({
      name: "database_url",
      status: "fail",
      detail: "DATABASE_URL is not set",
    });
    return { ok: false, checks };
  }
  checks.push({ name: "database_url", status: "pass" });

  let pool;
  try {
    pool = getPool();
    await pool.query("select 1");
    checks.push({ name: "postgres_connect", status: "pass" });
  } catch (err) {
    checks.push({
      name: "postgres_connect",
      status: "fail",
      detail: err instanceof Error ? err.message : "connection failed",
    });
    return { ok: false, checks };
  }

  try {
    const { rows } = await pool.query<{ ok: number }>(
      "select extensions.similarity('hello', 'hello') as ok"
    );
    if (Number(rows[0]?.ok) === 1) {
      checks.push({ name: "pg_trgm", status: "pass" });
    } else {
      checks.push({ name: "pg_trgm", status: "fail", detail: "similarity() unexpected result" });
    }
  } catch (err) {
    checks.push({
      name: "pg_trgm",
      status: "fail",
      detail: err instanceof Error ? err.message : "pg_trgm unavailable",
    });
  }

  try {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from parcels"
    );
    const count = Number(rows[0]?.count ?? 0);
    checks.push({
      name: "parcels_count",
      status: count >= PARCELS_FIXTURE_MINIMUM ? "pass" : "fail",
      detail: String(count),
    });
  } catch (err) {
    checks.push({
      name: "parcels_count",
      status: "fail",
      detail: err instanceof Error ? err.message : "parcels table unavailable",
    });
  }

  try {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from sales where is_valid_sale"
    );
    const count = Number(rows[0]?.count ?? 0);
    checks.push({
      name: "sales_count",
      status: count > 0 ? "pass" : "fail",
      detail: String(count),
    });
  } catch (err) {
    checks.push({
      name: "sales_count",
      status: "fail",
      detail: err instanceof Error ? err.message : "sales table unavailable",
    });
  }

  try {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from common_level_ratio"
    );
    const count = Number(rows[0]?.count ?? 0);
    checks.push({
      name: "clr_count",
      status: count >= 6 ? "pass" : "fail",
      detail: String(count),
    });
  } catch (err) {
    checks.push({
      name: "clr_count",
      status: "fail",
      detail: err instanceof Error ? err.message : "common_level_ratio unavailable",
    });
  }

  const ok = checks.every((c) => c.status === "pass");
  return { ok, checks };
}

/** Lightweight connectivity probe for user-facing search error differentiation. */
export async function isDatabaseReachable(): Promise<boolean> {
  if (!hasDatabaseUrl()) return false;
  try {
    await getPool().query("select 1");
    return true;
  } catch {
    return false;
  }
}
