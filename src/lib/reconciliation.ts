import type { RentRoll, T12 } from "./extraction";

export type ReconciliationIssue = {
  field: string;
  expected: number | string;
  found: number | string;
  message: string;
};

export type ReconciliationResult = {
  ok: boolean;
  issues: ReconciliationIssue[];
};

const TOLERANCE = 0.02;

function withinPctTolerance(actual: number, expected: number, tolerance = TOLERANCE): boolean {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

/** Sanity-checks a rent roll: unit sums vs stated totals. */
export function reconcileRentRoll(rr: RentRoll): ReconciliationResult {
  const issues: ReconciliationIssue[] = [];

  const rentSum = rr.units.reduce((sum, u) => sum + (u.monthly_rent ?? 0), 0);
  if (!withinPctTolerance(rentSum, rr.totals.monthly_scheduled_rent)) {
    issues.push({
      field: "monthly_scheduled_rent",
      expected: rr.totals.monthly_scheduled_rent,
      found: rentSum,
      message: `Sum of unit rents ($${Math.round(rentSum).toLocaleString()}) differs from stated total ($${Math.round(rr.totals.monthly_scheduled_rent).toLocaleString()}) by more than 2%`,
    });
  }

  if (rr.units.length !== rr.totals.unit_count) {
    issues.push({
      field: "unit_count",
      expected: rr.totals.unit_count,
      found: rr.units.length,
      message: `Unit row count (${rr.units.length}) does not match stated unit count (${rr.totals.unit_count})`,
    });
  }

  const occupiedCount = rr.units.filter((u) => u.occupied).length;
  if (occupiedCount !== rr.totals.occupied_count) {
    issues.push({
      field: "occupied_count",
      expected: rr.totals.occupied_count,
      found: occupiedCount,
      message: `Occupied unit count (${occupiedCount}) does not match stated occupied count (${rr.totals.occupied_count})`,
    });
  }

  if (rr.units.length > 0 && rr.units.length < rr.totals.unit_count * 0.5) {
    issues.push({
      field: "truncation",
      expected: rr.totals.unit_count,
      found: rr.units.length,
      message: `Only ${rr.units.length} unit rows extracted but totals claim ${rr.totals.unit_count} — possible missing pages`,
    });
  }

  return { ok: issues.length === 0, issues };
}

/** Sanity-checks a T-12: income − expenses vs stated NOI. */
export function reconcileT12(t12: T12): ReconciliationResult {
  const issues: ReconciliationIssue[] = [];

  const income = t12.income;
  const expenses = t12.expenses;

  const computedEgi =
    (income.gross_potential_rent ?? 0) +
    (income.other_income ?? 0) -
    Math.abs(income.vacancy_loss ?? 0);
  if (!withinPctTolerance(computedEgi, income.effective_gross_income)) {
    issues.push({
      field: "effective_gross_income",
      expected: income.effective_gross_income,
      found: computedEgi,
      message: `Computed effective gross income ($${Math.round(computedEgi).toLocaleString()}) differs from stated ($${Math.round(income.effective_gross_income).toLocaleString()})`,
    });
  }

  const expenseSum =
    (expenses.taxes ?? 0) +
    (expenses.insurance ?? 0) +
    (expenses.utilities ?? 0) +
    (expenses.repairs_maintenance ?? 0) +
    (expenses.management ?? 0) +
    (expenses.other ?? 0);
  if (!withinPctTolerance(expenseSum, expenses.total_operating_expenses)) {
    issues.push({
      field: "total_operating_expenses",
      expected: expenses.total_operating_expenses,
      found: expenseSum,
      message: `Sum of expense line items ($${Math.round(expenseSum).toLocaleString()}) differs from stated total ($${Math.round(expenses.total_operating_expenses).toLocaleString()})`,
    });
  }

  const computedNoi = income.effective_gross_income - expenses.total_operating_expenses;
  if (!withinPctTolerance(computedNoi, t12.net_operating_income)) {
    issues.push({
      field: "net_operating_income",
      expected: t12.net_operating_income,
      found: computedNoi,
      message: `Income minus expenses ($${Math.round(computedNoi).toLocaleString()}) differs from stated NOI ($${Math.round(t12.net_operating_income).toLocaleString()})`,
    });
  }

  if (t12.net_operating_income < 0 && income.effective_gross_income > 0) {
    issues.push({
      field: "negative_noi",
      expected: "positive or zero",
      found: t12.net_operating_income,
      message: "Negative NOI with positive income — verify extraction",
    });
  }

  const lineItemCount =
    [
      income.gross_potential_rent,
      income.vacancy_loss,
      income.other_income,
      expenses.taxes,
      expenses.insurance,
      expenses.utilities,
      expenses.repairs_maintenance,
      expenses.management,
      expenses.other,
    ].filter((v) => v != null).length;

  if (lineItemCount < 3 && t12.net_operating_income > 100_000) {
    issues.push({
      field: "truncation",
      expected: "more line items",
      found: lineItemCount,
      message: `Only ${lineItemCount} line items extracted for a large NOI — possible missing pages`,
    });
  }

  return { ok: issues.length === 0, issues };
}

/** Runs reconciliation for rent rolls and T-12s; photos pass through. */
export function reconcileExtracted(
  type: "rent_roll" | "t12",
  data: RentRoll | T12
): ReconciliationResult {
  if (type === "rent_roll") return reconcileRentRoll(data as RentRoll);
  return reconcileT12(data as T12);
}
