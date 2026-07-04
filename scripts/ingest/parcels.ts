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
  int,
  num,
  parseDate,
  str,
} from "./lib";
import { parcelVector, toVectorLiteral } from "../../src/lib/embeddings";

const BULK_CSV_URL =
  "https://data.wprdc.org/dataset/2b3df818-601e-4f06-b150-643557229491/resource/9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5/download/assessments.csv";
const DATASTORE_RESOURCE_ID = "65855e14-549e-4992-b5be-d629afc676fa";
const BATCH_SIZE = 1000;

const PARCEL_COLUMNS = [
  "parid", "house_num", "fraction", "address", "unit", "city", "state", "zip",
  "muni_code", "muni_desc", "school_code", "school_desc", "neigh_code",
  "neigh_desc", "tax_code", "class", "class_desc", "use_code", "use_desc",
  "lot_area", "homestead", "county_building", "county_land", "county_total",
  "local_total", "fair_market_building", "fair_market_land",
  "fair_market_total", "style_desc", "stories", "year_built", "exterior_desc",
  "roof_desc", "basement_desc", "grade", "grade_desc", "condition",
  "condition_desc", "total_rooms", "bedrooms", "full_baths", "half_baths",
  "heating_cooling_desc", "fireplaces", "basement_garage",
  "finished_living_area", "tax_year", "as_of_date", "embedding",
];

const PARCEL_CONFLICT = `on conflict (parid) do update set ${PARCEL_COLUMNS.filter(
  (c) => c !== "parid"
)
  .map((c) => `${c} = excluded.${c}`)
  .join(", ")}, updated_at = now()`;

type Row = Record<string, unknown>;

function parcelRow(r: Row): unknown[] | null {
  const parid = str(r.PARID);
  if (!parid) return null;
  // Multi-card parcels repeat PARID per building card; keep card 1 only.
  const card = int(r.CARDNUMBER);
  if (card != null && card > 1) return null;

  const characteristics = {
    finished_living_area: num(r.FINISHEDLIVINGAREA),
    lot_area: num(r.LOTAREA),
    bedrooms: int(r.BEDROOMS),
    full_baths: int(r.FULLBATHS),
    half_baths: int(r.HALFBATHS),
    total_rooms: int(r.TOTALROOMS),
    year_built: int(r.YEARBLT),
    stories: num(r.STORIES),
    fireplaces: int(r.FIREPLACES),
    basement_garage: int(r.BSMTGARAGE),
    condition: str(r.CONDITION),
    grade: str(r.GRADE),
    county_total: num(r.COUNTYTOTAL),
  };

  return [
    parid,
    str(r.PROPERTYHOUSENUM), str(r.PROPERTYFRACTION), str(r.PROPERTYADDRESS),
    str(r.PROPERTYUNIT), str(r.PROPERTYCITY), str(r.PROPERTYSTATE),
    str(r.PROPERTYZIP),
    str(r.MUNICODE), str(r.MUNIDESC), str(r.SCHOOLCODE), str(r.SCHOOLDESC),
    str(r.NEIGHCODE), str(r.NEIGHDESC), str(r.TAXCODE),
    str(r.CLASS), str(r.CLASSDESC), str(r.USECODE), str(r.USEDESC),
    num(r.LOTAREA),
    str(r.HOMESTEADFLAG) === "HOM",
    num(r.COUNTYBUILDING), num(r.COUNTYLAND), num(r.COUNTYTOTAL),
    num(r.LOCALTOTAL),
    num(r.FAIRMARKETBUILDING), num(r.FAIRMARKETLAND), num(r.FAIRMARKETTOTAL),
    str(r.STYLEDESC), num(r.STORIES), int(r.YEARBLT), str(r.EXTFINISH_DESC),
    str(r.ROOFDESC), str(r.BASEMENTDESC), str(r.GRADE), str(r.GRADEDESC),
    str(r.CONDITION), str(r.CONDITIONDESC), int(r.TOTALROOMS),
    int(r.BEDROOMS), int(r.FULLBATHS), int(r.HALFBATHS),
    str(r.HEATINGCOOLINGDESC), int(r.FIREPLACES), int(r.BSMTGARAGE),
    num(r.FINISHEDLIVINGAREA), int(r.TAXYEAR), parseDate(r.ASOFDATE),
    toVectorLiteral(parcelVector(characteristics)),
  ];
}

function saleRows(r: Row): unknown[][] {
  const parid = str(r.PARID);
  if (!parid) return [];
  const rows: unknown[][] = [];

  const saleDate = parseDate(r.SALEDATE);
  const salePrice = num(r.SALEPRICE);
  if (saleDate && salePrice != null) {
    const desc = (str(r.SALEDESC) ?? "").toUpperCase();
    rows.push([parid, saleDate, salePrice, str(r.SALECODE), str(r.SALEDESC),
      desc.includes("VALID")]);
  }
  // Prior sales carry no validity code; use a price floor heuristic to skip
  // $1 deed transfers and the like.
  for (const [d, p] of [
    [r.PREVSALEDATE, r.PREVSALEPRICE],
    [r.PREVSALEDATE2, r.PREVSALEPRICE2],
  ]) {
    const date = parseDate(d);
    const price = num(p);
    if (date && price != null) {
      rows.push([parid, date, price, null, "PRIOR SALE", price >= 10000]);
    }
  }
  return rows;
}

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

  async function handle(record: Row) {
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
    for await (const record of parser) await handle(record as Row);
  }

  await flush();
  console.log(`done. parcels: ${parcelCount}, sales: ${saleCount}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
