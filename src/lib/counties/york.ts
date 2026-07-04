import { getLatestClr } from "../clr";
import { getAppealWindowFromDb, makeMillageLookup } from "./data";
import type { AppealWindow, CountyAdapter } from "./types";

const COUNTY = "York";
const BOARD_NAME = "York County Board of Assessment Appeals";
const PORTAL_URL = "https://yorkcountypa.gov/707/Assessment-Appeals";

/**
 * Rule-based fallback when appeal_windows has no upcoming row. York accepts
 * annual appeals year-round, but a filing must be postmarked by close of
 * business August 1 to take effect for the following tax year (York County
 * Code ch. 145).
 */
function ruleBasedWindow(today = new Date()): AppealWindow {
  const year = today.getFullYear();
  const deadline = new Date(Date.UTC(year, 7, 1)); // Aug 1
  const effectiveDeadline =
    today <= deadline ? deadline : new Date(Date.UTC(year + 1, 7, 1));
  return {
    county: COUNTY,
    taxYear: effectiveDeadline.getUTCFullYear() + 1,
    boardName: BOARD_NAME,
    openDate: null, // filings accepted year-round
    filingDeadline: effectiveDeadline.toISOString().slice(0, 10),
    portalUrl: PORTAL_URL,
    windowOpen: true,
  };
}

export const yorkAdapter: CountyAdapter = {
  county: COUNTY,
  dataTier: "A",
  wedgeStrength: "strong",
  parcelSource: {
    kind: "pasda",
    source:
      "PASDA YorkCounty MapServer layer 31 (parcels with assessed values + last sale, Sept 2022 snapshot)",
    ingestScript: "ingest:york",
  },
  clr: () => getLatestClr(COUNTY),
  appealWindow: async (today = new Date()) =>
    (await getAppealWindowFromDb(COUNTY, today)) ?? ruleBasedWindow(today),
  millageTable: makeMillageLookup(COUNTY),
  hasHistoricalOutcomes: false,
  // The free PASDA snapshot is dated Sept 2022, so the standard 3-year sale
  // window would exclude every sale; widen it and lean on market-time
  // adjustments in the comp engine.
  compSaleYears: 6,
};
