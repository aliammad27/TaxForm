import { getPool } from "./db";
import { clrMath } from "./clr";
import { getCountyAdapter } from "./counties/registry";
import { estimateFmv, type CompResult } from "./comp-engine";

/**
 * Both valuation approaches considered for a parcel. For commercial parcels
 * with a processed T-12, the income approach competes with the sales
 * comparison and the lower (most favorable to the owner) wins.
 */
export type ValuationApproaches = {
  comp_fmv: number;
  income_fmv: number | null;
  cap_rate: number | null;
  noi: number | null;
  selected: "comp" | "income";
};

export type MillageUsed = {
  mills: number;
  source: "actual" | "default_estimate";
};

/**
 * Where the success probability comes from: the county's own appeal history
 * or the general statewide estimate (counties without outcome data yet).
 */
export type ProbabilityBasis = "county_history" | "general_estimate";

export type SavingsScore = {
  parid: string;
  tax_year: number;
  county: string;
  estimated_fmv: number;
  implied_assessed: number;
  current_assessed: number;
  assessment_reduction: number;
  estimated_annual_savings: number;
  probability: number;
  clr: number;
  comp_result: CompResult;
  valuation?: ValuationApproaches;
  millage?: MillageUsed;
  probability_basis?: ProbabilityBasis;
  cached: boolean;
};

/**
 * Latest income-approach indication from a processed T-12 for this parcel
 * (NOI / cap rate, attached during document processing).
 */
async function latestIncomeApproach(parid: string): Promise<{
  indicated_value: number;
  cap_rate: number | null;
  noi: number | null;
} | null> {
  const { rows } = await getPool().query<{
    indicated_value: number | null;
    cap_rate: number | null;
    noi: number | null;
  }>(
    `select (extracted_json->'income_approach'->>'indicated_value')::float8 as indicated_value,
            (extracted_json->'income_approach'->>'cap_rate')::float8 as cap_rate,
            (extracted_json->>'net_operating_income')::float8 as noi
     from documents
     where parid = $1
       and type = 't12'
       and processing_status = 'processed'
       and extracted_json->'income_approach'->>'indicated_value' is not null
     order by updated_at desc
     limit 1`,
    [parid]
  );
  const row = rows[0];
  if (!row?.indicated_value || row.indicated_value <= 0) return null;
  return {
    indicated_value: row.indicated_value,
    cap_rate: row.cap_rate,
    noi: row.noi,
  };
}

function isCommercialParcel(subject: CompResult["subject"]): boolean {
  const text = `${subject.class_desc ?? ""} ${subject.use_desc ?? ""}`.toUpperCase();
  return text.includes("COMMERCIAL") || subject.class === "C";
}

/**
 * Historical owner-appeal success rate for a property class: the share of
 * owner-filed BPAAR appeals that ended with a lower total value.
 */
async function ownerSuccessRate(
  classGroup: string | null,
  county: string
): Promise<{ rate: number; basis: ProbabilityBasis }> {
  const { rows } = await getPool().query<{ total: string; wins: string }>(
    `select count(*) as total,
            count(*) filter (where post_appeal_total < pre_appeal_total) as wins
     from appeal_outcomes
     where county = $2
       and complainant ilike '%owner%'
       and post_appeal_total is not null
       and pre_appeal_total is not null
       and ($1::text is null or class ilike $1)`,
    [classGroup, county]
  );
  const total = Number(rows[0]?.total ?? 0);
  if (total < 50) return { rate: 0.5, basis: "general_estimate" };
  return { rate: Number(rows[0].wins) / total, basis: "county_history" };
}

function gapProbability(gapRatio: number): number {
  // Logistic curve: no gap -> ~0.15, 30% over-assessment -> ~0.8.
  return 1 / (1 + Math.exp(-(-1.7 + 10 * gapRatio)));
}

export async function computeSavingsScore(
  parid: string,
  options: { refresh?: boolean; conditionContext?: string } = {}
): Promise<SavingsScore | null> {
  const pool = getPool();

  const { rows: countyRows } = await pool.query<{ county: string }>(
    `select county from parcels where parid = $1`,
    [parid]
  );
  if (!countyRows[0]) return null;
  const county = countyRows[0].county;
  const adapter = getCountyAdapter(county);
  const clr = await adapter.clr();

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
      const inputs = rows[0].inputs as CompResult & {
        valuation?: ValuationApproaches;
        millage?: MillageUsed;
        probability_basis?: ProbabilityBasis;
      };
      return {
        parid,
        tax_year: clr.tax_year,
        county,
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
        comp_result: inputs,
        valuation: inputs.valuation,
        millage: inputs.millage,
        probability_basis: inputs.probability_basis,
        cached: true,
      };
    }
  }

  const compResult = await estimateFmv(parid, {
    conditionContext: options.conditionContext,
  });
  if (!compResult || !compResult.estimated_fmv) return null;

  // Commercial parcels: compute both the sales-comparison and income-approach
  // FMVs and use whichever is lower (most favorable to the owner).
  const income = isCommercialParcel(compResult.subject)
    ? await latestIncomeApproach(parid)
    : null;
  const valuation: ValuationApproaches = {
    comp_fmv: compResult.estimated_fmv,
    income_fmv: income?.indicated_value ?? null,
    cap_rate: income?.cap_rate ?? null,
    noi: income?.noi ?? null,
    selected:
      income && income.indicated_value < compResult.estimated_fmv
        ? "income"
        : "comp",
  };
  const estimatedFmv =
    valuation.selected === "income" && valuation.income_fmv
      ? valuation.income_fmv
      : compResult.estimated_fmv;

  // Parcel-specific millage when entered for this county; otherwise clrMath
  // falls back to the labeled-estimate 25-mill default.
  const actualMillage = await adapter.millageTable({
    municipality: compResult.subject.muni_desc,
    schoolDistrict: compResult.subject.school_desc,
    taxYear: clr.tax_year,
  });
  const millage: MillageUsed = actualMillage
    ? { mills: actualMillage, source: "actual" }
    : { mills: 25, source: "default_estimate" };

  const currentAssessed = compResult.subject.county_total ?? 0;
  const { impliedAssessed, assessmentReduction, estimatedAnnualSavings } =
    clrMath({
      estimatedFmv,
      currentAssessed,
      ratio: clr.ratio,
      millage: millage.mills,
    });

  const gapRatio =
    currentAssessed > 0 ? assessmentReduction / currentAssessed : 0;
  const successRate = await ownerSuccessRate(
    compResult.subject.class_desc ?? compResult.subject.class,
    county
  );
  const probability =
    assessmentReduction <= 0
      ? 0.05
      : Math.min(0.95, 0.6 * gapProbability(gapRatio) + 0.4 * successRate.rate);

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
      estimatedFmv,
      impliedAssessed,
      currentAssessed,
      estimatedAnnualSavings,
      probability,
      JSON.stringify({
        ...compResult,
        valuation,
        millage,
        probability_basis: successRate.basis,
      }),
    ]
  );

  return {
    parid,
    tax_year: clr.tax_year,
    county,
    estimated_fmv: estimatedFmv,
    implied_assessed: impliedAssessed,
    current_assessed: currentAssessed,
    assessment_reduction: assessmentReduction,
    estimated_annual_savings: estimatedAnnualSavings,
    probability,
    clr: clr.ratio,
    comp_result: compResult,
    valuation,
    millage,
    probability_basis: successRate.basis,
    cached: false,
  };
}
