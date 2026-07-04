import type { ClrRow } from "../clr";

export type DataTier = "A" | "B" | "C";
export type WedgeStrength = "strong" | "moderate" | "weak";

export type AppealWindow = {
  county: string;
  taxYear: number;
  boardName: string;
  /** ISO date the filing window opens. */
  openDate: string | null;
  /** ISO date appeals are due (window close). */
  filingDeadline: string;
  portalUrl: string | null;
  /** Where paper filings are mailed (from appeal_windows.mailing_address). */
  mailingAddress?: string | null;
  windowOpen: boolean;
};

/**
 * Where a county's parcel/sales data comes from and how it's loaded.
 * Tier A counties share the PASDA-backed ingest; Tier B counties get a
 * custom importer against their own open-data portal.
 */
export type ParcelIngestAdapter = {
  kind: "pasda" | "county-portal" | "manual";
  /** Human-readable description of the source (portal name/URL). */
  source: string;
  /** npm script that runs the ingest, e.g. "ingest:parcels". */
  ingestScript?: string;
};

/**
 * Returns the combined (county + municipal + school) mills for a parcel's
 * taxing bodies, or null when no millage data has been entered yet — callers
 * fall back to a labeled-estimate default.
 */
export type MillageLookup = (params: {
  municipality: string | null;
  schoolDistrict: string | null;
  taxYear: number;
}) => Promise<number | null>;

export interface CountyAdapter {
  county: string;
  dataTier: DataTier;
  wedgeStrength: WedgeStrength;
  parcelSource: ParcelIngestAdapter;
  /** Latest Common Level Ratio for this county from the shared STEB table. */
  clr: () => Promise<ClrRow>;
  /**
   * The next appeal window for this county: appeal_windows table first,
   * falling back to the county's rule-based schedule if no row exists.
   */
  appealWindow: (today?: Date) => Promise<AppealWindow>;
  millageTable: MillageLookup;
  /** Drives the adjudication model choice: trained model vs pooled heuristic. */
  hasHistoricalOutcomes: boolean;
  /**
   * Max age (years) of comparable sales for this county. Defaults to 3;
   * counties whose free data snapshot is older widen the window and rely on
   * market-time adjustments instead.
   */
  compSaleYears?: number;
}
