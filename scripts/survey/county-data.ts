/**
 * Statewide data survey (Phase 2 of the PA rollout plan).
 *
 * For each of PA's 67 counties, probes the free/open sources we can build on:
 *   1. PASDA per-county map services
 *      (https://mapservices.pasda.psu.edu/server/rest/services/pasda/<X>County)
 *   2. PASDA county parcel snapshots (apps.pasda.psu.edu PA_Parcels_2022)
 * and checks whether the parcel layers carry assessed-value and sale fields —
 * not just boundary geometry.
 *
 * Combines that with the current STEB CLR table (certified 2024 ratios, used
 * July 2025 - June 2026) to assign a data tier and wedge strength, then:
 *   - upserts county_data_status for all 67 counties
 *   - writes data/county-survey.json (raw probe results)
 *   - writes docs/county-rollout.md (the ranked rollout list, checked in)
 *
 *   npx tsx scripts/survey/county-data.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getPool } from "../ingest/lib";
// STEB 2024-certified CLRs (effective Jul 1 2025 - Jun 30 2026) live in
// src/lib/steb.ts, shared with the public map and county landing pages.
// Source: Pennsylvania Bulletin vol. 55 no. 27 / STEB June 18, 2025 release.
import { STEB_2026, type StebRow } from "../../src/lib/steb";


const COUNTIES = Object.keys(STEB_2026);

// Prior research: counties with a confirmed live CLR wedge (PDR 100, CLR well
// below it), re-checked against the STEB table above at survey time.
const STRONG_WEDGE_SHORTLIST = new Set([
  "Allegheny", "Berks", "Cumberland", "Dauphin", "Delaware",
  "Erie", "Lancaster", "Lebanon", "McKean", "York",
]);

// Counties known to run their own open-data/GIS portals with parcel data
// (candidate Tier B when PASDA's copy lacks assessment fields).
const KNOWN_COUNTY_PORTALS: Record<string, string> = {
  Allegheny: "WPRDC (data.wprdc.org) — parcels, sales, BPAAR outcomes",
  Chester: "Chester County GIS hub (chester-county-s-gis-hub-chesco.hub.arcgis.com)",
  Montgomery: "Montgomery County Open Data Portal (montcopa open data / data-montcopa.opendata.arcgis.com)",
  Dauphin: "Dauphin County open data / GIS portal",
  Carbon: "Carbon County GIS / open data portal",
  Centre: "Centre County open data portal (centrecountygov hub)",
  Bucks: "Bucks County GIS / board of assessment data",
  Delaware: "Delaware County open data portal (delcopa.gov/odmi)",
  Philadelphia: "OpenDataPhilly (OPA property assessments)",
};

// Field-name heuristics for "is this more than boundary geometry?"
const ASSESSED_PATTERNS = [
  /TOTAL_?VAL/i, /APRTOTAL/i, /ASSESS/i, /ASMT/i, /AV_?TOTAL/i,
  /TOT_?ASSD/i, /^land$/i, /^building$/i, /LAND_?VAL/i, /BLDG_?VAL/i,
  /MKTVAL/i, /MARKET_?VAL/i,
];
const SALE_PATTERNS = [
  /SALE_?PRICE/i, /^PRICE$/i, /SALEDT/i, /SALE_?DATE/i, /SALEDATE/i,
  /LAST_?SALE/i, /PREV_?PRICE/i,
];

type LayerProbe = {
  service: string;
  layer: string;
  assessedFields: string[];
  saleFields: string[];
  fieldCount: number;
};

type CountySurvey = {
  county: string;
  clr: number;
  pdrBelow100: boolean;
  reassessTo100: boolean;
  pasdaLayers: LayerProbe[];
  hasAssessed: boolean;
  hasSales: boolean;
  knownPortal: string | null;
  dataTier: "A" | "B" | "C";
  wedgeStrength: "strong" | "moderate" | "weak";
  notes: string;
};

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    if ("error" in json) return null;
    return json;
  } catch {
    return null;
  }
}

function probeFields(
  service: string,
  layerName: string,
  fields: { name: string }[]
): LayerProbe {
  const names = fields.map((f) => f.name);
  return {
    service,
    layer: layerName,
    assessedFields: names.filter((n) => ASSESSED_PATTERNS.some((p) => p.test(n))),
    saleFields: names.filter((n) => SALE_PATTERNS.some((p) => p.test(n))),
    fieldCount: names.length,
  };
}

/** Layers on the PASDA per-county service that look like parcel layers. */
async function probeCountyService(county: string): Promise<LayerProbe[]> {
  const svcName = `${county.replace(/\s/g, "")}County`;
  const base = `https://mapservices.pasda.psu.edu/server/rest/services/pasda/${svcName}/MapServer`;
  const svc = await fetchJson(`${base}?f=json`);
  if (!svc) return [];
  const layers = (svc.layers ?? []) as { id: number; name: string }[];
  const parcelLayers = layers.filter((l) => /parcel|tax/i.test(l.name));
  const probes: LayerProbe[] = [];
  for (const layer of parcelLayers.slice(0, 4)) {
    const detail = await fetchJson(`${base}/${layer.id}?f=json`);
    if (!detail?.fields) continue;
    probes.push(
      probeFields(`pasda/${svcName}`, layer.name, detail.fields as { name: string }[])
    );
  }
  return probes;
}

/** County snapshot layers inside apps.pasda PA_Parcels_2022. */
async function probeParcels2022(county: string): Promise<LayerProbe[]> {
  const base = "https://apps.pasda.psu.edu/arcgis/rest/services/PA_Parcels_2022/MapServer";
  const svc = await fetchJson(`${base}?f=json`);
  if (!svc) return [];
  const layers = (svc.layers ?? []) as { id: number; name: string }[];
  const compact = county.replace(/\s/g, "");
  const mine = layers.filter((l) =>
    l.name.toLowerCase().startsWith(compact.toLowerCase())
  );
  const probes: LayerProbe[] = [];
  for (const layer of mine) {
    const detail = await fetchJson(`${base}/${layer.id}?f=json`);
    if (!detail?.fields) continue;
    probes.push(
      probeFields("PA_Parcels_2022", layer.name, detail.fields as { name: string }[])
    );
  }
  return probes;
}

function wedgeFor(county: string, steb: StebRow): {
  strength: CountySurvey["wedgeStrength"];
  note: string;
} {
  if (steb.reassessTo100) {
    return {
      strength: "weak",
      note: `Reassessment: ratio resets to 100 effective Jan 1, 2026 — no CLR wedge going forward.`,
    };
  }
  if (STRONG_WEDGE_SHORTLIST.has(county)) {
    return {
      strength: "strong",
      note: `Confirmed live CLR wedge (CLR ${steb.clr}%, PDR 100).`,
    };
  }
  if (steb.pdrBelow100) {
    return {
      strength: "moderate",
      note: `STEB flags PDR < 100 — raw CLR ${steb.clr}% overstates the wedge; verify the county's PDR before relying on it.`,
    };
  }
  if (steb.clr >= 80) {
    return {
      strength: "weak",
      note: `CLR ${steb.clr}% is close to the 100 PDR — little provable overassessment via the ratio alone.`,
    };
  }
  return {
    strength: "moderate",
    note: `CLR ${steb.clr}% vs PDR 100 — real gap; not yet verified as a marketing-grade wedge.`,
  };
}

const TIER_SCORE = { A: 2, B: 1, C: 0 } as const;
const WEDGE_SCORE = { strong: 2, moderate: 1, weak: 0 } as const;

async function main() {
  const results: CountySurvey[] = [];

  for (const county of COUNTIES) {
    const steb = STEB_2026[county];
    process.stdout.write(`surveying ${county}... `);

    const [svcProbes, snapProbes] = await Promise.all([
      probeCountyService(county),
      probeParcels2022(county),
    ]);
    const layers = [...svcProbes, ...snapProbes];

    const hasAssessed = layers.some((l) => l.assessedFields.length > 0);
    const hasSales = layers.some((l) => l.saleFields.length > 0);
    const knownPortal = KNOWN_COUNTY_PORTALS[county] ?? null;

    let dataTier: CountySurvey["dataTier"];
    if (hasAssessed && hasSales) dataTier = "A";
    else if (knownPortal || hasAssessed) dataTier = "B";
    else dataTier = "C";

    const wedge = wedgeFor(county, steb);
    const sourceNote = layers.length
      ? `PASDA layers: ${layers
          .map(
            (l) =>
              `${l.layer} (${l.assessedFields.length ? "assessed✓" : "no assessed"}, ${l.saleFields.length ? "sales✓" : "no sales"})`
          )
          .join("; ")}.`
      : "No PASDA parcel layer found.";

    const survey: CountySurvey = {
      county,
      clr: steb.clr,
      pdrBelow100: Boolean(steb.pdrBelow100),
      reassessTo100: Boolean(steb.reassessTo100),
      pasdaLayers: layers,
      hasAssessed,
      hasSales,
      knownPortal,
      dataTier,
      wedgeStrength: wedge.strength,
      notes: [
        wedge.note,
        sourceNote,
        knownPortal ? `County portal: ${knownPortal}.` : null,
        county === "Philadelphia" ? "Excluded from rollout for now (weak CLR wedge)." : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
    results.push(survey);
    console.log(`tier ${survey.dataTier}, wedge ${survey.wedgeStrength}`);
  }

  // -- Persist raw survey -----------------------------------------------------
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    path.join(dataDir, "county-survey.json"),
    JSON.stringify(results, null, 2)
  );

  // -- Upsert county_data_status (preserve onboarded_at) ----------------------
  const pool = getPool();
  for (const r of results) {
    await pool.query(
      `insert into county_data_status
         (county, data_tier, wedge_strength, has_parcel_data, has_sales_data,
          has_appeal_outcomes, notes, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (county) do update set
         data_tier = excluded.data_tier,
         wedge_strength = excluded.wedge_strength,
         has_parcel_data = county_data_status.has_parcel_data or excluded.has_parcel_data,
         has_sales_data = county_data_status.has_sales_data or excluded.has_sales_data,
         notes = excluded.notes,
         updated_at = now()`,
      [
        r.county,
        r.dataTier,
        r.wedgeStrength,
        r.hasAssessed,
        r.hasSales,
        r.county === "Allegheny", // only Allegheny has bulk outcomes today
        r.notes,
      ]
    );
  }

  // -- Ranked rollout list -----------------------------------------------------
  const ranked = results
    .filter((r) => r.county !== "Philadelphia" && r.county !== "Allegheny")
    .sort((a, b) => {
      const scoreA = TIER_SCORE[a.dataTier] * 10 + WEDGE_SCORE[a.wedgeStrength];
      const scoreB = TIER_SCORE[b.dataTier] * 10 + WEDGE_SCORE[b.wedgeStrength];
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.clr - b.clr; // deeper CLR gap first as tiebreaker
    });

  const md = [
    "# PA County Rollout Ranking",
    "",
    `Generated by \`scripts/survey/county-data.ts\` on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "Ranking = data tier (A: PASDA has assessed values + sales; B: own portal or partial fields; C: nothing free found) × wedge strength (from STEB 2024-certified CLRs, used Jul 2025 - Jun 2026). Allegheny is live; Philadelphia is excluded (reassessment resets its ratio to 100).",
    "",
    "| # | County | Tier | Wedge | CLR % | Notes |",
    "|---|--------|------|-------|-------|-------|",
    ...ranked.map(
      (r, i) =>
        `| ${i + 1} | ${r.county} | ${r.dataTier} | ${r.wedgeStrength} | ${r.clr} | ${r.notes.replace(/\|/g, "/")} |`
    ),
    "",
    "## Open items",
    "",
    "- PDR verification for counties STEB marks as PDR < 100 (their raw CLR overstates the wedge).",
    "- Counties marked weak due to Jan 1, 2026 reassessments (Clarion, Lackawanna, Perry, Schuylkill, Warren, Philadelphia) should be re-checked when STEB publishes post-reassessment ratios.",
    "- Tier C counties: revisit periodically in case a county stands up open data.",
  ].join("\n");

  const docsDir = path.join(process.cwd(), "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(path.join(docsDir, "county-rollout.md"), md);

  const tierCounts = results.reduce(
    (acc, r) => ({ ...acc, [r.dataTier]: (acc[r.dataTier] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  console.log(`\ndone. tiers: ${JSON.stringify(tierCounts)}`);
  console.log(`top 10 rollout: ${ranked.slice(0, 10).map((r) => r.county).join(", ")}`);
  console.log("wrote data/county-survey.json and docs/county-rollout.md; county_data_status updated.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
