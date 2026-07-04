import { getPool } from "./db";
import { getClr, getLatestClr } from "./clr";
import { computeSavingsScore } from "./savings";
import {
  dot,
  featureVector,
  sigmoid,
  type AdjudicationInputs,
  type ModelCoefficients,
} from "./adjudication-features";

export type Prediction = {
  probability_reduction: number;
  expected_reduction_pct: number;
  model_version_id: string;
  training_note?: string;
};

type ModelRow = {
  id: string;
  version: number;
  coefficients: ModelCoefficients;
  metrics: { n?: number } | null;
};

async function loadLatestModel(): Promise<ModelRow | null> {
  const { rows } = await getPool().query<ModelRow>(
    `select id, version, coefficients, metrics
     from model_versions
     where name = 'adjudication'
     order by version desc
     limit 1`
  );
  return rows[0] ?? null;
}

export function scoreWithModel(
  model: ModelCoefficients,
  inputs: AdjudicationInputs
): { probability: number; expectedReductionPct: number } {
  const x = featureVector(inputs);
  const probability = sigmoid(dot(model.logistic, x));
  const expectedReductionPct = Math.max(0, Math.min(0.9, dot(model.linear, x)));
  return { probability, expectedReductionPct };
}

/**
 * Returns the stored prediction for an appeal, computing and persisting one
 * with the latest model version if none exists yet.
 */
export async function getOrCreatePrediction(
  appealId: string
): Promise<Prediction | null> {
  const pool = getPool();
  const model = await loadLatestModel();
  if (!model) return null;

  const { rows: existing } = await pool.query(
    `select probability_reduction::float8 as probability_reduction,
            expected_reduction_pct::float8 as expected_reduction_pct,
            model_version_id
     from predictions
     where appeal_id = $1 and model_version_id = $2
     order by created_at desc
     limit 1`,
    [appealId, model.id]
  );
  if (existing[0]) {
    return {
      ...existing[0],
      training_note: model.metrics?.n
        ? `${model.metrics.n.toLocaleString()} historical BPAAR dispositions (model v${model.version})`
        : undefined,
    };
  }

  const { rows: appeals } = await pool.query(
    `select a.parid, a.tax_year, p.class_desc, p.fair_market_total::float8 as fmv,
            p.county_total::float8 as county_total
     from appeals a
     join parcels p on p.parid = a.parid
     where a.id = $1`,
    [appealId]
  );
  const appeal = appeals[0];
  if (!appeal) return null;

  const clr = (await getClr(appeal.tax_year)) ?? (await getLatestClr());
  const score = await computeSavingsScore(appeal.parid).catch(() => null);

  const currentAssessed = score?.current_assessed ?? appeal.county_total ?? 0;
  const impliedAssessed =
    score?.implied_assessed ??
    (appeal.fmv != null ? appeal.fmv * clr.ratio : currentAssessed);
  const gapRatio =
    currentAssessed > 0 ? (currentAssessed - impliedAssessed) / currentAssessed : 0;

  const cls = (appeal.class_desc ?? "").toUpperCase();
  const inputs: AdjudicationInputs = {
    gapRatio,
    isResidential: cls.includes("RESIDENTIAL"),
    isCommercial: cls.includes("COMMERCIAL"),
    clr: clr.ratio,
    ownerFiled: true,
    preAppealTotal: currentAssessed,
  };

  const { probability, expectedReductionPct } = scoreWithModel(
    model.coefficients,
    inputs
  );

  await pool.query(
    `insert into predictions
       (appeal_id, model_version_id, probability_reduction, expected_reduction_pct, features)
     values ($1, $2, $3, $4, $5)`,
    [appealId, model.id, probability, expectedReductionPct, JSON.stringify(inputs)]
  );

  return {
    probability_reduction: probability,
    expected_reduction_pct: expectedReductionPct,
    model_version_id: model.id,
    training_note: model.metrics?.n
      ? `${model.metrics.n.toLocaleString()} historical BPAAR dispositions (model v${model.version})`
      : undefined,
  };
}
