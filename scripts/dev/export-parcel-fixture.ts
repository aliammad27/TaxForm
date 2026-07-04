/**
 * Builds supabase/fixtures/parcel-fixture.sql from WPRDC open data.
 *
 * Run after changing golden addresses or refreshing the dev fixture:
 *   npx tsx scripts/dev/export-parcel-fixture.ts
 *
 * Requires network access to data.wprdc.org. Does not need a local database.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  DATASTORE_RESOURCE_ID,
  PARCEL_COLUMNS,
  hasValidSale,
  parcelRow,
  recordParid,
  saleRows,
  type ParcelRecord,
} from "../ingest/parcel-mapper";
import { str } from "../ingest/lib";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "supabase/fixtures/parcel-fixture.sql"
);

/** Must resolve in search; used in README and smoke tests. */
const GOLDEN_TARGETS: { label: string; q?: string; filters?: Record<string, string> }[] = [
  { label: "3409 DENNY ST", filters: { PROPERTYHOUSENUM: "3409", PROPERTYADDRESS: "DENNY ST" } },
  { label: "719 mulkerrin", q: "719 mulkerrin" },
  { label: "429 Forbes", filters: { PROPERTYHOUSENUM: "429", PROPERTYADDRESS: "FORBES AVE" } },
];

/** Dense Pittsburgh residential muni for comp clusters when golden anchors lack valid sales. */
const CLUSTER_MUNIS = ["103", "854", "940"];

const TARGET_PARCELS = 420;
const CLUSTER_PAGE_SIZE = 5000;

function sqlLiteral(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return String(value);
  }
  const s = String(value);
  if (s.startsWith("[") && s.endsWith("]")) return `'${s}'::extensions.vector`;
  return `'${s.replace(/'/g, "''")}'`;
}

async function datastoreSearch(
  params: Record<string, string>
): Promise<ParcelRecord[]> {
  const qs = new URLSearchParams({
    resource_id: DATASTORE_RESOURCE_ID,
    limit: "100",
    ...params,
  });
  const url = `https://data.wprdc.org/api/3/action/datastore_search?${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`datastore_search failed: ${res.status}`);
  const json = (await res.json()) as {
    success: boolean;
    result: { records: ParcelRecord[] };
  };
  return json.result.records ?? [];
}

async function* filterPages(
  filters: Record<string, unknown>,
  maxRecords: number
): AsyncGenerator<ParcelRecord[]> {
  let offset = 0;
  while (offset < maxRecords) {
    const limit = Math.min(CLUSTER_PAGE_SIZE, maxRecords - offset);
    const qs = new URLSearchParams({
      resource_id: DATASTORE_RESOURCE_ID,
      limit: String(limit),
      offset: String(offset),
      filters: JSON.stringify(filters),
    });
    const url = `https://data.wprdc.org/api/3/action/datastore_search?${qs}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`datastore_search failed: ${res.status}`);
    const json = (await res.json()) as {
      success: boolean;
      result: { records: ParcelRecord[] };
    };
    const records = json.result.records;
    if (!records.length) return;
    yield records;
    offset += records.length;
    if (records.length < limit) return;
  }
}

function addRecord(records: Map<string, ParcelRecord>, r: ParcelRecord) {
  const key = recordParid(r);
  if (key) records.set(key, r);
}

async function main() {
  const records = new Map<string, ParcelRecord>();

  console.log("Fetching golden addresses...");
  for (const target of GOLDEN_TARGETS) {
    const hits = target.filters
      ? await datastoreSearch({ filters: JSON.stringify(target.filters) })
      : await datastoreSearch({ q: target.q! });
    for (const r of hits) addRecord(records, r);
    console.log(`  ${target.label}: ${hits.length} hits`);
  }

  if (!records.size) {
    throw new Error("Golden address fetch returned zero records");
  }

  // Cluster residential parcels with valid sales for comp engine coverage.
  const clusterMunis = [
    ...new Set(
      [...records.values()]
        .map((r) => str(r.MUNICODE))
        .filter((m): m is string => Boolean(m))
    ),
    ...CLUSTER_MUNIS,
  ];

  console.log("Clustering residential parcels with valid sales...");
  for (const muni of clusterMunis) {
    if (records.size >= TARGET_PARCELS) break;
    let added = 0;
    for await (const page of filterPages({ MUNICODE: muni, CLASS: "R" }, 15000)) {
      for (const r of page) {
        const key = recordParid(r);
        if (!key || records.has(key)) continue;
        if (!hasValidSale(r)) continue;
        records.set(key, r);
        added++;
        if (records.size >= TARGET_PARCELS) break;
      }
      if (records.size >= TARGET_PARCELS) break;
    }
    if (added) console.log(`  muni ${muni}: +${added} (total ${records.size})`);
  }

  // Commercial samples for the commercial score path.
  console.log("Adding commercial parcels...");
  let commercial = 0;
  for (const muni of clusterMunis.slice(0, 2)) {
    for await (const page of filterPages({ MUNICODE: muni, CLASS: "C" }, 3000)) {
      for (const r of page) {
        const key = recordParid(r);
        if (!key || records.has(key)) continue;
        if (!hasValidSale(r)) continue;
        records.set(key, r);
        commercial++;
        if (commercial >= 20) break;
      }
      if (commercial >= 20) break;
    }
    if (commercial >= 20) break;
  }
  console.log(`  added ${commercial} commercial (total ${records.size})`);

  const parcelInserts: string[] = [];
  const saleKeys = new Set<string>();
  const saleInserts: string[] = [];
  const columns = [...PARCEL_COLUMNS, "county"];

  for (const r of records.values()) {
    const row = parcelRow(r);
    if (!row) continue;
    const values = [...row, "Allegheny"].map(sqlLiteral).join(", ");
    parcelInserts.push(`  (${values})`);

    for (const s of saleRows(r)) {
      const key = `${s[0]}|${s[1]}|${s[2]}`;
      if (saleKeys.has(key)) continue;
      saleKeys.add(key);
      saleInserts.push(`  (${s.map(sqlLiteral).join(", ")})`);
    }
  }

  const header = `-- Allegheny parcel fixture for local dev, CI, and smoke tests.
-- Generated by: npx tsx scripts/dev/export-parcel-fixture.ts
-- Do not edit by hand — re-run the export script to refresh.
-- ${records.size} parcels, ${saleInserts.length} sales rows.

`;

  const sql = `${header}insert into public.parcels (${columns.join(", ")})
values
${parcelInserts.join(",\n")}
on conflict (parid) do update set
  ${PARCEL_COLUMNS.filter((c) => c !== "parid")
    .map((c) => `${c} = excluded.${c}`)
    .join(",\n  ")},
  county = excluded.county,
  updated_at = now();

insert into public.sales (parid, sale_date, sale_price, sale_code, sale_desc, is_valid_sale)
values
${saleInserts.join(",\n")}
on conflict (parid, sale_date, sale_price) do update set
  is_valid_sale = excluded.is_valid_sale,
  sale_code = excluded.sale_code,
  sale_desc = excluded.sale_desc;
`;

  mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, sql, "utf8");
  console.log(`Wrote ${records.size} parcels to ${FIXTURE_PATH}`);

  for (const target of GOLDEN_TARGETS) {
    const hit = [...records.values()].find((r) => {
      const line = `${str(r.PROPERTYHOUSENUM) ?? ""} ${str(r.PROPERTYADDRESS) ?? ""}`.toUpperCase();
      const needle = target.label.toUpperCase().replace(/\s+/g, " ");
      return line.includes(needle.split(" ")[0]!) && (
        needle.includes("MULKERRIN") ? line.includes("MULKERRIN") :
        needle.includes("DENNY") ? line.includes("DENNY") :
        needle.includes("FORBES") ? line.includes("FORBES") : true
      );
    });
    if (hit) {
      console.log(`  ${target.label} → ${recordParid(hit)} (${str(hit.PROPERTYHOUSENUM)} ${str(hit.PROPERTYADDRESS)})`);
    } else {
      console.warn(`  WARNING: ${target.label} not found in fixture`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
