import { getPool } from "./db";

export type ClrRow = { tax_year: number; ratio: number };

export async function getClr(taxYear: number): Promise<ClrRow | null> {
  const { rows } = await getPool().query<{ tax_year: number; ratio: string }>(
    `select tax_year, ratio from common_level_ratio where tax_year = $1`,
    [taxYear]
  );
  if (!rows[0]) return null;
  return { tax_year: rows[0].tax_year, ratio: Number(rows[0].ratio) };
}

export async function getLatestClr(): Promise<ClrRow> {
  const { rows } = await getPool().query<{ tax_year: number; ratio: string }>(
    `select tax_year, ratio from common_level_ratio order by tax_year desc limit 1`
  );
  if (!rows[0]) throw new Error("common_level_ratio table is empty");
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
  // Blended county + municipal + school district millage for Allegheny County
  // is roughly 22-30 mills; 25 is a conservative default when the caller does
  // not supply parcel-specific millage.
  const millage = params.millage ?? 25;
  const impliedAssessed = Math.round(estimatedFmv * ratio);
  const assessmentReduction = Math.max(0, currentAssessed - impliedAssessed);
  const estimatedAnnualSavings = Math.round(
    (assessmentReduction * millage) / 1000
  );
  return { impliedAssessed, assessmentReduction, estimatedAnnualSavings };
}
