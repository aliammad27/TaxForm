/**
 * Commercial Prospecting Agent — ranks commercial parcels by CLR-implied
 * assessment gap and optionally drafts outreach emails.
 *
 *   npx tsx scripts/agents/commercial-prospects.ts
 *   npx tsx scripts/agents/commercial-prospects.ts --county Chester --limit 50 --draft-emails
 *
 * Output: data/prospects/<county>-prospects.csv
 */
try {
  process.loadEnvFile();
} catch {}

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "../ingest/lib";
import { listCountyAdapters } from "../../src/lib/counties/registry";
import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured, textFromMessage } from "../../src/lib/anthropic";

/** PASDA layer URLs for owner enrichment (parid field → owner/mailing fields). */
const OWNER_LAYERS: Record<
  string,
  { url: string; paridField: string; ownerFields: string[]; mailingFields: string[] }
> = {
  Chester: {
    url: "https://mapservices.pasda.psu.edu/server/rest/services/pasda/ChesterCounty/MapServer/11",
    paridField: "PIN_ASMNT",
    ownerFields: ["OWN1", "OWN2"],
    mailingFields: ["ADDR1", "ADDR2", "ADDR3", "ZIP1"],
  },
  Bedford: {
    url: "https://mapservices.pasda.psu.edu/server/rest/services/pasda/BedfordCounty/MapServer/0",
    paridField: "CONTROL_NO",
    ownerFields: ["OWNER_NAME", "OWNER_NA_1"],
    mailingFields: ["OWNER_ADDR", "OWNER_AD_1", "OWNER_AD_2", "OWNER_CITY", "OWNER_STAT", "OWNER_ZIP"],
  },
  Forest: {
    url: "https://mapservices.pasda.psu.edu/server/rest/services/pasda/ForestCounty/MapServer/3",
    paridField: "PARCEL",
    ownerFields: ["OWNER1", "MAILTO_NAM"],
    mailingFields: ["MAILTO_ADD", "MAILTO_CIT", "MAILTO_ST", "MAILTO_ZIP"],
  },
  Franklin: {
    url: "https://mapservices.pasda.psu.edu/server/rest/services/pasda/FranklinCounty/MapServer/0",
    paridField: "CONTROL_NU",
    ownerFields: ["OWNER_FNAM", "OWNER_LNAM", "FULL_OWNER"],
    mailingFields: ["OWNER_ADDR", "OWNER_AD_1", "OWNER_CITY", "OWNER_STAT", "OWNER_ZIP"],
  },
  Allegheny: {
    url: "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/WPRDC_PARCEL_DATA/FeatureServer/0",
    paridField: "PARID",
    ownerFields: ["OWNERNAME"],
    mailingFields: ["MAILINGADDRESS"],
  },
};

type Prospect = {
  parid: string;
  county: string;
  full_address: string | null;
  muni_desc: string | null;
  class_desc: string | null;
  county_total: number;
  sale_price: number;
  sale_date: string;
  clr: number;
  implied_market: number;
  assessment_gap: number;
  gap_ratio: number;
  owner_name: string;
  mailing_address: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  let county = "";
  let limit = 50;
  let draftEmails = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--county") county = args[++i] ?? "";
    else if (args[i] === "--limit") limit = parseInt(args[++i] ?? "50", 10);
    else if (args[i] === "--draft-emails") draftEmails = true;
  }
  return { county, limit, draftEmails };
}

async function queryProspects(county: string, limit: number): Promise<Prospect[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    parid: string;
    county: string;
    full_address: string | null;
    muni_desc: string | null;
    class_desc: string | null;
    county_total: string;
    sale_price: string;
    sale_date: string;
    clr: string;
  }>(
    `select p.parid, p.county, p.full_address, p.muni_desc, p.class_desc,
            p.county_total::text, s.sale_price::text, s.sale_date::text, c.ratio::text as clr
     from parcels p
     join sales s on s.parid = p.parid and s.is_valid_sale
     join common_level_ratio c on c.county = p.county and c.tax_year = p.tax_year
     where p.county = $1
       and (p.class = 'C' or upper(coalesce(p.class_desc, '')) like '%COMMERCIAL%'
            or upper(coalesce(p.use_desc, '')) like '%COMMERCIAL%')
       and p.county_total > 0
       and s.sale_price >= 50000
     order by (p.county_total - s.sale_price * c.ratio) / nullif(p.county_total, 0) desc
     limit $2`,
    [county, limit * 3]
  );
  await pool.end();

  const seen = new Set<string>();
  const out: Prospect[] = [];
  for (const r of rows) {
    if (seen.has(r.parid)) continue;
    seen.add(r.parid);
    const countyTotal = parseFloat(r.county_total);
    const salePrice = parseFloat(r.sale_price);
    const clr = parseFloat(r.clr);
    const implied = Math.round(salePrice * clr);
    const gap = Math.max(0, countyTotal - implied);
    const gapRatio = countyTotal > 0 ? gap / countyTotal : 0;
    if (gapRatio < 0.05) continue;
    out.push({
      parid: r.parid,
      county: r.county,
      full_address: r.full_address,
      muni_desc: r.muni_desc,
      class_desc: r.class_desc,
      county_total: countyTotal,
      sale_price: salePrice,
      sale_date: r.sale_date,
      clr,
      implied_market: implied,
      assessment_gap: gap,
      gap_ratio: gapRatio,
      owner_name: "",
      mailing_address: "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function enrichOwner(county: string, prospects: Prospect[]): Promise<void> {
  const layer = OWNER_LAYERS[county];
  if (!layer) return;

  const parids = prospects.map((p) => p.parid);
  const chunk = 25;
  for (let i = 0; i < parids.length; i += chunk) {
    const slice = parids.slice(i, i + chunk);
    const quoted = slice.map((p) => `'${p.replace(/'/g, "''")}'`).join(",");
    const outFields = [
      layer.paridField,
      ...layer.ownerFields,
      ...layer.mailingFields,
    ].join(",");
    const url =
      `${layer.url}/query?where=${layer.paridField}+in+(${quoted})` +
      `&outFields=${encodeURIComponent(outFields)}&f=json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        features?: { attributes: Record<string, unknown> }[];
      };
      for (const f of json.features ?? []) {
        const a = f.attributes;
        const parid = String(a[layer.paridField] ?? "").replace(/[^0-9A-Za-z]/g, "");
        const prospect = prospects.find(
          (p) => p.parid.replace(/[^0-9A-Za-z]/g, "") === parid
        );
        if (!prospect) continue;
        prospect.owner_name = layer.ownerFields
          .map((k) => a[k])
          .filter(Boolean)
          .join(" ")
          .trim();
        prospect.mailing_address = layer.mailingFields
          .map((k) => a[k])
          .filter(Boolean)
          .join(", ")
          .trim();
      }
    } catch {
      // skip chunk on timeout
    }
  }
}

async function draftEmail(prospect: Prospect): Promise<string> {
  if (!isAnthropicConfigured()) {
    return `[Set ANTHROPIC_API_KEY for email drafts] Prospect: ${prospect.owner_name || prospect.full_address}`;
  }
  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    system:
      "Draft a brief, professional cold outreach email for a commercial property tax appeal firm. Factual only — use the data provided. Under 150 words.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          property: prospect.full_address,
          municipality: prospect.muni_desc,
          current_assessment: prospect.county_total,
          recent_sale: prospect.sale_price,
          clr_pct: (prospect.clr * 100).toFixed(2),
          implied_assessment: prospect.implied_market,
          potential_reduction: prospect.assessment_gap,
          owner: prospect.owner_name || "Property Owner",
        }),
      },
    ],
  });
  return textFromMessage(response);
}

function toCsv(rows: Prospect[]): string {
  const headers = [
    "parid", "county", "full_address", "muni_desc", "class_desc",
    "county_total", "sale_price", "sale_date", "clr", "implied_market",
    "assessment_gap", "gap_ratio", "owner_name", "mailing_address",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = String((r as unknown as Record<string, unknown>)[h] ?? "");
          return v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

async function runCounty(county: string, limit: number, draftEmails: boolean) {
  const prospects = await queryProspects(county, limit);
  await enrichOwner(county, prospects);

  const outDir = path.join(process.cwd(), "data", "prospects");
  mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, `${county.toLowerCase()}-prospects.csv`);
  writeFileSync(csvPath, toCsv(prospects));
  console.log(`${county}: ${prospects.length} prospects → ${csvPath}`);

  if (draftEmails && prospects.length > 0) {
    const emailPath = path.join(outDir, `${county.toLowerCase()}-emails.md`);
    const sections: string[] = [];
    for (const p of prospects.slice(0, 10)) {
      sections.push(`## ${p.full_address ?? p.parid}\n\n${await draftEmail(p)}\n`);
    }
    writeFileSync(emailPath, sections.join("\n---\n\n"));
    console.log(`  emails → ${emailPath}`);
  }
}

async function main() {
  const { county, limit, draftEmails } = parseArgs();
  const counties = county
    ? [county]
    : listCountyAdapters().map((a) => a.county);

  for (const c of counties) {
    try {
      await runCounty(c, limit, draftEmails);
    } catch (err) {
      console.error(`${c} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
