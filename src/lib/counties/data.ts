import { getPool } from "../db";
import type { AppealWindow, MillageLookup } from "./types";

/** Counties with onboarded parcel data in county_data_status. */
export async function getLiveCounties(): Promise<Set<string>> {
  try {
    const { rows } = await getPool().query<{
      county: string;
      onboarded: boolean;
    }>(
      `select county, onboarded_at is not null as onboarded from county_data_status`
    );
    return new Set(rows.filter((r) => r.onboarded).map((r) => r.county));
  } catch {
    // DB may be unreachable during static generation or local setup.
    return new Set();
  }
}

/**
 * Next appeal window for a county from the appeal_windows table: the row
 * whose close date is soonest but not yet past. Returns null when the table
 * has no upcoming row for the county (adapter falls back to its rule).
 */
export async function getAppealWindowFromDb(
  county: string,
  today = new Date()
): Promise<AppealWindow | null> {
  const { rows } = await getPool().query<{
    tax_year: number;
    board_name: string | null;
    open_date: string | null;
    close_date: string;
    portal_url: string | null;
    mailing_address: string | null;
  }>(
    `select tax_year, board_name,
            open_date::text as open_date,
            close_date::text as close_date,
            portal_url,
            mailing_address
     from appeal_windows
     where county = $1 and close_date >= $2
     order by close_date asc
     limit 1`,
    [county, today.toISOString().slice(0, 10)]
  );
  const row = rows[0];
  if (!row) return null;

  const todayIso = today.toISOString().slice(0, 10);
  return {
    county,
    taxYear: row.tax_year,
    boardName: row.board_name ?? "county board of assessment appeals",
    openDate: row.open_date,
    filingDeadline: row.close_date,
    portalUrl: row.portal_url,
    mailingAddress: row.mailing_address,
    windowOpen:
      (row.open_date == null || row.open_date <= todayIso) &&
      todayIso <= row.close_date,
  };
}

/**
 * Combined millage (county + municipal + school mills) from millage_rates,
 * matching the parcel's municipality/school district by name for the latest
 * tax year at or before the requested one. Null when no data is entered.
 */
export function makeMillageLookup(county: string): MillageLookup {
  return async ({ municipality, schoolDistrict, taxYear }) => {
    if (!municipality && !schoolDistrict) return null;
    const { rows } = await getPool().query<{ total_mills: number | null }>(
      `select (coalesce(county_mills, 0) + coalesce(municipal_mills, 0)
               + coalesce(school_mills, 0))::float8 as total_mills
       from millage_rates
       where county = $1
         and tax_year <= $2
         and ($3::text is null or municipality ilike $3)
         and ($4::text is null or school_district ilike $4)
       order by tax_year desc
       limit 1`,
      [county, taxYear, municipality, schoolDistrict]
    );
    const mills = rows[0]?.total_mills;
    return mills != null && mills > 0 ? mills : null;
  };
}
