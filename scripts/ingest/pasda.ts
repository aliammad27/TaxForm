/**
 * Config-driven PASDA ArcGIS ingest for Phase 4 batch-onboarded counties.
 *
 *   npm run ingest:pasda -- --county Cumberland [--limit 20000]
 *
 * Each county config maps its PASDA layer's fields onto the shared parcels /
 * sales schema. Parcel IDs are normalized to alphanumerics (dashes/dots/
 * slashes stripped) so they survive URL routing and ID search. Assessed
 * values map to county_total; these base-year counties publish no separate
 * full-market opinion, so fair_market_total stays null.
 *
 * Idempotent: parcels upsert on parid; sales de-duped by (parid, date, price).
 */
import { batchUpsert, getPool, int, num, parseDate, str } from "./lib";
import { parcelVector, toVectorLiteral } from "../../src/lib/embeddings";

const PAGE_SIZE = 1000;

type Attrs = Record<string, unknown>;

type CountyConfig = {
  county: string;
  layerUrl: string;
  /** ISO date of the PASDA snapshot (becomes as_of_date). */
  snapshotDate: string;
  where?: string;
  fields: string[];
  map: (r: Attrs) => {
    parid: string | null;
    address: string | null;
    city: string | null;
    zip: string | null;
    muniCode: string | null;
    muniDesc: string | null;
    schoolCode: string | null;
    schoolDesc: string | null;
    cls: string | null;
    clsDesc: string | null;
    useCode: string | null;
    lotArea: number | null;
    countyLand: number | null;
    countyBuilding: number | null;
    countyTotal: number | null;
    yearBuilt: number | null;
    stories: number | null;
    bedrooms: number | null;
    fullBaths: number | null;
    halfBaths: number | null;
    totalRooms: number | null;
    condition: string | null; // 1..8 numeric code as string
    conditionDesc: string | null;
    grade: string | null;
    styleDesc: string | null;
    livingArea: number | null;
    salePrice: number | null;
    saleDate: string | null;
  };
};

/** Normalizes county parcel IDs to bare alphanumerics. */
function normalizeParid(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const cleaned = s.replace(/[^0-9A-Za-z]/g, "");
  return cleaned.length >= 6 ? cleaned : null;
}

/** ArcGIS epoch-ms date field to ISO date. */
function epochDate(value: unknown): string | null {
  const n = num(value);
  if (n == null || n <= 0) return null;
  return new Date(n).toISOString().slice(0, 10);
}

const CLASS_DESC: Record<string, string> = {
  R: "RESIDENTIAL",
  C: "COMMERCIAL",
  I: "INDUSTRIAL",
  A: "AGRICULTURAL",
  V: "VACANT",
  E: "EXEMPT",
  U: "UTILITY",
};

/** Letter condition codes (AV/GD/...) to the 1..8 scale parcelVector expects. */
const LETTER_CONDITION: Record<string, { code: string; desc: string }> = {
  EX: { code: "1", desc: "EXCELLENT" },
  VG: { code: "2", desc: "VERY GOOD" },
  GD: { code: "3", desc: "GOOD" },
  AV: { code: "4", desc: "AVERAGE" },
  FR: { code: "5", desc: "FAIR" },
  PR: { code: "6", desc: "POOR" },
  VP: { code: "7", desc: "VERY POOR" },
  UN: { code: "8", desc: "UNSOUND" },
};

function letterCondition(value: unknown) {
  return LETTER_CONDITION[(str(value) ?? "").toUpperCase()] ?? null;
}

/**
 * First-letter class mapping shared by counties using CAMA-style property
 * type codes (R/RT/RO.., C1/CX.., A.., L1/L2 lots, V vacant, E/X exempt).
 */
function camaClass(value: unknown): string | null {
  const first = (str(value) ?? "").charAt(0).toUpperCase();
  if (!first) return null;
  if (first === "L") return "V";
  if (first === "X") return "E";
  return "RCIAVEU".includes(first) ? first : "E";
}

const CONFIGS: Record<string, CountyConfig> = {
  Cumberland: {
    county: "Cumberland",
    layerUrl:
      "https://apps.pasda.psu.edu/arcgis/rest/services/PA_Parcels_2022/MapServer/11",
    snapshotDate: "2021-09-01",
    fields: [
      "PIN", "SITUS", "P_TYPE", "LUC", "LAND_VAL", "BLDG_VAL", "TOTAL_VAL",
      "SALEPRICE", "SALEDATE", "YEAR_BLT", "MUNI_CODE", "MUNI_NAME",
      "STORY_HEIG", "DWELLING_T", "FULL_BATH_", "HALF_BATH_", "TOTAL_ROOM",
      "BEDROOM_CO", "SQFT", "DEEDED_AC",
    ],
    map: (r) => {
      const cls = camaClass(r.P_TYPE);
      const acres = num(r.DEEDED_AC);
      return {
        parid: normalizeParid(r.PIN),
        address: str(r.SITUS),
        city: str(r.MUNI_NAME),
        zip: null,
        muniCode: str(r.MUNI_CODE),
        muniDesc: str(r.MUNI_NAME),
        schoolCode: null,
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.LUC),
        lotArea: acres != null && acres > 0 ? Math.round(acres * 43560) : null,
        countyLand: num(r.LAND_VAL),
        countyBuilding: num(r.BLDG_VAL),
        countyTotal: num(r.TOTAL_VAL),
        yearBuilt: int(r.YEAR_BLT),
        stories: num(r.STORY_HEIG),
        bedrooms: int(r.BEDROOM_CO) || null,
        fullBaths: int(r.FULL_BATH_) || null,
        halfBaths: int(r.HALF_BATH_) || null,
        totalRooms: int(r.TOTAL_ROOM) || null,
        condition: null,
        conditionDesc: null,
        grade: null,
        styleDesc: str(r.DWELLING_T),
        livingArea: (num(r.SQFT) ?? 0) > 0 ? num(r.SQFT) : null,
        salePrice: num(r.SALEPRICE),
        saleDate: epochDate(r.SALEDATE),
      };
    },
  },

  Montgomery: {
    county: "Montgomery",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/MontgomeryCounty/MapServer/14",
    snapshotDate: "2025-12-01",
    fields: [
      "PARCEL", "CLASS", "ASSESSMENT", "YEAR_BUILT", "MUNI_CODE", "Muni_Name",
      "SCH_DIST", "LAND_USE", "LOCATION1", "LOC_ZIP1_Z", "SALE_DATE",
      "CONSIDERAT", "SFLA", "STORIES", "BEDROOMS", "BATHS", "HALF_BATHS",
      "RM_TOT", "CONDITION", "STYLE", "LAND_SF", "COMM_AREA", "COMM_YR_BL",
    ],
    map: (r) => {
      const cls = str(r.CLASS);
      const sfla = num(r.SFLA);
      const commArea = num(r.COMM_AREA);
      const yearBuilt = int(r.YEAR_BUILT) || int(r.COMM_YR_BL) || null;
      // Montgomery CONDITION is already a numeric 1..n scale.
      const condition = /^\d$/.test(str(r.CONDITION) ?? "")
        ? str(r.CONDITION)
        : null;
      return {
        parid: normalizeParid(r.PARCEL),
        address: str(r.LOCATION1),
        city: str(r.Muni_Name),
        zip: str(r.LOC_ZIP1_Z)?.slice(0, 5) ?? null,
        muniCode: str(r.MUNI_CODE),
        muniDesc: str(r.Muni_Name),
        schoolCode: str(r.SCH_DIST),
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.LAND_USE),
        lotArea: (num(r.LAND_SF) ?? 0) > 0 ? num(r.LAND_SF) : null,
        countyLand: null,
        countyBuilding: null,
        countyTotal: num(r.ASSESSMENT),
        yearBuilt,
        stories: num(r.STORIES),
        bedrooms: int(r.BEDROOMS),
        fullBaths: int(r.BATHS),
        halfBaths: int(r.HALF_BATHS),
        totalRooms: int(r.RM_TOT),
        condition,
        conditionDesc: null,
        grade: null,
        styleDesc: str(r.STYLE),
        livingArea:
          sfla && sfla > 0 ? sfla : commArea && commArea > 0 ? commArea : null,
        salePrice: num(r.CONSIDERAT),
        saleDate: parseDate(r.SALE_DATE),
      };
    },
  },

  Butler: {
    county: "Butler",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/ButlerCounty/MapServer/0",
    snapshotDate: "2023-04-01",
    fields: [
      "PIN", "DPIN", "Paddr1", "Paddr3", "DistrictDe", "Schdist", "luc",
      "Asmtland", "Asmtbldg", "AssessedVa", "LastSalePr", "LastSaleDa",
    ],
    map: (r) => {
      const luc = (str(r.luc) ?? "").toUpperCase().replace(/\s+/g, "");
      const LUC_CLASS: Record<string, string> = {
        LRES: "R", COND: "R", DUPX: "R", MOD: "R", MODN: "R", TRR: "R",
        TRIX: "R", SEAS: "R", TRLR: "R", DTRL: "R", RESC: "R",
        COMM: "C", COM: "C", COM2: "C", COMX: "C", APT: "C", HOTE: "C",
        HSCM: "C", "R/CM": "C", CORT: "C", CLUB: "C", CCON: "C", GOLF: "C",
        IND: "I", MINR: "I", TOWR: "U", LHT: "U", MAST: "U",
        FARM: "A", AG1: "A", AG2: "A", PURD: "A", GAME: "A", "D-WL": "A",
        VAC: "V", LOTB: "V", VACT: "V", OS: "V",
      };
      const cls = LUC_CLASS[luc] ?? "E";
      // Paddr3 like "EVANS CITY PA 16033"
      const paddr3 = str(r.Paddr3);
      const zipMatch = paddr3?.match(/(\d{5})(?:-\d{4})?$/);
      const city = paddr3?.replace(/\s+PA\s+[\d-]+$/, "").trim() ?? null;
      return {
        parid: normalizeParid(r.PIN),
        address: str(r.Paddr1),
        city: city || null,
        zip: zipMatch?.[1] ?? null,
        muniCode: null,
        muniDesc: str(r.DistrictDe),
        schoolCode: str(r.Schdist),
        schoolDesc: null,
        cls,
        clsDesc: CLASS_DESC[cls] ?? null,
        useCode: luc || null,
        lotArea: null,
        countyLand: num(r.Asmtland),
        countyBuilding: num(r.Asmtbldg),
        countyTotal: num(r.AssessedVa),
        yearBuilt: null,
        stories: null,
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: null,
        conditionDesc: null,
        grade: null,
        styleDesc: null,
        livingArea: null,
        salePrice: num(r.LastSalePr),
        saleDate: epochDate(r.LastSaleDa),
      };
    },
  },

  Juniata: {
    county: "Juniata",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/JuniataCounty/MapServer/0",
    snapshotDate: "2024-08-01",
    fields: [
      "UPI_Number", "PARCELID", "Physical_A", "Township", "School_Dis",
      "Land_Type", "Land_Code", "Stories", "Grade", "Square_Foo",
      "Year_Built", "Land_Value", "Improvemen", "Total_Valu", "Sale_Price",
      "Sale_Date", "Calc_AC",
    ],
    map: (r) => {
      const cls = camaClass(r.Land_Type);
      const sqft = num(r.Square_Foo);
      const yearBuilt = int(r.Year_Built);
      const acres = num(r.Calc_AC);
      return {
        parid: normalizeParid(r.UPI_Number),
        address: str(r.Physical_A),
        city: str(r.Township),
        zip: null,
        muniCode: null,
        muniDesc: str(r.Township),
        schoolCode: str(r.School_Dis),
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.Land_Code),
        lotArea: acres != null && acres > 0 ? Math.round(acres * 43560) : null,
        countyLand: num(r.Land_Value),
        countyBuilding: num(r.Improvemen),
        countyTotal: num(r.Total_Valu),
        yearBuilt: yearBuilt && yearBuilt > 0 ? yearBuilt : null,
        stories: num(r.Stories),
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: null,
        conditionDesc: null,
        grade: str(r.Grade),
        styleDesc: null,
        livingArea: sqft && sqft > 0 ? sqft : null,
        salePrice: num(r.Sale_Price),
        saleDate: epochDate(r.Sale_Date),
      };
    },
  },

  Indiana: {
    county: "Indiana",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/IndianaCounty/MapServer/5",
    snapshotDate: "2023-11-01",
    fields: [
      "PARCEL_ID", "DISTRICT_1", "SCHOOL_DIS", "PROPERTY_T", "LAND_USE_C",
      "ADDRESS_1", "CITY", "ZIP", "SALE_DATE", "SALE_PRICE", "NEW_MV_LAN",
      "NEW_MV_BLD", "NEW_MV_TOT", "LIVING_ARE", "CONDITION_", "STORIES_CL",
      "DEEDED_ACR",
    ],
    map: (r) => {
      const cls = camaClass(r.PROPERTY_T);
      const cdu = letterCondition(r.CONDITION_);
      const acres = num(r.DEEDED_ACR);
      const living = num(r.LIVING_ARE);
      return {
        parid: normalizeParid(r.PARCEL_ID),
        address: str(r.ADDRESS_1),
        city: str(r.CITY),
        zip: str(r.ZIP)?.slice(0, 5) ?? null,
        muniCode: str(r.DISTRICT_1),
        muniDesc: null,
        schoolCode: str(r.SCHOOL_DIS),
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.LAND_USE_C),
        lotArea: acres != null && acres > 0 ? Math.round(acres * 43560) : null,
        countyLand: num(r.NEW_MV_LAN),
        countyBuilding: num(r.NEW_MV_BLD),
        countyTotal: num(r.NEW_MV_TOT),
        yearBuilt: null,
        stories: num(r.STORIES_CL),
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: cdu?.code ?? null,
        conditionDesc: cdu?.desc ?? null,
        grade: null,
        styleDesc: null,
        livingArea: living && living > 0 ? living : null,
        salePrice: num(r.SALE_PRICE),
        saleDate: parseDate(r.SALE_DATE),
      };
    },
  },

  Chester: {
    county: "Chester",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/ChesterCounty/MapServer/11",
    snapshotDate: "2023-12-01",
    fields: [
      "UPI", "PIN_ASMNT", "LOC_ADDRES", "MUNI", "ST_NUM", "ST_NAME", "ST_TYPE",
      "CLASS", "LUC", "SCHDIST", "LOT_ASSESS", "PROP_ASSES", "TOT_ASSESS",
      "LAST_SALE_", "SQFT_PLAN_",
    ],
    map: (r) => {
      const cls = camaClass(r.CLASS ?? r.LUC);
      const street = [str(r.ST_NUM), str(r.ST_NAME), str(r.ST_TYPE)]
        .filter(Boolean)
        .join(" ");
      return {
        parid: normalizeParid(r.PIN_ASMNT ?? r.UPI),
        address: str(r.LOC_ADDRES) ?? (street || null),
        city: str(r.MUNI),
        zip: null,
        muniCode: null,
        muniDesc: str(r.MUNI),
        schoolCode: str(r.SCHDIST),
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.LUC),
        lotArea: null,
        countyLand: num(r.LOT_ASSESS),
        countyBuilding: num(r.PROP_ASSES),
        countyTotal: num(r.TOT_ASSESS),
        yearBuilt: null,
        stories: null,
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: null,
        conditionDesc: null,
        grade: null,
        styleDesc: null,
        livingArea: num(r.SQFT_PLAN_),
        salePrice: num(r.LAST_SALE_),
        saleDate: null,
      };
    },
  },

  Bedford: {
    county: "Bedford",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/BedfordCounty/MapServer/0",
    snapshotDate: "2023-07-01",
    fields: [
      "CONTROL_NO", "municipali", "SCHOOL_DIS", "LAND_USE_C", "SITUS_DESC",
      "LAND_VAL", "IMPROV_VAL", "TOT_VAL", "SALE_AMT", "SALE_YEAR", "SALE_MTH",
      "SALE_DAY", "SALE_CENTU", "GROSS_LIVI", "YEAR_BUILT",
    ],
    map: (r) => {
      const cls = camaClass(r.LAND_USE_C);
      const year = int(r.SALE_YEAR);
      const month = int(r.SALE_MTH);
      const day = int(r.SALE_DAY);
      const century = int(r.SALE_CENTU) ?? 20;
      let saleDate: string | null = null;
      if (year && month && day) {
        const y = century * 100 + year;
        saleDate = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      return {
        parid: normalizeParid(r.CONTROL_NO),
        address: str(r.SITUS_DESC),
        city: str(r.municipali),
        zip: null,
        muniCode: null,
        muniDesc: str(r.municipali),
        schoolCode: str(r.SCHOOL_DIS),
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.LAND_USE_C),
        lotArea: null,
        countyLand: num(r.LAND_VAL),
        countyBuilding: num(r.IMPROV_VAL),
        countyTotal: num(r.TOT_VAL),
        yearBuilt: int(r.YEAR_BUILT),
        stories: null,
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: null,
        conditionDesc: null,
        grade: null,
        styleDesc: null,
        livingArea: num(r.GROSS_LIVI),
        salePrice: num(r.SALE_AMT),
        saleDate,
      };
    },
  },

  Forest: {
    county: "Forest",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/ForestCounty/MapServer/3",
    snapshotDate: "2026-02-01",
    fields: [
      "PARCEL", "CONTROL_NO", "DIST_NAME", "SITUS", "PROP_USE", "LAND_VALUE",
      "BLDG_VALUE", "TOTAL_VALU", "CONSIDERAT", "DATE_OF_SA", "ACRES",
    ],
    map: (r) => {
      const cls = camaClass(r.PROP_USE);
      const acres = num(r.ACRES);
      return {
        parid: normalizeParid(r.PARCEL ?? r.CONTROL_NO),
        address: str(r.SITUS),
        city: str(r.DIST_NAME),
        zip: null,
        muniCode: null,
        muniDesc: str(r.DIST_NAME),
        schoolCode: null,
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.PROP_USE),
        lotArea: acres != null && acres > 0 ? Math.round(acres * 43560) : null,
        countyLand: num(r.LAND_VALUE),
        countyBuilding: num(r.BLDG_VALUE),
        countyTotal: num(r.TOTAL_VALU),
        yearBuilt: null,
        stories: null,
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: null,
        conditionDesc: null,
        grade: null,
        styleDesc: null,
        livingArea: null,
        salePrice: num(r.CONSIDERAT),
        saleDate: parseDate(r.DATE_OF_SA),
      };
    },
  },

  Franklin: {
    county: "Franklin",
    layerUrl:
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/FranklinCounty/MapServer/0",
    snapshotDate: "2026-06-01",
    fields: [
      "CONTROL_NU", "TAX_DIST", "SCHOOL_DIS", "LAND_USE_C", "FULL_SITUS",
      "PRC_TTL_AS", "SLH_PRICE", "SALE_DATE", "CNS_AREA_L", "YEAR_BUILT",
      "OWNER_FNAM", "OWNER_LNAM",
    ],
    map: (r) => {
      const cls = camaClass(r.LAND_USE_C);
      return {
        parid: normalizeParid(r.CONTROL_NU),
        address: str(r.FULL_SITUS),
        city: str(r.TAX_DIST),
        zip: null,
        muniCode: null,
        muniDesc: str(r.TAX_DIST),
        schoolCode: str(r.SCHOOL_DIS),
        schoolDesc: null,
        cls,
        clsDesc: cls ? (CLASS_DESC[cls] ?? null) : null,
        useCode: str(r.LAND_USE_C),
        lotArea: null,
        countyLand: null,
        countyBuilding: null,
        countyTotal: num(r.PRC_TTL_AS),
        yearBuilt: int(r.YEAR_BUILT),
        stories: null,
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: null,
        conditionDesc: null,
        grade: null,
        styleDesc: null,
        livingArea: num(r.CNS_AREA_L),
        salePrice: num(r.SLH_PRICE),
        saleDate: parseDate(r.SALE_DATE),
      };
    },
  },
};

const PARCEL_COLUMNS = [
  "parid", "county", "address", "city", "zip", "muni_code", "muni_desc",
  "school_code", "school_desc", "class", "class_desc", "use_code", "lot_area",
  "county_building", "county_land", "county_total", "style_desc", "stories",
  "year_built", "grade", "condition", "condition_desc", "bedrooms",
  "full_baths", "half_baths", "total_rooms", "finished_living_area",
  "tax_year", "as_of_date", "embedding",
];

const PARCEL_CONFLICT = `on conflict (parid) do update set ${PARCEL_COLUMNS.filter(
  (c) => c !== "parid"
)
  .map((c) => `${c} = excluded.${c}`)
  .join(", ")}, updated_at = now()`;

async function fetchJson(url: string): Promise<Attrs> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  const json = (await res.json()) as Attrs & { error?: { message?: string } };
  if (json.error) throw new Error(`ArcGIS error: ${json.error.message}`);
  return json;
}

async function* pages(config: CountyConfig, limit: number): AsyncGenerator<Attrs[]> {
  let offset = 0;
  const where = encodeURIComponent(config.where ?? "1=1");
  while (offset < limit) {
    const count = Math.min(PAGE_SIZE, limit - offset);
    const url =
      `${config.layerUrl}/query?where=${where}` +
      `&outFields=${config.fields.join(",")}` +
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

async function main() {
  const countyArg = process.argv.indexOf("--county");
  const county = countyArg > -1 ? process.argv[countyArg + 1] : null;
  const config = county ? CONFIGS[county] : null;
  if (!config) {
    console.error(
      `usage: ingest:pasda -- --county <${Object.keys(CONFIGS).join("|")}> [--limit N]`
    );
    process.exit(1);
  }
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const pool = getPool();
  const snapshotYear = Number(config.snapshotDate.slice(0, 4));
  let parcelCount = 0;
  let saleCount = 0;

  for await (const page of pages(config, limit)) {
    const parcelBatch = new Map<string, unknown[]>();
    const saleBatch = new Map<string, unknown[]>();
    for (const attrs of page) {
      const m = config.map(attrs);
      if (!m.parid) continue;

      const embedding = parcelVector({
        finished_living_area: m.livingArea,
        lot_area: m.lotArea,
        bedrooms: m.bedrooms,
        full_baths: m.fullBaths,
        half_baths: m.halfBaths,
        total_rooms: m.totalRooms,
        year_built: m.yearBuilt,
        stories: m.stories,
        fireplaces: null,
        basement_garage: null,
        condition: m.condition,
        grade: m.grade,
        county_total: m.countyTotal,
      });

      parcelBatch.set(m.parid, [
        m.parid, config.county, m.address, m.city, m.zip, m.muniCode,
        m.muniDesc, m.schoolCode, m.schoolDesc, m.cls, m.clsDesc, m.useCode,
        m.lotArea, m.countyBuilding, m.countyLand, m.countyTotal, m.styleDesc,
        m.stories, m.yearBuilt, m.grade, m.condition, m.conditionDesc,
        m.bedrooms, m.fullBaths, m.halfBaths, m.totalRooms, m.livingArea,
        snapshotYear, config.snapshotDate, toVectorLiteral(embedding),
      ]);

      if (m.saleDate && m.salePrice != null && m.salePrice > 0) {
        // No validity codes in these layers; price floor skips $1 transfers.
        saleBatch.set(`${m.parid}|${m.saleDate}|${m.salePrice}`, [
          m.parid, m.saleDate, m.salePrice, null, "DEED SALE",
          m.salePrice >= 10000,
        ]);
      }
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
    if (parcelCount % 20000 < PAGE_SIZE) {
      console.log(`${config.county}: parcels ${parcelCount}, sales ${saleCount}`);
    }
  }

  console.log(`done. ${config.county}: parcels ${parcelCount}, sales ${saleCount}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
