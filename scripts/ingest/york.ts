/**
 * Ingests York County parcels (PASDA YorkCounty MapServer, Sept 2022
 * snapshot) into `parcels` + `sales`.
 *
 *   npm run ingest:york                  # all ~174k parcels
 *   npm run ingest:york -- --limit 20000 # first N (dev)
 *
 * Idempotent: parcels upsert on parid; sales de-duped by (parid, date, price).
 *
 * Source notes:
 *   - APRTOTAL is York's assessed value (base-year system, PDR 100), which is
 *     what an appeal reduces — it maps to county_total. York publishes no
 *     separate full-market opinion, so fair_market_total stays null.
 *   - Each parcel carries only its most recent sale (SALEDT/PRICE) plus an
 *     undated PREV_PRICE, which is skipped.
 */
import { batchUpsert, getPool, int, num, parseDate, str } from "./lib";
import { parcelVector, toVectorLiteral } from "../../src/lib/embeddings";

const LAYER =
  "https://mapservices.pasda.psu.edu/server/rest/services/pasda/YorkCounty/MapServer/31/query";
const MUNI_LAYER =
  "https://mapservices.pasda.psu.edu/server/rest/services/pasda/YorkCounty/MapServer/30/query";
const PAGE_SIZE = 1000; // server maxRecordCount
const BATCH_SIZE = 1000;
const SNAPSHOT_DATE = "2022-09-01";
const SNAPSHOT_YEAR = 2022;

const OUT_FIELDS = [
  "PIDN", "DISTRICT", "PROPADR", "SITE_ST_NO", "CLASS", "LUC", "ACRES",
  "STYLE", "NUM_STORIE", "RES_LIVING", "YRBLT", "APRLAND", "APRBLDG",
  "APRTOTAL", "SALEDT", "PRICE", "SCHOOL_DIS", "COMM_YEAR_", "COMM_BUILD",
  "GRADE", "CDU",
].join(",");

const CLASS_DESC: Record<string, string> = {
  R: "RESIDENTIAL",
  C: "COMMERCIAL",
  I: "INDUSTRIAL",
  A: "AGRICULTURAL",
  F: "FARM/FOREST",
  E: "EXEMPT",
  U: "UTILITY",
};

// School district code -> name, per the county treasurer's millage table.
// West Shore SD spans four collection codes (17F/17G/17L/17N).
const SCHOOL_DESC: Record<string, string> = {
  "002": "Central",
  "004": "Dallastown",
  "006": "Dover",
  "008": "Eastern",
  "010": "Hanover",
  "012": "Northeastern",
  "014": "Northern",
  "016": "Red Lion",
  "018": "Southeastern",
  "020": "Southwestern",
  "022": "Southern",
  "024": "Spring Grove",
  "026": "West York",
  "028": "York City",
  "030": "York Suburban",
  "17F": "West Shore",
  "17G": "West Shore",
  "17L": "West Shore",
  "17N": "West Shore",
};

// CDU (condition/desirability/utility) letter codes -> the 1..8 numeric scale
// parcelVector expects, plus a display label.
const CDU_MAP: Record<string, { code: string; desc: string }> = {
  EX: { code: "1", desc: "EXCELLENT" },
  VG: { code: "2", desc: "VERY GOOD" },
  GD: { code: "3", desc: "GOOD" },
  AV: { code: "4", desc: "AVERAGE" },
  FR: { code: "5", desc: "FAIR" },
  PR: { code: "6", desc: "POOR" },
  VP: { code: "7", desc: "VERY POOR" },
  UN: { code: "8", desc: "UNSOUND" },
};

const PARCEL_COLUMNS = [
  "parid", "county", "house_num", "address", "muni_code", "muni_desc",
  "school_code", "school_desc", "class", "class_desc", "use_code", "lot_area",
  "county_building", "county_land", "county_total", "style_desc", "stories",
  "year_built", "grade", "grade_desc", "condition", "condition_desc",
  "finished_living_area", "tax_year", "as_of_date", "embedding",
];

const PARCEL_CONFLICT = `on conflict (parid) do update set ${PARCEL_COLUMNS.filter(
  (c) => c !== "parid"
)
  .map((c) => `${c} = excluded.${c}`)
  .join(", ")}, updated_at = now()`;

type Attrs = Record<string, unknown>;

async function fetchJson(url: string): Promise<Attrs> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  const json = (await res.json()) as Attrs & { error?: { message?: string } };
  if (json.error) throw new Error(`ArcGIS error: ${json.error.message}`);
  return json;
}

async function fetchMuniNames(): Promise<Map<string, string>> {
  const json = (await fetchJson(
    `${MUNI_LAYER}?where=1%3D1&outFields=DISTRICT,MUNI_NAME&returnGeometry=false&f=json`
  )) as { features: { attributes: Attrs }[] };
  const map = new Map<string, string>();
  for (const f of json.features) {
    const dist = str(f.attributes.DISTRICT);
    const name = str(f.attributes.MUNI_NAME);
    if (dist && name) map.set(dist, name);
  }
  return map;
}

async function* parcelPages(limit: number): AsyncGenerator<Attrs[]> {
  let offset = 0;
  while (offset < limit) {
    const count = Math.min(PAGE_SIZE, limit - offset);
    const url =
      `${LAYER}?where=PIDN+IS+NOT+NULL&outFields=${OUT_FIELDS}` +
      `&returnGeometry=false&orderByFields=OBJECTID` +
      `&resultOffset=${offset}&resultRecordCount=${count}&f=json`;
    const json = (await fetchJson(url)) as {
      features: { attributes: Attrs }[];
      exceededTransferLimit?: boolean;
    };
    const attrs = json.features.map((f) => f.attributes);
    if (!attrs.length) return;
    yield attrs;
    offset += attrs.length;
    if (attrs.length < count && !json.exceededTransferLimit) return;
  }
}

function parcelRow(r: Attrs, muniNames: Map<string, string>): unknown[] | null {
  const parid = str(r.PIDN);
  if (!parid) return null;

  // Districts 01-15 are York City wards; the boundary layer only lists the
  // city itself (as district 10), so map wards to the city by hand.
  const district = str(r.DISTRICT);
  const districtNum = district ? Number(district) : NaN;
  const muniName =
    districtNum >= 1 && districtNum <= 15
      ? "YORK CITY"
      : district
        ? (muniNames.get(district) ?? null)
        : null;
  const schoolCode = str(r.SCHOOL_DIS);
  const schoolDesc = schoolCode ? (SCHOOL_DESC[schoolCode] ?? null) : null;
  const cls = str(r.CLASS);
  const cdu = CDU_MAP[str(r.CDU)?.toUpperCase() ?? ""] ?? null;

  const acres = num(r.ACRES);
  const lotArea = acres != null ? Math.round(acres * 43560) : null;
  const resLiving = num(r.RES_LIVING);
  const commBuild = num(r.COMM_BUILD);
  const livingArea =
    resLiving && resLiving > 0
      ? resLiving
      : commBuild && commBuild > 0
        ? commBuild
        : null;
  const yrBlt = int(r.YRBLT);
  const commYear = int(r.COMM_YEAR_);
  const yearBuilt = yrBlt && yrBlt > 0 ? yrBlt : commYear && commYear > 0 ? commYear : null;
  const stories = num(r.NUM_STORIE);

  // Strip the leading house number from PROPADR so the generated full_address
  // (house_num + address + city) doesn't repeat it.
  const propadr = str(r.PROPADR);
  const siteNo = int(r.SITE_ST_NO);
  const houseNum = siteNo && siteNo > 0 ? String(siteNo) : null;
  let address = propadr;
  if (address && houseNum && address.startsWith(`${houseNum} `)) {
    address = address.slice(houseNum.length + 1);
  }

  const countyTotal = num(r.APRTOTAL);

  const embedding = parcelVector({
    finished_living_area: livingArea,
    lot_area: lotArea,
    bedrooms: null,
    full_baths: null,
    half_baths: null,
    total_rooms: null,
    year_built: yearBuilt,
    stories: stories && stories > 0 ? stories : null,
    fireplaces: null,
    basement_garage: null,
    condition: cdu?.code ?? null,
    grade: str(r.GRADE),
    county_total: countyTotal,
  });

  return [
    parid, "York", houseNum, address, district, muniName,
    schoolCode, schoolDesc, cls, cls ? (CLASS_DESC[cls] ?? null) : null,
    str(r.LUC), lotArea,
    num(r.APRBLDG), num(r.APRLAND), countyTotal, str(r.STYLE),
    stories && stories > 0 ? stories : null, yearBuilt,
    str(r.GRADE), null, cdu?.code ?? null, cdu?.desc ?? null,
    livingArea, SNAPSHOT_YEAR, SNAPSHOT_DATE,
    toVectorLiteral(embedding),
  ];
}

function saleRow(r: Attrs): unknown[] | null {
  const parid = str(r.PIDN);
  const saleDate = parseDate(r.SALEDT);
  const salePrice = num(r.PRICE);
  if (!parid || !saleDate || salePrice == null || salePrice <= 0) return null;
  // No validity/deed code in this layer; a price floor filters $1 transfers.
  return [parid, saleDate, salePrice, null, "DEED SALE", salePrice >= 10000];
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  const pool = getPool();

  console.log("fetching municipality names...");
  const muniNames = await fetchMuniNames();
  console.log(`${muniNames.size} municipalities`);

  let parcelCount = 0;
  let saleCount = 0;

  for await (const page of parcelPages(limit)) {
    const parcelBatch = new Map<string, unknown[]>();
    const saleBatch = new Map<string, unknown[]>();
    for (const attrs of page) {
      const p = parcelRow(attrs, muniNames);
      if (!p) continue;
      parcelBatch.set(String(p[0]), p);
      const s = saleRow(attrs);
      if (s) saleBatch.set(`${s[0]}|${s[1]}|${s[2]}`, s);
    }
    await batchUpsert(
      pool, "parcels", PARCEL_COLUMNS, [...parcelBatch.values()], PARCEL_CONFLICT
    );
    await batchUpsert(
      pool,
      "sales",
      ["parid", "sale_date", "sale_price", "sale_code", "sale_desc", "is_valid_sale"],
      [...saleBatch.values()],
      "on conflict (parid, sale_date, sale_price) do update set is_valid_sale = excluded.is_valid_sale"
    );
    parcelCount += parcelBatch.size;
    saleCount += saleBatch.size;
    if (parcelCount % 20000 < BATCH_SIZE) {
      console.log(`parcels: ${parcelCount}, sales: ${saleCount}`);
    }
  }

  console.log(`done. parcels: ${parcelCount}, sales: ${saleCount}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
