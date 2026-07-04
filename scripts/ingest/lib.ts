import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Pool } from "pg";

try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on ambient environment
}

export const DATA_DIR = path.join(process.cwd(), "data");

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    // pgvector's `vector` type lives in the `extensions` schema on Supabase.
    options: "-c search_path=public,extensions",
  });
}

/** Downloads a URL to data/<filename>, skipping if already present. */
export async function download(url: string, filename: string): Promise<string> {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const dest = path.join(DATA_DIR, filename);
  if (existsSync(dest)) {
    console.log(`using cached ${dest}`);
    return dest;
  }
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(dest)
  );
  return dest;
}

/** Pages through a CKAN datastore resource, yielding record batches. */
export async function* datastorePages(
  resourceId: string,
  pageSize = 5000,
  maxRecords = Infinity
): AsyncGenerator<Record<string, unknown>[]> {
  let offset = 0;
  while (offset < maxRecords) {
    const limit = Math.min(pageSize, maxRecords - offset);
    const url = `https://data.wprdc.org/api/3/action/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`datastore_search failed: ${res.status}`);
    const json = (await res.json()) as {
      success: boolean;
      result: { records: Record<string, unknown>[] };
    };
    const records = json.result.records;
    if (!records.length) return;
    yield records;
    offset += records.length;
    if (records.length < limit) return;
  }
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Parses the county's assorted date formats to ISO YYYY-MM-DD, or null. */
export function parseDate(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // YYYY-MM-DD (possibly with time)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // MM-DD-YYYY or MM/DD/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // D-Mon-YY (e.g. 3-Jun-15)
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const yy = Number(m[3]);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${year}-${month}-${m[1].padStart(2, "0")}`;
  }
  // DD-MON-YYYY (e.g. 07-JUL-2020, York PASDA)
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function int(value: unknown): number | null {
  const n = num(value);
  return n == null ? null : Math.trunc(n);
}

export function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/** Executes a multi-row upsert in one statement. */
export async function batchUpsert(
  pool: Pool,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictClause: string
): Promise<void> {
  if (!rows.length) return;
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `(${placeholders.join(",")})`;
  });
  const sql = `insert into ${table} (${columns.join(",")}) values ${tuples.join(",")} ${conflictClause}`;
  await pool.query(sql, params);
}
