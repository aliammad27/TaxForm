/**
 * Trains the Predictive Adjudication Model on historical BPAAR dispositions
 * (`appeal_outcomes`) and stores coefficients in `model_versions`.
 *
 * Two components:
 *   - logistic regression: P(assessment reduced) for owner-filed appeals
 *   - linear regression: expected reduction % given a reduction
 *
 * Features use the county's stated fair market value as the historical proxy
 * for the over-assessment gap (at request time the Comp Engine's FMV is used).
 *
 *   npm run train:adjudication
 */
import { getPool } from "../ingest/lib";
import {
  FEATURE_NAMES,
  dot,
  featureVector,
  sigmoid,
  type AdjudicationInputs,
} from "../../src/lib/adjudication-features";

type TrainingRow = {
  pre_total: number;
  post_total: number;
  class: string | null;
  complainant: string | null;
  clr: number | null;
  fmv: number | null;
};

function toInputs(r: TrainingRow): AdjudicationInputs | null {
  if (!r.pre_total || r.pre_total <= 0) return null;
  const clr = r.clr ?? 0.55;
  const impliedAssessed = r.fmv != null ? r.fmv * clr : null;
  const gapRatio =
    impliedAssessed != null ? (r.pre_total - impliedAssessed) / r.pre_total : 0;
  const cls = (r.class ?? "").toUpperCase();
  return {
    gapRatio,
    isResidential: cls.includes("RESIDENTIAL"),
    isCommercial: cls.includes("COMMERCIAL"),
    clr,
    ownerFiled: (r.complainant ?? "").toLowerCase().includes("owner"),
    preAppealTotal: r.pre_total,
  };
}

function trainLogistic(X: number[][], y: number[], epochs = 300, lr = 0.5): number[] {
  const n = X.length;
  const d = X[0].length;
  const w = new Array(d).fill(0);
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      const err = sigmoid(dot(w, X[i])) - y[i];
      for (let j = 0; j < d; j++) grad[j] += err * X[i][j];
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * grad[j]) / n;
  }
  return w;
}

function trainLinear(X: number[][], y: number[], epochs = 500, lr = 0.3): number[] {
  const n = X.length;
  const d = X[0].length;
  const w = new Array(d).fill(0);
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      const err = dot(w, X[i]) - y[i];
      for (let j = 0; j < d; j++) grad[j] += err * X[i][j];
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * grad[j]) / n;
  }
  return w;
}

async function main() {
  const pool = getPool();

  const { rows } = await pool.query<TrainingRow>(
    `select
       ao.pre_appeal_total::float8 as pre_total,
       ao.post_appeal_total::float8 as post_total,
       ao.class,
       ao.complainant,
       clr.ratio::float8 as clr,
       p.fair_market_total::float8 as fmv
     from appeal_outcomes ao
     left join common_level_ratio clr on clr.tax_year = ao.tax_year
     left join parcels p on p.parid = ao.parid
     where ao.pre_appeal_total is not null
       and ao.post_appeal_total is not null
       and ao.pre_appeal_total > 0`
  );

  const X: number[][] = [];
  const yReduced: number[] = [];
  const reductionRows: { x: number[]; pct: number }[] = [];

  for (const r of rows) {
    const inputs = toInputs(r);
    if (!inputs) continue;
    const x = featureVector(inputs);
    const reduced = r.post_total < r.pre_total ? 1 : 0;
    X.push(x);
    yReduced.push(reduced);
    if (reduced) {
      reductionRows.push({ x, pct: (r.pre_total - r.post_total) / r.pre_total });
    }
  }

  if (X.length < 200) {
    throw new Error(
      `Only ${X.length} usable training rows - ingest more appeal outcomes first (npm run ingest:appeals).`
    );
  }

  console.log(`training on ${X.length} dispositions (${reductionRows.length} reductions)`);

  const logistic = trainLogistic(X, yReduced);
  const linear = trainLinear(
    reductionRows.map((r) => r.x),
    reductionRows.map((r) => r.pct)
  );

  // In-sample metrics.
  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const p = sigmoid(dot(logistic, X[i]));
    if ((p >= 0.5 ? 1 : 0) === yReduced[i]) correct++;
  }
  const accuracy = correct / X.length;
  const baseRate = yReduced.reduce((s, v) => s + v, 0) / yReduced.length;

  let sse = 0;
  for (const r of reductionRows) {
    const err = dot(linear, r.x) - r.pct;
    sse += err * err;
  }
  const rmse = Math.sqrt(sse / Math.max(reductionRows.length, 1));

  const metrics = {
    n: X.length,
    n_reductions: reductionRows.length,
    base_rate: Number(baseRate.toFixed(4)),
    accuracy: Number(accuracy.toFixed(4)),
    reduction_pct_rmse: Number(rmse.toFixed(4)),
  };
  console.log(metrics);

  const { rows: versions } = await pool.query(
    `select coalesce(max(version), 0) + 1 as next from model_versions where name = 'adjudication'`
  );
  const version = Number(versions[0].next);

  await pool.query(
    `insert into model_versions (name, version, coefficients, metrics)
     values ('adjudication', $1, $2, $3)`,
    [
      version,
      JSON.stringify({ logistic, linear, feature_names: FEATURE_NAMES }),
      JSON.stringify(metrics),
    ]
  );

  console.log(`stored model_versions('adjudication', v${version})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
