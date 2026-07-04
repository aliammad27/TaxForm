import { z } from "zod";
import { getPool } from "./db";
import { getParcel, type ParcelSummary } from "./parcels";
import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured } from "./anthropic";

export type CompCandidate = {
  parid: string;
  full_address: string | null;
  muni_desc: string | null;
  school_desc: string | null;
  class: string | null;
  finished_living_area: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  year_built: number | null;
  condition_desc: string | null;
  grade_desc: string | null;
  county_total: number | null;
  sale_date: string | null;
  sale_price: number | null;
  distance: number;
};

export type AdjustedComp = {
  parid: string;
  address: string | null;
  sale_date: string | null;
  sale_price: number;
  adjustments: { reason: string; amount: number }[];
  adjusted_value: number;
  weight: number;
};

export type CompResult = {
  subject: ParcelSummary;
  estimated_fmv: number;
  comps: AdjustedComp[];
  narrative: string;
  method: "claude" | "heuristic";
  /** Optional CV condition findings that informed adjustments. */
  condition_context?: string;
};

export async function getCompCandidates(
  parid: string,
  limit = 20
): Promise<CompCandidate[]> {
  const { rows } = await getPool().query<CompCandidate>(
    `select parid, full_address, muni_desc, school_desc, class,
            finished_living_area::float8 as finished_living_area,
            bedrooms, full_baths, half_baths, year_built,
            condition_desc, grade_desc,
            county_total::float8 as county_total,
            sale_date::text as sale_date,
            sale_price::float8 as sale_price,
            distance
     from comp_candidates($1, $2)`,
    [parid, limit]
  );
  return rows;
}

const ANNUAL_APPRECIATION = 0.03;

function monthsSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  return Math.max(0, (Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44));
}

/**
 * Deterministic sales-comparison fallback used when no Anthropic key is
 * configured (and as a sanity anchor for the Claude estimate). Standard
 * residential adjustments: time, living area, and bath count.
 */
function heuristicEstimate(
  subject: ParcelSummary,
  candidates: CompCandidate[]
): Omit<CompResult, "subject" | "method"> {
  const usable = candidates.filter((c) => c.sale_price && c.sale_price > 10000);
  const top = usable.slice(0, 5);
  if (!top.length) {
    // No comps: fall back to the county's own FMV opinion.
    const fmv = subject.fair_market_total ?? subject.county_total ?? 0;
    return {
      estimated_fmv: fmv,
      comps: [],
      narrative:
        "No recent arm's-length comparable sales were found; the estimate falls back to the county's stated fair market value.",
    };
  }

  const comps: AdjustedComp[] = top.map((c) => {
    const adjustments: { reason: string; amount: number }[] = [];
    let value = c.sale_price!;

    const months = c.sale_date ? monthsSince(c.sale_date) : 0;
    const timeAdj = Math.round(value * (ANNUAL_APPRECIATION / 12) * months);
    if (timeAdj) {
      adjustments.push({
        reason: `Market time adjustment (${months.toFixed(0)} months at ${(ANNUAL_APPRECIATION * 100).toFixed(0)}%/yr)`,
        amount: timeAdj,
      });
      value += timeAdj;
    }

    if (subject.finished_living_area && c.finished_living_area) {
      const ppsf = c.sale_price! / c.finished_living_area;
      const sqftAdj = Math.round(
        (subject.finished_living_area - c.finished_living_area) * ppsf * 0.5
      );
      if (sqftAdj) {
        adjustments.push({
          reason: `Living area difference (${Math.round(subject.finished_living_area - c.finished_living_area)} sqft at 50% of $${ppsf.toFixed(0)}/sqft)`,
          amount: sqftAdj,
        });
        value += sqftAdj;
      }
    }

    const subjBaths = (subject.full_baths ?? 0) + 0.5 * (subject.half_baths ?? 0);
    const compBaths = (c.full_baths ?? 0) + 0.5 * (c.half_baths ?? 0);
    const bathAdj = Math.round((subjBaths - compBaths) * 5000);
    if (bathAdj) {
      adjustments.push({ reason: "Bathroom count difference", amount: bathAdj });
      value += bathAdj;
    }

    return {
      parid: c.parid,
      address: c.full_address,
      sale_date: c.sale_date,
      sale_price: c.sale_price!,
      adjustments,
      adjusted_value: Math.round(value),
      weight: 1 / (1 + c.distance),
    };
  });

  const totalWeight = comps.reduce((s, c) => s + c.weight, 0);
  const estimated = Math.round(
    comps.reduce((s, c) => s + c.adjusted_value * c.weight, 0) / totalWeight
  );

  return {
    estimated_fmv: estimated,
    comps,
    narrative: `Estimate derived from ${comps.length} recent arm's-length sales in ${subject.muni_desc ?? "the same municipality"}, adjusted for sale date, living area, and bathroom count, weighted by similarity.`,
  };
}

const claudeCompSchema = z.object({
  estimated_fmv: z.number(),
  narrative: z.string(),
  comps: z.array(
    z.object({
      parid: z.string(),
      adjustments: z.array(z.object({ reason: z.string(), amount: z.number() })),
      adjusted_value: z.number(),
      weight: z.number(),
    })
  ),
});

async function claudeEstimate(
  subject: ParcelSummary,
  candidates: CompCandidate[],
  conditionContext?: string
): Promise<Omit<CompResult, "subject" | "method"> | null> {
  const usable = candidates.filter((c) => c.sale_price && c.sale_price > 10000);
  if (!usable.length) return null;

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system:
      "You are a residential/commercial real-estate valuation analyst preparing a sales-comparison estimate of fair market value for an Allegheny County (PA) property tax assessment appeal. Select the strongest comparables, apply standard dollar adjustments (sale date/market conditions, living area, baths, condition, grade, lot), and be conservative: this estimate must be defensible before the Board of Property Assessment Appeals and Review.",
    tools: [
      {
        name: "submit_valuation",
        description: "Submit the final sales-comparison valuation.",
        input_schema: {
          type: "object" as const,
          properties: {
            estimated_fmv: {
              type: "number",
              description: "Concluded fair market value, USD",
            },
            narrative: {
              type: "string",
              description:
                "2-4 sentence explanation of comp selection and adjustments, suitable for an appeal letter.",
            },
            comps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  parid: { type: "string" },
                  adjustments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        reason: { type: "string" },
                        amount: { type: "number" },
                      },
                      required: ["reason", "amount"],
                    },
                  },
                  adjusted_value: { type: "number" },
                  weight: { type: "number", description: "0-1 relative weight" },
                },
                required: ["parid", "adjustments", "adjusted_value", "weight"],
              },
            },
          },
          required: ["estimated_fmv", "narrative", "comps"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_valuation" },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          subject,
          condition_findings: conditionContext ?? null,
          comparable_sales: usable.slice(0, 12),
        }),
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;
  const parsed = claudeCompSchema.safeParse(toolUse.input);
  if (!parsed.success) return null;

  const byParid = new Map(usable.map((c) => [c.parid, c]));
  const comps: AdjustedComp[] = parsed.data.comps
    .filter((c) => byParid.has(c.parid))
    .map((c) => {
      const src = byParid.get(c.parid)!;
      return {
        parid: c.parid,
        address: src.full_address,
        sale_date: src.sale_date,
        sale_price: src.sale_price!,
        adjustments: c.adjustments,
        adjusted_value: Math.round(c.adjusted_value),
        weight: c.weight,
      };
    });
  if (!comps.length) return null;

  return {
    estimated_fmv: Math.round(parsed.data.estimated_fmv),
    comps,
    narrative: parsed.data.narrative,
    condition_context: conditionContext,
  };
}

/**
 * The AI Comp Engine: retrieves candidates via SQL + pgvector, then has
 * Claude select/adjust comps and conclude an FMV. Falls back to a
 * deterministic sales-comparison heuristic when Claude is unavailable.
 */
export async function estimateFmv(
  parid: string,
  options: { conditionContext?: string } = {}
): Promise<CompResult | null> {
  const subject = await getParcel(parid);
  if (!subject) return null;

  const candidates = await getCompCandidates(parid, 20);

  if (isAnthropicConfigured()) {
    try {
      const result = await claudeEstimate(
        subject,
        candidates,
        options.conditionContext
      );
      if (result) return { subject, method: "claude", ...result };
    } catch (err) {
      console.error("Claude comp estimate failed; using heuristic", err);
    }
  }

  return { subject, method: "heuristic", ...heuristicEstimate(subject, candidates) };
}
