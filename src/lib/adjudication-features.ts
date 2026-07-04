/**
 * Shared feature definition for the Predictive Adjudication Model.
 * Used by both the offline training script and request-time scoring so the
 * feature vectors are guaranteed to match.
 */

export type AdjudicationInputs = {
  /** Assessment gap ratio: (current assessed - CLR-implied assessed) / current assessed. */
  gapRatio: number;
  isResidential: boolean;
  isCommercial: boolean;
  /** CLR for the appeal's tax year (e.g. 0.5014). */
  clr: number;
  /** Whether the owner (vs a taxing body) is the complainant. */
  ownerFiled: boolean;
  /** Pre-appeal total assessed value, dollars. */
  preAppealTotal: number;
};

export const FEATURE_NAMES = [
  "intercept",
  "gap_ratio",
  "is_residential",
  "is_commercial",
  "clr",
  "owner_filed",
  "log_pre_total",
] as const;

export function featureVector(x: AdjudicationInputs): number[] {
  return [
    1,
    Math.max(-1, Math.min(1, x.gapRatio)),
    x.isResidential ? 1 : 0,
    x.isCommercial ? 1 : 0,
    x.clr,
    x.ownerFiled ? 1 : 0,
    Math.log10(Math.max(x.preAppealTotal, 1000)) / 7,
  ];
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export type ModelCoefficients = {
  /** Logistic regression weights for P(reduction). */
  logistic: number[];
  /** Linear regression weights for expected reduction % (given reduction). */
  linear: number[];
  feature_names: string[];
};
