import { getLatestClr } from "../clr";
import { nextAppealWindow } from "../appeal-window";
import { getAppealWindowFromDb, makeMillageLookup } from "./data";
import type { AppealWindow, CountyAdapter } from "./types";

const COUNTY = "Allegheny";
const BOARD_NAME = "Board of Property Assessment Appeals and Review (BPAAR)";
const PORTAL_URL =
  "https://www.alleghenycounty.us/Services/Property-Assessments-and-Real-Estate/Appeals/Annual-Appeals";

/** Rule-based fallback when appeal_windows has no upcoming row. */
function ruleBasedWindow(today = new Date()): AppealWindow {
  const window = nextAppealWindow(today);
  return {
    county: COUNTY,
    taxYear: window.taxYear,
    boardName: BOARD_NAME,
    openDate: `${window.taxYear - 1}-07-01`,
    filingDeadline: window.filingDeadline,
    portalUrl: PORTAL_URL,
    windowOpen: window.windowOpen,
  };
}

export const alleghenyAdapter: CountyAdapter = {
  county: COUNTY,
  dataTier: "B",
  wedgeStrength: "strong",
  parcelSource: {
    kind: "county-portal",
    source: "WPRDC (Western PA Regional Data Center) open data portal",
    ingestScript: "ingest:parcels",
  },
  clr: () => getLatestClr(COUNTY),
  appealWindow: async (today = new Date()) =>
    (await getAppealWindowFromDb(COUNTY, today)) ?? ruleBasedWindow(today),
  millageTable: makeMillageLookup(COUNTY),
  hasHistoricalOutcomes: true,
};
