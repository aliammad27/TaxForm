import { getPool } from "./db";
import { getLatestClr, clrMath } from "./clr";
import { estimateFmv, type CompResult } from "./comp-engine";

export type SavingsScore = {
  parid: string;
  tax_year: number;
  estimated_fmv: number;
  implied_assessed: number;
  current_assessed: number;
  assessment_reduction: number;
  estimated_annual_savings: number;
  probability: number;
  clr: number;
  comp_result: CompResult;
  cached: boolean;
};

/**
 * Historical owner-appeal success rate for a property class: the share of
 * owner-filed BPAAR appeals that ended with a lower total value.
 */
async function ownerSuccessRate(classGroup: string | null): Promise<number> {
  const { rows } = await getPool().query<{ total: string; wins: string }>(
    `select count(*) as total,
            count(*) filter (where post_appeal_total < pre_appeal_total) as wins
     from appeal_outcomes
     where complainant ilike '%owner%'
       and post_appeal_total is not null
       and pre_appeal_total is not null
       and ($1::text is null or class ilike $1)`,
    [classGroup]
  );
  const total = Number(rows[0]?.total ?? 0);
  if (total < 50) return 0.5; // insufficient data
  return Number(rows[0].wins) / total;
}

function gapProbability(gapRatio: number): number {
  // Logistic curve: no gap -> ~0.15, 30% over-assessment -> ~0.8.
  return 1 / (1 + Math.exp(-(-1.7 + 10 * gapRatio)));
}

export async function computeSavingsScore(
  parid: string,
  options: { refresh?: boolean; conditionContext?: string } = {}
): Promise<SavingsScore | null> {
  const clr = await getLatestClr();
  const pool = getPool();

  // Condition evidence changes the valuation, so skip the cached score.
  if (options.conditionContext) options.refresh = true;

  if (!options.refresh) {
    const { rows } = await pool.query(
      `select estimated_fmv::float8 as estimated_fmv,
              implied_assessed::float8 as implied_assessed,
              current_assessed::float8 as current_assessed,
              estimated_annual_savings::float8 as estimated_annual_savings,
              probability::float8 as probability,
              inputs
       from savings_scores where parid = $1 and tax_year = $2`,
      [parid, clr.tax_year]
    );
    if (rows[0]) {
      return {
        parid,
        tax_year: clr.tax_year,
        estimated_fmv: rows[0].estimated_fmv,
        implied_assessed: rows[0].implied_assessed,
        current_assessed: rows[0].current_assessed,
        assessment_reduction: Math.max(
          0,
          rows[0].current_assessed - rows[0].implied_assessed
        ),
        estimated_annual_savings: rows[0].estimated_annual_savings,
        probability: rows[0].probability,
        clr: clr.ratio,
        comp_result: rows[0].inputs as CompResult,
        cached: true,
      };
    }
  }

  const compResult = await estimateFmv(parid, {
    conditionContext: options.conditionContext,
  });
  if (!compResult || !compResult.estimated_fmv) return null;

  const currentAssessed = compResult.subject.county_total ?? 0;
  const { impliedAssessed, assessmentReduction, estimatedAnnualSavings } =
    clrMath({
      estimatedFmv: compResult.estimated_fmv,
      currentAssessed,
      ratio: clr.ratio,
    });

  const gapRatio =
    currentAssessed > 0 ? assessmentReduction / currentAssessed : 0;
  const baseRate = await ownerSuccessRate(
    compResult.subject.class_desc ?? compResult.subject.class
  );
  const probability =
    assessmentReduction <= 0
      ? 0.05
      : Math.min(0.95, 0.6 * gapProbability(gapRatio) + 0.4 * baseRate);

  await pool.query(
    `insert into savings_scores
       (parid, tax_year, estimated_fmv, implied_assessed, current_assessed,
        estimated_annual_savings, probability, inputs)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (parid, tax_year) do update set
       estimated_fmv = excluded.estimated_fmv,
       implied_assessed = excluded.implied_assessed,
       current_assessed = excluded.current_assessed,
       estimated_annual_savings = excluded.estimated_annual_savings,
       probability = excluded.probability,
       inputs = excluded.inputs,
       created_at = now()`,
    [
      parid,
      clr.tax_year,
      compResult.estimated_fmv,
      impliedAssessed,
      currentAssessed,
      estimatedAnnualSavings,
      probability,
      JSON.stringify(compResult),
    ]
  );

  return {
    parid,
    tax_year: clr.tax_year,
    estimated_fmv: compResult.estimated_fmv,
    implied_assessed: impliedAssessed,
    current_assessed: currentAssessed,
    assessment_reduction: assessmentReduction,
    estimated_annual_savings: estimatedAnnualSavings,
    probability,
    clr: clr.ratio,
    comp_result: compResult,
    cached: false,
  };
}
