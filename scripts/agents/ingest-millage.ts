/**
 * Millage Ingestion Agent — extracts municipality/school/county mill rates from
 * a county publication PDF and emits a review-ready SQL migration draft.
 *
 *   npx tsx scripts/agents/ingest-millage.ts --county Chester --source <pdf-path-or-url>
 *   npx tsx scripts/agents/ingest-millage.ts --county Cumberland --source data/cumberland-millage.pdf --tax-year 2025
 *
 * Never writes to the database. Human reviews the draft SQL before applying.
 */
try {
  process.loadEnvFile();
} catch {}

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getPool } from "../ingest/lib";
import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured } from "../../src/lib/anthropic";

type MillageRow = {
  municipality: string;
  school_district: string;
  county_mills: number;
  municipal_mills: number;
  school_mills: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  let county = "";
  let source = "";
  let taxYear = new Date().getFullYear();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--county") county = args[++i] ?? "";
    else if (args[i] === "--source") source = args[++i] ?? "";
    else if (args[i] === "--tax-year") taxYear = parseInt(args[++i] ?? "", 10);
  }
  if (!county || !source) {
    console.error(
      "Usage: npx tsx scripts/agents/ingest-millage.ts --county <name> --source <pdf-path-or-url> [--tax-year 2025]"
    );
    process.exit(1);
  }
  return { county, source, taxYear };
}

async function loadSourceBytes(source: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "application/pdf";
    return { bytes: buf, mime };
  }
  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(source);
  const mime = source.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "text/plain";
  return { bytes: new Uint8Array(buf), mime };
}

async function extractMillage(
  bytes: Uint8Array,
  mime: string,
  county: string
): Promise<MillageRow[]> {
  if (!isAnthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY required for millage extraction");
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (mime.includes("pdf")) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(bytes).toString("base64"),
      },
    });
  } else {
    content.push({
      type: "text",
      text: Buffer.from(bytes).toString("utf-8").slice(0, 150_000),
    });
  }
  content.push({
    type: "text",
    text: `Extract every municipality/school district millage row for ${county} County, PA. Return county mills, municipal mills, and school mills separately (not combined). Use exact municipality and school district names as printed.`,
  });

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system:
      "You extract Pennsylvania property tax millage tables. Amounts are in mills (not dollars). Do not invent rows; extract only what is in the document.",
    tools: [
      {
        name: "submit_millage",
        description: "Submit extracted millage rows",
        input_schema: {
          type: "object",
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  municipality: { type: "string" },
                  school_district: { type: "string" },
                  county_mills: { type: "number" },
                  municipal_mills: { type: "number" },
                  school_mills: { type: "number" },
                },
                required: [
                  "municipality",
                  "school_district",
                  "county_mills",
                  "municipal_mills",
                  "school_mills",
                ],
              },
            },
          },
          required: ["rows"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_millage" },
    messages: [{ role: "user", content }],
  });

  const tool = response.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return [];
  const input = tool.input as { rows?: MillageRow[] };
  return input.rows ?? [];
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

function toSql(county: string, taxYear: number, rows: MillageRow[]): string {
  const values = rows
    .map(
      (r) =>
        `  ('${escapeSql(county)}', '${escapeSql(r.municipality)}', '${escapeSql(r.school_district)}', ${taxYear}, ${r.county_mills}, ${r.municipal_mills}, ${r.school_mills})`
    )
    .join(",\n");
  return `-- DRAFT: review before applying. Generated by ingest-millage agent.
-- Spot-check 3-5 rows against the source PDF.

insert into public.millage_rates
  (county, municipality, school_district, tax_year, county_mills, municipal_mills, school_mills)
values
${values}
on conflict (county, municipality, school_district, tax_year) do update
  set county_mills = excluded.county_mills,
      municipal_mills = excluded.municipal_mills,
      school_mills = excluded.school_mills;
`;
}

async function validateNames(county: string, rows: MillageRow[]) {
  const pool = getPool();
  const { rows: muniRows } = await pool.query<{ m: string }>(
    `select distinct muni_desc as m from parcels where county = $1 and muni_desc is not null`,
    [county]
  );
  const { rows: schoolRows } = await pool.query<{ s: string }>(
    `select distinct school_desc as s from parcels where county = $1 and school_desc is not null`,
    [county]
  );
  await pool.end();

  const munis = muniRows.map((r) => r.m.toLowerCase());
  const schools = schoolRows.map((r) => r.s.toLowerCase());

  const unmatchedMuni: string[] = [];
  const unmatchedSchool: string[] = [];

  for (const row of rows) {
    const m = row.municipality.toLowerCase();
    const s = row.school_district.toLowerCase();
    if (!munis.some((p) => p.includes(m) || m.includes(p))) {
      unmatchedMuni.push(row.municipality);
    }
    if (!schools.some((p) => p.includes(s) || s.includes(p))) {
      unmatchedSchool.push(row.school_district);
    }
  }

  return {
    parcelMuniCount: munis.length,
    parcelSchoolCount: schools.length,
    unmatchedMuni: [...new Set(unmatchedMuni)],
    unmatchedSchool: [...new Set(unmatchedSchool)],
  };
}

async function main() {
  const { county, source, taxYear } = parseArgs();
  const { bytes, mime } = await loadSourceBytes(source);
  const rows = await extractMillage(bytes, mime, county);

  if (rows.length === 0) {
    console.error("No millage rows extracted");
    process.exit(1);
  }

  const validation = await validateNames(county, rows).catch(() => ({
    parcelMuniCount: 0,
    parcelSchoolCount: 0,
    unmatchedMuni: [] as string[],
    unmatchedSchool: [] as string[],
    note: "DATABASE_URL not set — skipped parcel name validation",
  }));

  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const slug = county.toLowerCase();
  const outDir = path.join(process.cwd(), "data", "millage-drafts");
  mkdirSync(outDir, { recursive: true });

  const sqlPath = path.join(outDir, `${ts}_${slug}_millage.sql`);
  const reportPath = path.join(outDir, `${ts}_${slug}_report.md`);

  writeFileSync(sqlPath, toSql(county, taxYear, rows));

  const sample = rows.slice(0, 5);
  const report = `# Millage draft — ${county} County

- Source: ${source}
- Tax year: ${taxYear}
- Rows extracted: ${rows.length}
- SQL draft: \`${sqlPath}\`

## Name validation (against parcels table)

- Distinct municipalities in parcels: ${validation.parcelMuniCount}
- Distinct school districts in parcels: ${validation.parcelSchoolCount}
- Unmatched municipalities (${validation.unmatchedMuni.length}): ${validation.unmatchedMuni.slice(0, 10).join(", ") || "none"}
- Unmatched school districts (${validation.unmatchedSchool.length}): ${validation.unmatchedSchool.slice(0, 10).join(", ") || "none"}

## Sample rows (spot-check against PDF)

${sample.map((r) => `- ${r.municipality} / ${r.school_district}: county ${r.county_mills} + muni ${r.municipal_mills} + school ${r.school_mills} = **${(r.county_mills + r.municipal_mills + r.school_mills).toFixed(4)} mills**`).join("\n")}

## Human review checklist

- [ ] Spot-check 3–5 rows against source PDF
- [ ] Confirm municipality/school names align with parcel records
- [ ] Move SQL to \`supabase/migrations/\` and apply after review
`;

  writeFileSync(reportPath, report);
  console.log(`Extracted ${rows.length} rows`);
  console.log(`SQL draft: ${sqlPath}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
