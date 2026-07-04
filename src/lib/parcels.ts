import { getPool } from "./db";

export type ParcelSummary = {
  parid: string;
  county: string;
  full_address: string | null;
  muni_desc: string | null;
  school_desc: string | null;
  class: string | null;
  class_desc: string | null;
  use_desc: string | null;
  county_total: number | null;
  fair_market_total: number | null;
  finished_living_area: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  year_built: number | null;
  condition_desc: string | null;
  grade_desc: string | null;
  lot_area: number | null;
  style_desc: string | null;
};

const SUMMARY_COLUMNS = `
  parid, county, full_address, muni_desc, school_desc, class, class_desc, use_desc,
  county_total::float8 as county_total,
  fair_market_total::float8 as fair_market_total,
  finished_living_area::float8 as finished_living_area,
  bedrooms, full_baths, half_baths, year_built,
  condition_desc, grade_desc, lot_area::float8 as lot_area, style_desc
`;

/** Address (trigram) or parcel-ID search over the county parcel table. */
export async function searchParcels(
  query: string,
  limit = 10
): Promise<ParcelSummary[]> {
  const q = query.trim();
  if (!q) return [];

  // Parcel-ID shapes vary by county (Allegheny: 16 alnum; York: 13 digits).
  // Try an exact-ID match first and fall through to address search on a miss.
  const asParid = q.replace(/[^0-9A-Za-z]/g, "");
  if (/^\d/.test(asParid) && /^[0-9A-Za-z]{13,16}$/.test(asParid)) {
    const { rows } = await getPool().query<ParcelSummary>(
      `select ${SUMMARY_COLUMNS} from parcels where parid = $1`,
      [asParid]
    );
    if (rows.length) return rows;
  }

  const { rows } = await getPool().query<ParcelSummary>(
    `select ${SUMMARY_COLUMNS}
     from parcels
     where full_address ilike '%' || $1 || '%'
     order by extensions.similarity(full_address, $1) desc
     limit $2`,
    [q, limit]
  );
  return rows;
}

export async function getParcel(parid: string): Promise<ParcelSummary | null> {
  const { rows } = await getPool().query<ParcelSummary>(
    `select ${SUMMARY_COLUMNS} from parcels where parid = $1`,
    [parid]
  );
  return rows[0] ?? null;
}
