import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured, textFromMessage } from "./anthropic";
import type { SavingsScore } from "./savings";

export type VerificationIssue = {
  kind: "dollar_amount" | "percentage" | "comp_address" | "narrative";
  expected: string | null;
  found: string;
};

export type VerificationResult = {
  ok: boolean;
  checked: string[];
  issues: VerificationIssue[];
  method: "deterministic" | "claude";
};

const DOLLAR_RE = /\$[\d,]+(?:\.\d{1,2})?/g;
const PCT_RE = /\b\d+(?:\.\d+)?%/g;

function parseDollar(raw: string): number {
  return Math.round(parseFloat(raw.replace(/[$,]/g, "")));
}

function withinTolerance(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance || withinPctTolerance(a, b, 0.02);
}

function withinPctTolerance(a: number, b: number, tolerance = 0.02): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= tolerance;
}

function buildAllowedDollars(score: SavingsScore): Set<number> {
  const allowed = new Set<number>();
  const add = (n: number | null | undefined) => {
    if (n != null && Number.isFinite(n)) allowed.add(Math.round(n));
  };

  add(score.current_assessed);
  add(score.estimated_fmv);
  add(score.implied_assessed);
  add(score.assessment_reduction);
  add(score.estimated_annual_savings);
  add(Math.round(score.estimated_annual_savings / 12));
  add(score.comp_result.subject.county_total);

  for (const comp of score.comp_result.comps) {
    add(comp.sale_price);
    add(comp.adjusted_value);
    let running = comp.sale_price;
    for (const adj of comp.adjustments) {
      add(Math.abs(adj.amount));
      add(adj.amount);
      running += adj.amount;
      add(running);
    }
  }

  // Intermediate calculation products that may appear in letters.
  const clrPct = score.clr * 100;
  const product = Math.round(score.estimated_fmv * (clrPct / 100));
  add(product);

  add(score.millage?.mills ?? 25);

  // Rounded per-square-foot or per-unit figures sometimes appear in narratives.
  if (score.comp_result.subject.finished_living_area) {
    add(
      Math.round(
        score.estimated_fmv / score.comp_result.subject.finished_living_area
      )
    );
  }

  return allowed;
}

function buildAllowedPercentages(score: SavingsScore): Set<string> {
  const pct = (score.clr * 100).toFixed(2);
  const short = (score.clr * 100).toFixed(1);
  const rounded = Math.round(score.clr * 100).toString();
  return new Set([`${pct}%`, `${short}%`, `${rounded}%`]);
}

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressMatches(letter: string, address: string | null): boolean {
  if (!address) return true;
  const norm = normalizeAddress(address);
  if (norm.length < 8) return true;
  const letterNorm = normalizeAddress(letter);
  if (letterNorm.includes(norm)) return true;
  // Match on street number + first significant token (e.g. "123 Main").
  const parts = norm.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const prefix = `${parts[0]} ${parts[1]}`;
    return letterNorm.includes(prefix);
  }
  return false;
}

function verifyDeterministic(text: string, score: SavingsScore): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const allowedDollars = buildAllowedDollars(score);
  const allowedPcts = buildAllowedPercentages(score);
  const checked: string[] = [];

  const dollarMatches = text.match(DOLLAR_RE) ?? [];
  for (const raw of dollarMatches) {
    const value = parseDollar(raw);
    checked.push(`dollar:${raw}`);
    const matched = [...allowedDollars].some((a) => withinTolerance(a, value));
    if (!matched) {
      issues.push({
        kind: "dollar_amount",
        expected: `One of: ${[...allowedDollars].sort((a, b) => a - b).map((n) => `$${n.toLocaleString()}`).join(", ")}`,
        found: raw,
      });
    }
  }

  const pctMatches = text.match(PCT_RE) ?? [];
  for (const raw of pctMatches) {
    checked.push(`pct:${raw}`);
    const normalized = raw.replace(/\s/g, "");
    const pctValue = parseFloat(normalized);
    const clrPct = score.clr * 100;
    // Only verify percentages that look like CLR values (within 15 pts of certified ratio).
    if (Math.abs(pctValue - clrPct) > 15) continue;
    const matched = [...allowedPcts].some(
      (a) => a.replace(/\s/g, "") === normalized || withinTolerance(pctValue, parseFloat(a), 0.15)
    );
    if (!matched && !raw.includes("occupancy")) {
      issues.push({
        kind: "percentage",
        expected: `CLR ${(score.clr * 100).toFixed(2)}%`,
        found: raw,
      });
    }
  }

  for (const comp of score.comp_result.comps) {
    checked.push(`comp:${comp.address ?? comp.parid}`);
    if (!addressMatches(text, comp.address)) {
      issues.push({
        kind: "comp_address",
        expected: comp.address,
        found: "Address not found in letter text",
      });
    }
  }

  return issues;
}

async function verifyWithClaude(
  text: string,
  score: SavingsScore,
  deterministicIssues: VerificationIssue[]
): Promise<VerificationIssue[]> {
  if (!isAnthropicConfigured()) return [];

  const source = {
    current_assessed: score.current_assessed,
    estimated_fmv: score.estimated_fmv,
    implied_assessed: score.implied_assessed,
    assessment_reduction: score.assessment_reduction,
    estimated_annual_savings: score.estimated_annual_savings,
    clr: score.clr,
    comps: score.comp_result.comps.map((c) => ({
      address: c.address,
      sale_date: c.sale_date,
      sale_price: c.sale_price,
      adjusted_value: c.adjusted_value,
      adjustments: c.adjustments,
    })),
    narrative: score.comp_result.narrative,
  };

  try {
    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: `You verify property tax appeal letters against source valuation data. Flag only factual mismatches: dollar figures, dates, addresses, or CLR math that contradict the source JSON. Ignore stylistic differences. Return JSON only: { "issues": [{ "kind": "narrative", "expected": string|null, "found": string }] }. If no extra issues beyond the deterministic list, return { "issues": [] }.`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            letter_excerpt: text.slice(0, 6000),
            source,
            already_flagged: deterministicIssues,
          }),
        },
      ],
    });

    const raw = textFromMessage(response);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as {
      issues?: VerificationIssue[];
    };
    return (parsed.issues ?? []).filter((i) => i.found);
  } catch (err) {
    console.error("Claude letter verification failed", err);
    return [];
  }
}

/** Optional Claude pass for narrative claims that deterministic checks cannot parse. */
export async function verifyLetterNarrative(
  text: string,
  score: SavingsScore
): Promise<VerificationIssue[]> {
  return verifyWithClaude(text, score, []);
}

/** Fact-checks a drafted appeal letter against the savings score snapshot. */
export async function verifyLetter(
  text: string,
  score: SavingsScore
): Promise<VerificationResult> {
  const checked: string[] = [];
  const deterministicIssues = verifyDeterministic(text, score);

  const dollarMatches = text.match(DOLLAR_RE) ?? [];
  const pctMatches = text.match(PCT_RE) ?? [];
  checked.push(
    ...dollarMatches.map((d) => `dollar:${d}`),
    ...pctMatches.map((p) => `pct:${p}`),
    ...score.comp_result.comps.map((c) => `comp:${c.address ?? c.parid}`)
  );

  const issues = deterministicIssues;
  const method: VerificationResult["method"] = "deterministic";

  return {
    ok: issues.length === 0,
    checked,
    issues,
    method,
  };
}
