/**
 * Known-good Allegheny parcels baked into supabase/fixtures/parcel-fixture.sql.
 * Smoke tests and docs reference these so dev/CI validates the full funnel
 * without running full ingestion.
 */
export const GOLDEN_SEARCH_QUERIES = [
  "3409 DENNY ST",
  "719 mulkerrin",
  "429 Forbes",
] as const;

/** Residential parcel with valid comps in the seed fixture (Mt Washington area). */
export const GOLDEN_RESIDENTIAL_PARID = "0026E00017000000";

/** Commercial parcel with valid sale in the seed fixture (429 Forbes Ave). */
export const GOLDEN_COMMERCIAL_PARID = "0002E00155000000";
