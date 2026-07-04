/**
 * Ingests Allegheny County parcel assessments (WPRDC) into `parcels` + `sales`.
 *
 * Modes:
 *   npm run ingest:parcels                  # full bulk CSV (~415 MB, ~580k parcels)
 *   npm run ingest:parcels -- --limit 20000 # first N records via datastore API (dev)
 *
 * Idempotent: parcels upsert on parid; sales de-duped by (parid, date, price).
 */
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import {
  batchUpsert,
  datastorePages,
  download,
  getPool,
} from "./lib";
import {
  DATASTORE_RESOURCE_ID,
  PARCEL_COLUMNS,
  parcelRow,
  saleRows,
  type ParcelRecord,
} from "./parcel-mapper";

const BULK_CSV_URL =
  "https://data.wprdc.org/dataset/2b3df818-601e-4f06-b150-643557229491/resource/9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5/download/assessments.csv";
const BATCH_SIZE = 1000;

export { DATASTORE_RESOURCE_ID, PARCEL_COLUMNS, parcelRow, saleRows } from "./parcel-mapper";

const PARCEL_CONFLICT = `on conflict (parid) do update set ${PARCEL_COLUMNS.filter(
  (c) => c !== "parid"
)
  .map((c) => `${c} = excluded.${c}`)
  .join(", ")}, updated_at = now()`;

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  const pool = getPool();

  let parcelCount = 0;
  let saleCount = 0;
  // Keyed maps so a batch never contains the same conflict key twice
  // (multi-row upserts fail on intra-batch duplicates).
  let parcelBatch = new Map<string, unknown[]>();
  let saleBatch = new Map<string, unknown[]>();

  async function flush() {
    if (parcelBatch.size) {
      await batchUpsert(
        pool, "parcels", PARCEL_COLUMNS, [...parcelBatch.values()], PARCEL_CONFLICT
      );
      parcelCount += parcelBatch.size;
      parcelBatch = new Map();
    }
    if (saleBatch.size) {
      // Sales reference parcels; parcels batch is always flushed first.
      await batchUpsert(
        pool,
        "sales",
        ["parid", "sale_date", "sale_price", "sale_code", "sale_desc", "is_valid_sale"],
        [...saleBatch.values()],
        "on conflict (parid, sale_date, sale_price) do update set is_valid_sale = excluded.is_valid_sale"
      );
      saleCount += saleBatch.size;
      saleBatch = new Map();
    }
    if (parcelCount % 20000 < BATCH_SIZE) {
      console.log(`parcels: ${parcelCount}, sales: ${saleCount}`);
    }
  }

  async function handle(record: ParcelRecord) {
    const p = parcelRow(record);
    if (p) {
      parcelBatch.set(String(p[0]), p);
      for (const s of saleRows(record)) {
        saleBatch.set(`${s[0]}|${s[1]}|${s[2]}`, s);
      }
    }
    if (parcelBatch.size >= BATCH_SIZE) await flush();
  }

  if (Number.isFinite(limit)) {
    console.log(`ingesting first ${limit} records via datastore API`);
    for await (const page of datastorePages(DATASTORE_RESOURCE_ID, 5000, limit)) {
      for (const record of page) await handle(record);
    }
  } else {
    const file = await download(BULK_CSV_URL, "assessments.csv");
    const parser = createReadStream(file).pipe(
      parse({ columns: true, relax_column_count: true, bom: true, trim: true })
    );
    for await (const record of parser) await handle(record as ParcelRecord);
  }

  await flush();
  console.log(`done. parcels: ${parcelCount}, sales: ${saleCount}`);
  await pool.end();
}

const isDirectRun =
  process.argv[1]?.includes("parcels.ts") ||
  process.argv[1]?.includes("parcels");

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}