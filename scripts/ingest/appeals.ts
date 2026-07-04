/**
 * Ingests historical BPAAR appeal dispositions (WPRDC, tax years 2015-2026)
 * into `appeal_outcomes`. This is the training data for the Predictive
 * Adjudication Model.
 *
 *   npm run ingest:appeals                  # everything
 *   npm run ingest:appeals -- --limit 5000  # first N records (dev)
 */
import { batchUpsert, datastorePages, getPool, int, num, parseDate, str } from "./lib";

const RESOURCE_ID = "8a7607fb-c93e-4d7a-9b23-528b5c25b1de";
const BATCH_SIZE = 1000;

const COLUMNS = [
  "tax_year", "parid", "class", "tax_status", "muni_desc", "school_desc",
  "hearing_type", "complainant", "hearing_status", "status",
  "pre_appeal_land", "pre_appeal_building", "pre_appeal_total",
  "post_appeal_land", "post_appeal_building", "post_appeal_total",
  "hearing_date", "disposition_date",
];

const CONFLICT = `on conflict (tax_year, parid, hearing_type, complainant) do update set
  status = excluded.status,
  hearing_status = excluded.hearing_status,
  post_appeal_land = excluded.post_appeal_land,
  post_appeal_building = excluded.post_appeal_building,
  post_appeal_total = excluded.post_appeal_total,
  hearing_date = excluded.hearing_date,
  disposition_date = excluded.disposition_date`;

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  const pool = getPool();

  let count = 0;
  let batch: unknown[][] = [];
  const seen = new Set<string>();

  async function flush() {
    if (!batch.length) return;
    await batchUpsert(pool, "appeal_outcomes", COLUMNS, batch, CONFLICT);
    count += batch.length;
    batch = [];
    console.log(`appeal outcomes: ${count}`);
  }

  for await (const page of datastorePages(RESOURCE_ID, 5000, limit)) {
    for (const r of page) {
      const parid = str(r["PARCEL ID"]);
      const taxYear = int(r["TAX YEAR"]);
      if (!parid || !taxYear) continue;
      const hearingType = str(r.HEARING_TYPE) ?? "";
      const complainant = str(r.COMPLAINANT) ?? "";
      // De-dupe within the run on the upsert key to avoid multi-row conflicts.
      const key = `${taxYear}|${parid}|${hearingType}|${complainant}`;
      if (seen.has(key)) continue;
      seen.add(key);
      batch.push([
        taxYear, parid, str(r.CLASS), str(r.TAX_STATUS), str(r.MUNI_NAME),
        str(r.SCHOOL_DISTRICT), hearingType, complainant,
        str(r.HEARING_STATUS), str(r.STATUS),
        num(r["PRE APPEAL LAND"]), num(r["PRE APPEAL BLDG"]),
        num(r["PRE APPEAL TOTAL"]),
        num(r["POST APPEAL LAND"]), num(r["POST APPEAL BLDG"]),
        num(r["POST APPEAL TOTAL"]),
        parseDate(r["HEARING DATE"]), parseDate(r["DISPO DATE"]),
      ]);
      if (batch.length >= BATCH_SIZE) await flush();
    }
  }

  await flush();
  console.log(`done. appeal outcomes: ${count}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
