/**
 * Appeal Window Verification Agent — diffs stored appeal_windows rows against
 * current board portal pages. Never auto-applies changes.
 *
 *   npx tsx scripts/agents/verify-appeal-windows.ts
 *   npx tsx scripts/agents/verify-appeal-windows.ts --paste Allegheny data/allegheny-window.txt
 *
 * Output: docs/appeal-window-review-<year>.md
 */
try {
  process.loadEnvFile();
} catch {}

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { getPool } from "../ingest/lib";
import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured, textFromMessage } from "../../src/lib/anthropic";
import { listCountyAdapters } from "../../src/lib/counties/registry";

type WindowRow = {
  county: string;
  tax_year: number;
  board_name: string | null;
  open_date: string | null;
  close_date: string | null;
  portal_url: string | null;
  mailing_address: string | null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const paste = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--paste" && args[i + 1] && args[i + 2]) {
      paste.set(args[i + 1], args[i + 2]);
      i += 2;
    }
  }
  return { paste };
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TaxForm-AppealWindowVerifier/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
  } catch {
    return null;
  }
}

async function diffWithClaude(
  stored: WindowRow,
  currentText: string
): Promise<string> {
  if (!isAnthropicConfigured()) {
    return "_Claude unavailable — manual review required._";
  }

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system:
      "You compare stored property tax appeal window data against current board website text. Summarize only factual differences in deadlines, board name, mailing address, or portal URL. If nothing material changed, say 'No material changes detected.' Be concise.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          stored: {
            board_name: stored.board_name,
            open_date: stored.open_date,
            close_date: stored.close_date,
            mailing_address: stored.mailing_address,
            portal_url: stored.portal_url,
            tax_year: stored.tax_year,
          },
          current_page_excerpt: currentText.slice(0, 8000),
        }),
      },
    ],
  });

  return textFromMessage(response);
}

async function main() {
  const { paste } = parseArgs();
  const pool = getPool();
  const counties = listCountyAdapters().map((a) => a.county);

  const { rows } = await pool.query<WindowRow>(
    `select county, tax_year, board_name, open_date::text, close_date::text,
            portal_url, mailing_address
     from appeal_windows
     where county = any($1::text[])
     order by county, tax_year desc`,
    [counties]
  );

  const latestByCounty = new Map<string, WindowRow>();
  for (const row of rows) {
    if (!latestByCounty.has(row.county)) latestByCounty.set(row.county, row);
  }

  const sections: string[] = [
    `# Appeal window verification report`,
    ``,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `**Do not auto-apply.** Review each county and update \`appeal_windows\` manually.`,
    ``,
  ];

  for (const county of counties) {
    const stored = latestByCounty.get(county);
    if (!stored) {
      sections.push(`## ${county}\n\n_No appeal_windows row found._\n`);
      continue;
    }

    let currentText: string | null = null;
    const pastePath = paste.get(county);
    if (pastePath && existsSync(pastePath)) {
      currentText = readFileSync(pastePath, "utf-8").slice(0, 12_000);
    } else if (stored.portal_url) {
      currentText = await fetchPageText(stored.portal_url);
    }

    sections.push(`## ${county}`);
    sections.push("");
    sections.push("### Stored row");
    sections.push("");
    sections.push(`| Field | Value |`);
    sections.push(`|-------|-------|`);
    sections.push(`| Tax year | ${stored.tax_year} |`);
    sections.push(`| Board | ${stored.board_name ?? "—"} |`);
    sections.push(`| Open | ${stored.open_date ?? "—"} |`);
    sections.push(`| Close | ${stored.close_date ?? "—"} |`);
    sections.push(`| Portal | ${stored.portal_url ?? "—"} |`);
    sections.push(`| Mailing | ${stored.mailing_address ?? "—"} |`);
    sections.push("");

    if (!currentText) {
      sections.push(
        "_Could not fetch portal page. Re-run with `--paste ${county} <file>`._\n"
      );
      continue;
    }

    const summary = await diffWithClaude(stored, currentText);
    sections.push("### Diff summary");
    sections.push("");
    sections.push(summary);
    sections.push("");
  }

  await pool.end();

  const year = new Date().getFullYear();
  const outPath = path.join(process.cwd(), "docs", `appeal-window-review-${year}.md`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, sections.join("\n"));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
