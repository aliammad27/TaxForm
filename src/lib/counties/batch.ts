import { getLatestClr } from "../clr";
import { getAppealWindowFromDb, makeMillageLookup } from "./data";
import type { AppealWindow, CountyAdapter, DataTier, WedgeStrength } from "./types";

/**
 * Adapter factory for Phase 4 batch-onboarded counties: PASDA-backed parcel
 * data, a fixed annual filing deadline (Aug 1 or Sept 1 per county board),
 * millage from the millage_rates table when entered (falls back to the
 * labeled 25-mill estimate), and no historical outcomes yet.
 */
export function makePasdaAdapter(config: {
  county: string;
  dataTier: DataTier;
  wedgeStrength: WedgeStrength;
  source: string;
  ingestScript: string;
  boardName: string;
  portalUrl: string;
  /** Annual filing deadline: 1-based month + day (e.g. {8, 1} = Aug 1). */
  deadlineMonth: number;
  deadlineDay: number;
  compSaleYears?: number;
}): CountyAdapter {
  function ruleBasedWindow(today = new Date()): AppealWindow {
    const year = today.getFullYear();
    const deadline = new Date(
      Date.UTC(year, config.deadlineMonth - 1, config.deadlineDay)
    );
    const effective =
      today <= deadline
        ? deadline
        : new Date(Date.UTC(year + 1, config.deadlineMonth - 1, config.deadlineDay));
    return {
      county: config.county,
      taxYear: effective.getUTCFullYear() + 1,
      boardName: config.boardName,
      openDate: null, // filings accepted year-round
      filingDeadline: effective.toISOString().slice(0, 10),
      portalUrl: config.portalUrl,
      windowOpen: true,
    };
  }

  return {
    county: config.county,
    dataTier: config.dataTier,
    wedgeStrength: config.wedgeStrength,
    parcelSource: {
      kind: "pasda",
      source: config.source,
      ingestScript: config.ingestScript,
    },
    clr: () => getLatestClr(config.county),
    appealWindow: async (today = new Date()) =>
      (await getAppealWindowFromDb(config.county, today)) ??
      ruleBasedWindow(today),
    millageTable: makeMillageLookup(config.county),
    hasHistoricalOutcomes: false,
    compSaleYears: config.compSaleYears,
  };
}

export const cumberlandAdapter = makePasdaAdapter({
  county: "Cumberland",
  dataTier: "A",
  wedgeStrength: "strong",
  source: "PASDA PA_Parcels_2022 CumberlandCounty_TaxParcels202109 (Sept 2021 snapshot)",
  ingestScript: "ingest:pasda -- --county Cumberland",
  boardName: "Cumberland County Board of Assessment Appeals",
  portalUrl: "https://www.cumberlandcountypa.gov/3713/Property-Appeal-Information",
  deadlineMonth: 9,
  deadlineDay: 1,
  compSaleYears: 8, // Sept 2021 snapshot
});

export const montgomeryAdapter = makePasdaAdapter({
  county: "Montgomery",
  dataTier: "A",
  wedgeStrength: "moderate",
  source: "PASDA MontgomeryCounty MapServer layer 14 (Dec 2025 snapshot)",
  ingestScript: "ingest:pasda -- --county Montgomery",
  boardName: "Montgomery County Board of Assessment Appeals",
  portalUrl: "https://www.montgomerycountypa.gov/173/Board-of-Assessment-Appeals",
  deadlineMonth: 8,
  deadlineDay: 1,
});

export const butlerAdapter = makePasdaAdapter({
  county: "Butler",
  dataTier: "A",
  wedgeStrength: "moderate",
  source: "PASDA ButlerCounty MapServer layer 0 (Apr 2023 snapshot)",
  ingestScript: "ingest:pasda -- --county Butler",
  boardName: "Butler County Board of Assessment Appeals",
  portalUrl: "https://www.butlercountypa.gov/328/Assessment",
  deadlineMonth: 8,
  deadlineDay: 1,
  compSaleYears: 6, // Apr 2023 snapshot
});

export const juniataAdapter = makePasdaAdapter({
  county: "Juniata",
  dataTier: "A",
  wedgeStrength: "moderate",
  source: "PASDA JuniataCounty MapServer layer 0 (Aug 2024 snapshot)",
  ingestScript: "ingest:pasda -- --county Juniata",
  boardName: "Juniata County Board of Assessment Appeals",
  portalUrl: "https://www.juniataco.org/departments/assessment/",
  deadlineMonth: 9,
  deadlineDay: 1,
  compSaleYears: 5, // Aug 2024 snapshot
});

export const indianaAdapter = makePasdaAdapter({
  county: "Indiana",
  dataTier: "A",
  wedgeStrength: "moderate",
  source: "PASDA IndianaCounty MapServer layer 5 (Nov 2023 snapshot)",
  ingestScript: "ingest:pasda -- --county Indiana",
  boardName: "Indiana County Board of Assessment Appeals",
  portalUrl:
    "https://www.indianacountypa.gov/departments/tax-assessment/assessment-and-appeal-process/",
  deadlineMonth: 8,
  deadlineDay: 1,
  compSaleYears: 8, // sales in the snapshot end around 2021
});

export const chesterAdapter = makePasdaAdapter({
  county: "Chester",
  dataTier: "A",
  wedgeStrength: "moderate",
  source: "PASDA ChesterCounty MapServer layer 11 (Dec 2023 snapshot)",
  ingestScript: "ingest:pasda -- --county Chester",
  boardName: "Chester County Board of Assessment Appeals",
  portalUrl: "https://www.chesco.org/3584/Assessment-Appeals",
  deadlineMonth: 8,
  deadlineDay: 1,
  compSaleYears: 6,
});

export const bedfordAdapter = makePasdaAdapter({
  county: "Bedford",
  dataTier: "B",
  wedgeStrength: "moderate",
  source: "PASDA BedfordCounty MapServer layer 0 (Jul 2023 snapshot)",
  ingestScript: "ingest:pasda -- --county Bedford",
  boardName: "Bedford County Board of Assessment Appeals",
  portalUrl: "https://www.bedfordcountypa.org/departments/assessment",
  deadlineMonth: 8,
  deadlineDay: 1,
  compSaleYears: 6,
});

export const forestAdapter = makePasdaAdapter({
  county: "Forest",
  dataTier: "B",
  wedgeStrength: "moderate",
  source: "PASDA ForestCounty MapServer layer 3 (Feb 2026 snapshot)",
  ingestScript: "ingest:pasda -- --county Forest",
  boardName: "Forest County Board of Assessment Appeals",
  portalUrl: "https://www.forestcountypa.gov/",
  deadlineMonth: 8,
  deadlineDay: 1,
  compSaleYears: 3,
});

export const franklinAdapter = makePasdaAdapter({
  county: "Franklin",
  dataTier: "B",
  wedgeStrength: "moderate",
  source: "PASDA FranklinCounty MapServer layer 0 (Jun 2026 snapshot)",
  ingestScript: "ingest:pasda -- --county Franklin",
  boardName: "Franklin County Board of Assessment Appeals",
  portalUrl: "https://www.franklincountypa.gov/",
  deadlineMonth: 8,
  deadlineDay: 1,
  compSaleYears: 3,
});
