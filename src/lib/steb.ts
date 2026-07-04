/**
 * STEB 2026 Common Level Ratios for all 67 PA counties (published July 2025,
 * applied to appeals for tax year 2026). Reference data for the statewide
 * overassessment map and county landing pages; operational CLR lookups for
 * onboarded counties use the common_level_ratio table instead.
 *
 * pdrBelow100: STEB marks the county's predetermined ratio below 100%, so the
 * raw CLR overstates the appeal wedge. reassessTo100: county recently
 * reassessed to (or near) 100% market value.
 */
export type StebRow = {
  clr: number; // percent, e.g. 50.14
  pdrBelow100?: boolean;
  reassessTo100?: boolean;
};

export const STEB_2026: Record<string, StebRow> = {
  Adams: { clr: 72.44 },
  Allegheny: { clr: 50.14 },
  Armstrong: { clr: 30.56, pdrBelow100: true },
  Beaver: { clr: 77.13 },
  Bedford: { clr: 54.52 },
  Berks: { clr: 34.37 },
  Blair: { clr: 85.8 },
  Bradford: { clr: 17.32, pdrBelow100: true },
  Bucks: { clr: 5.86 },
  Butler: { clr: 6.0 },
  Cambria: { clr: 12.18 },
  Cameron: { clr: 21.44, pdrBelow100: true },
  Carbon: { clr: 17.91, pdrBelow100: true },
  Centre: { clr: 17.1, pdrBelow100: true },
  Chester: { clr: 31.84 },
  Clarion: { clr: 11.23, reassessTo100: true },
  Clearfield: { clr: 17.94, pdrBelow100: true },
  Clinton: { clr: 50.47 },
  Columbia: { clr: 14.27, pdrBelow100: true },
  Crawford: { clr: 16.26, pdrBelow100: true },
  Cumberland: { clr: 67.8 },
  Dauphin: { clr: 40.42 },
  Delaware: { clr: 57.33 },
  Elk: { clr: 18.58, pdrBelow100: true },
  Erie: { clr: 53.21 },
  Fayette: { clr: 43.03 },
  Forest: { clr: 13.05 },
  Franklin: { clr: 7.68 },
  Fulton: { clr: 22.89 },
  Greene: { clr: 38.23 },
  Huntingdon: { clr: 12.58, pdrBelow100: true },
  Indiana: { clr: 75.32 },
  Jefferson: { clr: 20.02 },
  Juniata: { clr: 8.11 },
  Lackawanna: { clr: 5.68, reassessTo100: true },
  Lancaster: { clr: 53.43 },
  Lawrence: { clr: 46.96 },
  Lebanon: { clr: 54.15 },
  Lehigh: { clr: 49.4 },
  Luzerne: { clr: 86.2 },
  Lycoming: { clr: 46.94 },
  McKean: { clr: 59.43 },
  Mercer: { clr: 11.11, pdrBelow100: true },
  Mifflin: { clr: 20.91, pdrBelow100: true },
  Monroe: { clr: 45.47 },
  Montgomery: { clr: 30.76 },
  Montour: { clr: 46.23 },
  Northampton: { clr: 17.01, pdrBelow100: true },
  Northumberland: { clr: 9.63 },
  Perry: { clr: 57.7, reassessTo100: true },
  Philadelphia: { clr: 90.7, reassessTo100: true },
  Pike: { clr: 9.18, pdrBelow100: true },
  Potter: { clr: 16.54 },
  Schuylkill: { clr: 18.86, pdrBelow100: true, reassessTo100: true },
  Snyder: { clr: 9.85 },
  Somerset: { clr: 18.38, pdrBelow100: true },
  Sullivan: { clr: 43.64 },
  Susquehanna: { clr: 17.74, pdrBelow100: true },
  Tioga: { clr: 83.79 },
  Union: { clr: 46.84 },
  Venango: { clr: 51.02 },
  Warren: { clr: 13.89, pdrBelow100: true, reassessTo100: true },
  Washington: { clr: 67.41 },
  Wayne: { clr: 72.34 },
  Westmoreland: { clr: 8.88 },
  Wyoming: { clr: 11.46, pdrBelow100: true },
  York: { clr: 50.46 },
};

export const PA_COUNTIES = Object.keys(STEB_2026);

export function countySlug(county: string): string {
  return county.toLowerCase().replace(/\s+/g, "-");
}

export function countyFromSlug(slug: string): string | null {
  const match = PA_COUNTIES.find((c) => countySlug(c) === slug.toLowerCase());
  return match ?? null;
}

/**
 * The appeal wedge for a county: how far below market its assessments sit
 * *for CLR-appeal purposes*. Null when the raw CLR is not a reliable wedge
 * (PDR below 100 or recent reassessment).
 */
export function appealWedgePct(row: StebRow): number | null {
  if (row.pdrBelow100 || row.reassessTo100) return null;
  return Math.max(0, 100 - row.clr);
}
