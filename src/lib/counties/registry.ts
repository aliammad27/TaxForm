import { alleghenyAdapter } from "./allegheny";
import { yorkAdapter } from "./york";
import {
  bedfordAdapter,
  butlerAdapter,
  chesterAdapter,
  cumberlandAdapter,
  forestAdapter,
  franklinAdapter,
  indianaAdapter,
  juniataAdapter,
  montgomeryAdapter,
} from "./batch";
import type { CountyAdapter } from "./types";

export const DEFAULT_COUNTY = "Allegheny";

const registry = new Map<string, CountyAdapter>([
  [alleghenyAdapter.county, alleghenyAdapter],
  [yorkAdapter.county, yorkAdapter],
  [cumberlandAdapter.county, cumberlandAdapter],
  [montgomeryAdapter.county, montgomeryAdapter],
  [butlerAdapter.county, butlerAdapter],
  [indianaAdapter.county, indianaAdapter],
  [juniataAdapter.county, juniataAdapter],
  [chesterAdapter.county, chesterAdapter],
  [bedfordAdapter.county, bedfordAdapter],
  [forestAdapter.county, forestAdapter],
  [franklinAdapter.county, franklinAdapter],
]);

/**
 * Adapter for a county. Unknown/unonboarded counties throw — callers should
 * only reach this with a county that exists in the parcels table, which by
 * construction is one we've onboarded.
 */
export function getCountyAdapter(county: string): CountyAdapter {
  const adapter = registry.get(county);
  if (!adapter) {
    throw new Error(`county ${county} is not onboarded (no adapter registered)`);
  }
  return adapter;
}

export function listCountyAdapters(): CountyAdapter[] {
  return [...registry.values()];
}
