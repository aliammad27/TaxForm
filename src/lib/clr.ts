import { getPool } from "./db";

export type ClrRow = { tax_year: number; ratio: number };

/**
 * The Common Level Ratio is published annually by STEB for every PA county;
 * the shared common_level_ratio table is keyed by (county, tax_year).
 */
export async function getClr(
  taxYear: number,
  county = "Allegheny"
): Promise<ClrRow | null> {
  const { rows } = await getPool().query<{ tax_year: number; ratio: string }>(
    `select tax_year, ratio from common_level_ratio
     where county = $1 and tax_year = $2`,
    [county, taxYear]
  );
  if (!rows[0]) return null;
  return { tax_year: rows[0].tax_year, ratio: Number(rows[0].ratio) };
}

export async function getLatestClr(county = "Allegheny"): Promise<ClrRow> {
  const { rows } = await getPool().query<{ tax_year: number; ratio: string }>(
    `select tax_year, ratio from common_level_ratio
     where county = $1
     order by tax_year desc limit 1`,
    [county]
  );
  if (!rows[0]) {
    throw new Error(`common_level_ratio has no rows for county ${county}`);
  }
  return { tax_year: rows[0].tax_year, ratio: Number(rows[0].ratio) };
}

/**
 * The core CLR wedge: a proven fair market value implies an assessed value of
 * FMV x CLR. If that is below the current assessment, the difference is the
 * assessment reduction an appeal can win.
 */
export function clrMath(params: {
  estimatedFmv: number;
  currentAssessed: number;
  ratio: number;
  /** Combined county+muni+school millage, mills per dollar of assessed value. */
  millage?: number;
}) {
  const { estimatedFmv, currentAssessed, ratio } = params;
  // A blended county + municipal + school district millage of 25 mills is a
  // conservative statewide default when the caller does not supply
  // parcel-specific millage; every displayed number derived from it must be
  // labeled as an estimate.
  const millage = params.millage ?? 25;
  const impliedAssessed = Math.round(estimatedFmv * ratio);
  const assessmentReduction = Math.max(0, currentAssessed - impliedAssessed);
  const estimatedAnnualSavings = Math.round(
    (assessmentReduction * millage) / 1000
  );
  return { impliedAssessed, assessmentReduction, estimatedAnnualSavings };
}
