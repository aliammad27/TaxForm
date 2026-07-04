/**
 * County Expansion Agent — probes PASDA layers and drafts onboarding artifacts.
 *
 *   npx tsx scripts/agents/county-onboarder.ts --county Chester
 *   npx tsx scripts/agents/county-onboarder.ts --batch 5   # next 5 un-onboarded from rollout
 *
 * Output: docs/county-rollout/<county>.md (draft configs + human checklist).
 * Never auto-registers adapters or filing-critical data.
 */
try {
  process.loadEnvFile();
} catch {}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "../ingest/lib";
import { STEB_2026 } from "../../src/lib/steb";

const ASSESSED_PATTERNS = [/TOTAL_?VAL/i, /APRTOTAL/i, /ASSESS/i, /TOT_?ASS/i, /TOT_VAL/i, /PRC_TTL/i];
const SALE_PATTERNS = [/SALE_?PRICE/i, /CONSIDERAT/i, /LAST_?SALE/i, /SLH_PRICE/i, /SALE_AMT/i];

type LayerProbe = {
  service: string;
  layerId: number;
  layerUrl: string;
  layerName: string;
  assessedFields: string[];
  saleFields: string[];
  allFields: string[];
};

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
    const names = (detail.fields as { name: string }[]).map((f) => f.name);
    probes.push({
      service: `pasda/${svcName}`,
      layerId: layer.id,
      layerUrl: `${base}/${layer.id}`,
      layerName: layer.name,
      assessedFields: names.filter((n) => ASSESSED_PATTERNS.some((p) => p.test(n))),
      saleFields: names.filter((n) => SALE_PATTERNS.some((p) => p.test(n))),
      allFields: names,
    });
  }
  return probes;
}

function bestLayer(probes: LayerProbe[]): LayerProbe | null {
  const scored = probes
    .map((p) => ({
      p,
      score:
        (p.assessedFields.length > 0 ? 2 : 0) +
        (p.saleFields.length > 0 ? 2 : 0) +
        p.allFields.length / 100,
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

function tierFromProbe(p: LayerProbe | null): "A" | "B" | "C" {
  if (!p) return "C";
  if (p.assessedFields.length && p.saleFields.length) return "A";
  if (p.assessedFields.length) return "B";
  return "C";
}

function draftPasdaConfig(county: string, layer: LayerProbe): string {
  const assessed = layer.assessedFields[0] ?? "TOTAL_VAL";
  const salePrice = layer.saleFields[0] ?? "SALE_PRICE";
  return `  ${county}: {
    county: "${county}",
    layerUrl: "${layer.layerUrl}",
    snapshotDate: "TODO-VERIFY-ISO-DATE",
    fields: [
      ${layer.allFields
        .filter((f) => !f.startsWith("Shape"))
        .slice(0, 25)
        .map((f) => `"${f}"`)
        .join(", ")}
    ],
    map: (r) => {
      const cls = camaClass(r.CLASS ?? r.LAND_USE_C ?? r.PROP_USE);
      return {
        parid: normalizeParid(r.PIN ?? r.PARCEL_ID ?? r.CONTROL_NO ?? r.UPI),
        address: str(r.LOC_ADDRES ?? r.SITUS ?? r.ADDRESS_1 ?? r.SITUS_DESC),
        city: str(r.MUNI ?? r.CITY ?? r.municipali),
        zip: str(r.ZIP ?? r.ZIP1)?.slice(0, 5) ?? null,
        muniCode: null,
        muniDesc: str(r.MUNI ?? r.municipali ?? r.DIST_NAME),
        schoolCode: str(r.SCHDIST ?? r.SCHOOL_DIS),
        schoolDesc: null,
        cls,
        clsDesc: CLASS_DESC[cls ?? ""] ?? null,
        useCode: str(r.LUC ?? r.LAND_USE_C),
        lotArea: null,
        countyLand: num(r.LAND_VAL ?? r.LAND_VALUE ?? r.LOT_ASSESS),
        countyBuilding: num(r.IMPROV_VAL ?? r.BLDG_VALUE ?? r.PROP_ASSES),
        countyTotal: num(r.${assessed}),
        yearBuilt: int(r.YEAR_BUILT),
        stories: null,
        bedrooms: null,
        fullBaths: null,
        halfBaths: null,
        totalRooms: null,
        condition: null,
        conditionDesc: null,
        grade: null,
        styleDesc: null,
        livingArea: num(r.GROSS_LIVI ?? r.SQUARE_FT ?? r.SQFT_PLAN_),
        salePrice: num(r.${salePrice}),
        saleDate: parseDate(r.SALE_DATE ?? r.DATE_OF_SA) ?? epochDate(r.SALE_DATE),
      };
    },
  },`;
}

function draftAdapter(county: string, tier: "A" | "B" | "C", layer: LayerProbe | null): string {
  return `export const ${county.toLowerCase()}Adapter = makePasdaAdapter({
  county: "${county}",
  dataTier: "${tier}",
  wedgeStrength: "moderate", // TODO-VERIFY from STEB wedge review
  source: "PASDA ${layer?.layerName ?? "TBD"}",
  ingestScript: "ingest:pasda -- --county ${county}",
  boardName: "${county} County Board of Assessment Appeals", // TODO-VERIFY
  portalUrl: "TODO-VERIFY-PORTAL-URL",
  deadlineMonth: 8, // TODO-VERIFY (common: 8 or 9)
  deadlineDay: 1,
});`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let county = "";
  let batch = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--county") county = args[++i] ?? "";
    else if (args[i] === "--batch") batch = parseInt(args[++i] ?? "5", 10);
  }
  return { county, batch };
}

async function onboardedCounties(): Promise<Set<string>> {
  try {
    const pool = getPool();
    const { rows } = await pool.query<{ county: string }>(
      `select county from county_data_status where onboarded_at is not null`
    );
    await pool.end();
    return new Set(rows.map((r) => r.county));
  } catch {
    return new Set(["Allegheny", "York", "Cumberland", "Montgomery", "Butler", "Indiana", "Juniata"]);
  }
}

function nextCountiesFromRollout(live: Set<string>, n: number): string[] {
  const md = readFileSync(path.join(process.cwd(), "docs", "county-rollout.md"), "utf-8");
  const counties: string[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\| \d+ \| ([A-Za-z ]+) \|/);
    if (!m) continue;
    const name = m[1].trim();
    if (name === "Philadelphia" || live.has(name)) continue;
    counties.push(name);
    if (counties.length >= n) break;
  }
  return counties;
}

async function draftCounty(county: string) {
  const steb = STEB_2026[county];
  if (!steb) throw new Error(`Unknown county: ${county}`);

  const probes = await probeCountyService(county);
  const best = bestLayer(probes);
  const tier = tierFromProbe(best);
  const clr = steb.clr / 100;

  const outDir = path.join(process.cwd(), "docs", "county-rollout");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${county.toLowerCase()}.md`);

  const body = `# ${county} County — onboarding draft

Generated by \`scripts/agents/county-onboarder.ts\` on ${new Date().toISOString().slice(0, 10)}.

**Status: DRAFT — do not ship without human verification of filing-critical fields.**

## Survey summary

- Data tier: **${tier}**
- STEB CLR: ${steb.clr}%
- Best PASDA layer: ${best ? `${best.layerName} (${best.layerUrl})` : "_none found_"}
- Assessed fields: ${best?.assessedFields.join(", ") || "—"}
- Sale fields: ${best?.saleFields.join(", ") || "—"}

## Human verification checklist

- [ ] Confirm PASDA layer URL and snapshot date
- [ ] Verify field mapping against 5 sample parcels
- [ ] Confirm board name, filing deadline (month/day), portal URL, mailing address
- [ ] Spot-check CLR ${steb.clr}% against STEB publication
- [ ] Run \`npm run ingest:pasda -- --county ${county}\`
- [ ] Run \`npm run ingest:clr\`
- [ ] Apply appeal_windows migration after verifying dates/addresses
- [ ] Smoke-test a residential score
- [ ] Set \`county_data_status.onboarded_at\`

## CLR entry (\`scripts/ingest/clr.ts\`)

\`\`\`typescript
{ county: "${county}", taxYear: 2026, ratio: ${clr.toFixed(4)}, source: "STEB" },
\`\`\`

## PASDA config draft (\`scripts/ingest/pasda.ts\`)

\`\`\`typescript
${best ? draftPasdaConfig(county, best) : "// Tier B/C — custom importer scaffold required (see scripts/ingest/york.ts)"}
\`\`\`

## Adapter draft (\`src/lib/counties/batch.ts\`)

\`\`\`typescript
${draftAdapter(county, tier, best)}
\`\`\`

## Registry (\`src/lib/counties/registry.ts\`)

\`\`\`typescript
import { ${county.toLowerCase()}Adapter } from "./batch";
// ...
[${county.toLowerCase()}Adapter.county, ${county.toLowerCase()}Adapter],
\`\`\`

## Appeal windows SQL template

\`\`\`sql
insert into public.appeal_windows
  (county, tax_year, board_name, open_date, close_date, portal_url, mailing_address)
values
  ('${county}', 2026, 'TODO-VERIFY-BOARD-NAME', null, 'TODO-VERIFY-DEADLINE',
   'TODO-VERIFY-PORTAL-URL', 'TODO-VERIFY-MAILING-ADDRESS'),
  ('${county}', 2027, 'TODO-VERIFY-BOARD-NAME', null, 'TODO-VERIFY-DEADLINE+1Y',
   'TODO-VERIFY-PORTAL-URL', 'TODO-VERIFY-MAILING-ADDRESS')
on conflict (county, tax_year) do update set
  board_name = excluded.board_name,
  close_date = excluded.close_date,
  portal_url = excluded.portal_url,
  mailing_address = excluded.mailing_address;

update public.county_data_status
set onboarded_at = now(), has_parcel_data = true, has_sales_data = ${tier === "A"},
    updated_at = now()
where county = '${county}';
\`\`\`
`;

  writeFileSync(outPath, body);
  console.log(`Wrote ${outPath}`);
}

async function main() {
  const { county, batch } = parseArgs();
  const live = await onboardedCounties();

  if (county) {
    await draftCounty(county);
    return;
  }

  if (batch > 0) {
    const targets = nextCountiesFromRollout(live, batch);
    for (const c of targets) {
      await draftCounty(c);
    }
    console.log(`Drafted ${targets.length} counties: ${targets.join(", ")}`);
    return;
  }

  console.error("Usage: --county <name> | --batch <n>");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
