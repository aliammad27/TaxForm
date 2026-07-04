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

/**
 * A county is promoted from the pooled heuristic to its own trained model
 * once it accumulates this many usable historical dispositions (Phase 5;
 * the plan's open item settled at the middle of the 200-500 range).
 */
export const LOCAL_MODEL_PROMOTION_THRESHOLD = 300;

export type Prediction = {
  probability_reduction: number;
  expected_reduction_pct: number;
  model_version_id: string | null;
  /** Where the confidence number comes from — always surfaced in the UI. */
  confidence_source: "trained" | "heuristic";
  training_note: string;
};

type ModelRow = {
  id: string;
  version: number;
  coefficients: ModelCoefficients;
  metrics: { n?: number } | null;
};

/** Model name convention: 'adjudication' = Allegheny; 'adjudication:<county>' = local. */
function modelName(county: string): string {
  return county === "Allegheny" ? "adjudication" : `adjudication:${county}`;
}

async function loadModelForCounty(county: string): Promise<ModelRow | null> {
  const { rows } = await getPool().query<ModelRow>(
    `select id, version, coefficients, metrics
     from model_versions
     where name = $1
     order by version desc
     limit 1`,
    [modelName(county)]
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
 * Pooled feature-based heuristic for counties without local decision data:
 * a calibrated logistic on the over-assessment gap, nudged by property class
 * and parcel size. Deliberately conservative — the UI labels it a general
 * estimate.
 */
export function scoreWithPooledHeuristic(inputs: AdjudicationInputs): {
  probability: number;
  expectedReductionPct: number;
} {
  const gap = Math.max(-1, Math.min(1, inputs.gapRatio));
  // No gap -> ~0.15; 30% over-assessment -> ~0.75.
  let z = -1.7 + 9 * gap;
  // Larger parcels bring stronger evidence (appraisals, counsel) in practice.
  z += 0.3 * (Math.log10(Math.max(inputs.preAppealTotal, 1000)) / 7 - 0.7);
  const probability = Math.max(0.05, Math.min(0.9, sigmoid(z)));
  // Boards rarely grant the full ask; expect roughly 70% of the gap.
  const expectedReductionPct =
    gap > 0 ? Math.min(0.5, Number((0.7 * gap).toFixed(4))) : 0;
  return { probability, expectedReductionPct };
}

function trainedNote(model: ModelRow, county: string): string {
  const n = model.metrics?.n;
  const base = county === "Allegheny" ? "BPAAR" : `${county} County board`;
  return n
    ? `${n.toLocaleString()} historical ${base} dispositions (model v${model.version})`
    : `historical ${base} dispositions (model v${model.version})`;
}

const HEURISTIC_NOTE =
  "a general statewide estimate — local decision data for this county is not yet available";

/**
 * Returns the stored prediction for an appeal, computing and persisting one
 * if none exists yet. Counties with a trained model (Allegheny's ~40k
 * dispositions, or a local model once promoted) use it; all others fall back
 * to the pooled heuristic, and the confidence source says which.
 */
export async function getOrCreatePrediction(
  appealId: string
): Promise<Prediction | null> {
  const pool = getPool();

  const { rows: appeals } = await pool.query(
    `select a.parid, a.tax_year, p.county, p.class_desc,
            p.fair_market_total::float8 as fmv,
            p.county_total::float8 as county_total
     from appeals a
     join parcels p on p.parid = a.parid
     where a.id = $1`,
    [appealId]
  );
  const appeal = appeals[0];
  if (!appeal) return null;

  const model = await loadModelForCounty(appeal.county);

  const { rows: existing } = await pool.query(
    `select probability_reduction::float8 as probability_reduction,
            expected_reduction_pct::float8 as expected_reduction_pct,
            model_version_id
     from predictions
     where appeal_id = $1 and model_version_id is not distinct from $2
     order by created_at desc
     limit 1`,
    [appealId, model?.id ?? null]
  );
  if (existing[0]) {
    return {
      ...existing[0],
      confidence_source: model ? "trained" : "heuristic",
      training_note: model ? trainedNote(model, appeal.county) : HEURISTIC_NOTE,
    };
  }

  const clr =
    (await getClr(appeal.tax_year, appeal.county)) ??
    (await getLatestClr(appeal.county));
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

  const { probability, expectedReductionPct } = model
    ? scoreWithModel(model.coefficients, inputs)
    : scoreWithPooledHeuristic(inputs);

  await pool.query(
    `insert into predictions
       (appeal_id, model_version_id, probability_reduction, expected_reduction_pct, features)
     values ($1, $2, $3, $4, $5)`,
    [
      appealId,
      model?.id ?? null,
      probability,
      expectedReductionPct,
      JSON.stringify({ ...inputs, confidence_source: model ? "trained" : "heuristic" }),
    ]
  );

  return {
    probability_reduction: probability,
    expected_reduction_pct: expectedReductionPct,
    model_version_id: model?.id ?? null,
    confidence_source: model ? "trained" : "heuristic",
    training_note: model ? trainedNote(model, appeal.county) : HEURISTIC_NOTE,
  };
}
