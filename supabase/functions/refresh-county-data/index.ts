// Scheduled county data refresh.
//
// Invoked by cron (see supabase/config.toml [edge_runtime] notes / README).
// Each invocation:
//   1. Refreshes a chunk of parcels from the WPRDC datastore API, resuming
//      from a cursor in `ingest_state` (full sweep completes across runs).
//   2. Refreshes the BPAAR appeal outcomes dataset (small, bi-weekly updates).
//
// The initial 580k-parcel load is faster via `npm run ingest:parcels` (bulk
// CSV); this function keeps data fresh afterwards.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ASSESSMENTS_RESOURCE = "65855e14-549e-4992-b5be-d629afc676fa";
const APPEALS_RESOURCE = "8a7607fb-c93e-4d7a-9b23-528b5c25b1de";
const PARCEL_PAGES_PER_RUN = 6;
const PAGE_SIZE = 5000;

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.trunc(n);
};
const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const GRADE_SCALE: Record<string, number> = {
  XX: 1.0, X: 0.95, A: 0.85, B: 0.7, C: 0.5, D: 0.3, E: 0.1,
};

// Keep in sync with src/lib/embeddings.ts parcelVector().
function parcelVector(r: Row): number[] {
  const sqft = num(r.FINISHEDLIVINGAREA) ?? 0;
  const lot = num(r.LOTAREA) ?? 0;
  const year = int(r.YEARBLT) ?? 0;
  const grade = str(r.GRADE);
  const letter = grade?.replace(/[^A-ZX]/gi, "").toUpperCase() ?? "";
  const gradeBase = GRADE_SCALE[letter] ?? 0.5;
  const gradeMod = grade?.includes("+") ? 0.05 : grade?.includes("-") ? -0.05 : 0;
  const cond = Number(str(r.CONDITION));
  const condScore = !cond || Number.isNaN(cond) ? 0.5 : clamp01(1 - (cond - 1) / 7);

  return [
    2.0 * clamp01(sqft / 5000),
    1.0 * clamp01(Math.log10(Math.max(lot, 1)) / 6),
    1.5 * clamp01((int(r.BEDROOMS) ?? 0) / 8),
    1.5 * clamp01(((int(r.FULLBATHS) ?? 0) + 0.5 * (int(r.HALFBATHS) ?? 0)) / 6),
    0.8 * clamp01((int(r.TOTALROOMS) ?? 0) / 15),
    1.2 * (year >= 1800 ? clamp01((year - 1800) / 226) : 0.5),
    0.6 * clamp01((num(r.STORIES) ?? 1) / 3),
    0.4 * clamp01((int(r.FIREPLACES) ?? 0) / 3),
    0.4 * clamp01((int(r.BSMTGARAGE) ?? 0) / 3),
    1.0 * condScore,
    1.0 * clamp01(gradeBase + gradeMod),
    0.8 * clamp01(Math.log10(Math.max(num(r.COUNTYTOTAL) ?? 1, 1)) / 7),
    0, 0, 0, 0,
  ];
}

async function datastorePage(resourceId: string, offset: number): Promise<Row[]> {
  const url = `https://data.wprdc.org/api/3/action/datastore_search?resource_id=${resourceId}&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`datastore_search ${res.status}`);
  const json = await res.json();
  return json.result.records as Row[];
}

function parcelRecord(r: Row): Row | null {
  const parid = str(r.PARID);
  if (!parid) return null;
  const card = int(r.CARDNUMBER);
  if (card != null && card > 1) return null;
  return {
    parid,
    house_num: str(r.PROPERTYHOUSENUM),
    fraction: str(r.PROPERTYFRACTION),
    address: str(r.PROPERTYADDRESS),
    unit: str(r.PROPERTYUNIT),
    city: str(r.PROPERTYCITY),
    state: str(r.PROPERTYSTATE),
    zip: str(r.PROPERTYZIP),
    muni_code: str(r.MUNICODE),
    muni_desc: str(r.MUNIDESC),
    school_code: str(r.SCHOOLCODE),
    school_desc: str(r.SCHOOLDESC),
    neigh_code: str(r.NEIGHCODE),
    neigh_desc: str(r.NEIGHDESC),
    tax_code: str(r.TAXCODE),
    class: str(r.CLASS),
    class_desc: str(r.CLASSDESC),
    use_code: str(r.USECODE),
    use_desc: str(r.USEDESC),
    lot_area: num(r.LOTAREA),
    homestead: str(r.HOMESTEADFLAG) === "HOM",
    county_building: num(r.COUNTYBUILDING),
    county_land: num(r.COUNTYLAND),
    county_total: num(r.COUNTYTOTAL),
    local_total: num(r.LOCALTOTAL),
    fair_market_building: num(r.FAIRMARKETBUILDING),
    fair_market_land: num(r.FAIRMARKETLAND),
    fair_market_total: num(r.FAIRMARKETTOTAL),
    style_desc: str(r.STYLEDESC),
    stories: num(r.STORIES),
    year_built: int(r.YEARBLT),
    exterior_desc: str(r.EXTFINISH_DESC),
    roof_desc: str(r.ROOFDESC),
    basement_desc: str(r.BASEMENTDESC),
    grade: str(r.GRADE),
    grade_desc: str(r.GRADEDESC),
    condition: str(r.CONDITION),
    condition_desc: str(r.CONDITIONDESC),
    total_rooms: int(r.TOTALROOMS),
    bedrooms: int(r.BEDROOMS),
    full_baths: int(r.FULLBATHS),
    half_baths: int(r.HALFBATHS),
    heating_cooling_desc: str(r.HEATINGCOOLINGDESC),
    fireplaces: int(r.FIREPLACES),
    basement_garage: int(r.BSMTGARAGE),
    finished_living_area: num(r.FINISHEDLIVINGAREA),
    tax_year: int(r.TAXYEAR),
    embedding: JSON.stringify(parcelVector(r)),
  };
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Parcels chunk, resuming from cursor.
  const { data: state } = await supabase
    .from("ingest_state")
    .select("value")
    .eq("key", "parcels_offset")
    .maybeSingle();
  let offset = (state?.value?.offset as number) ?? 0;
  let parcelsUpserted = 0;

  for (let i = 0; i < PARCEL_PAGES_PER_RUN; i++) {
    const page = await datastorePage(ASSESSMENTS_RESOURCE, offset);
    if (!page.length) {
      offset = 0; // sweep complete; restart next run
      break;
    }
    const records = page
      .map(parcelRecord)
      .filter((r): r is Row => r !== null);
    const { error } = await supabase
      .from("parcels")
      .upsert(records, { onConflict: "parid" });
    if (error) throw new Error(`parcels upsert: ${error.message}`);
    parcelsUpserted += records.length;
    offset += page.length;
    if (page.length < PAGE_SIZE) {
      offset = 0;
      break;
    }
  }

  await supabase.from("ingest_state").upsert({
    key: "parcels_offset",
    value: { offset },
    updated_at: new Date().toISOString(),
  });

  // 2. Appeal outcomes: incremental tail refresh. Dataset is append-mostly;
  // re-pull the last few pages to catch recent dispositions.
  let appealsUpserted = 0;
  {
    const countRes = await fetch(
      `https://data.wprdc.org/api/3/action/datastore_search?resource_id=${APPEALS_RESOURCE}&limit=0`
    );
    const total = (await countRes.json()).result.total as number;
    const start = Math.max(0, total - 3 * PAGE_SIZE);
    for (let off = start; off < total; off += PAGE_SIZE) {
      const page = await datastorePage(APPEALS_RESOURCE, off);
      const rows = page
        .map((r) => {
          const parid = str(r["PARCEL ID"]);
          const taxYear = int(r["TAX YEAR"]);
          if (!parid || !taxYear) return null;
          return {
            tax_year: taxYear,
            parid,
            class: str(r.CLASS),
            tax_status: str(r.TAX_STATUS),
            muni_desc: str(r.MUNI_NAME),
            school_desc: str(r.SCHOOL_DISTRICT),
            hearing_type: str(r.HEARING_TYPE) ?? "",
            complainant: str(r.COMPLAINANT) ?? "",
            hearing_status: str(r.HEARING_STATUS),
            status: str(r.STATUS),
            pre_appeal_land: num(r["PRE APPEAL LAND"]),
            pre_appeal_building: num(r["PRE APPEAL BLDG"]),
            pre_appeal_total: num(r["PRE APPEAL TOTAL"]),
            post_appeal_land: num(r["POST APPEAL LAND"]),
            post_appeal_building: num(r["POST APPEAL BLDG"]),
            post_appeal_total: num(r["POST APPEAL TOTAL"]),
          };
        })
        .filter((r) => r !== null);
      const { error } = await supabase.from("appeal_outcomes").upsert(rows, {
        onConflict: "tax_year,parid,hearing_type,complainant",
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`appeals upsert: ${error.message}`);
      appealsUpserted += rows.length;
    }
  }

  return new Response(
    JSON.stringify({ parcelsUpserted, appealsUpserted, nextParcelOffset: offset }),
    { headers: { "Content-Type": "application/json" } }
  );
});
