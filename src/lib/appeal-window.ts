/**
 * Allegheny County annual appeal window: appeals for tax year Y are filed
 * July 1 - September 1 of year Y-1 (per County Council ordinance 13056-24).
 *
 * Verified July 2026 against the county's own pages
 * (alleghenycounty.us > Property Assessments and Real Estate > Appeals):
 * tax year 2027 appeals are accepted July 1, 2026 - September 1, 2026; the
 * tax year 2026 deadline was September 2, 2025 (the deadline slips a day
 * when September 1 falls on Labor Day). Exact per-year dates live in the
 * appeal_windows table; this function is the Allegheny fallback rule.
 */
export function nextAppealWindow(today = new Date()): {
  taxYear: number;
  filingDeadline: string; // ISO date
  windowOpen: boolean;
} {
  const year = today.getFullYear();
  const deadline = new Date(Date.UTC(year, 8, 1)); // Sept 1
  const open = new Date(Date.UTC(year, 6, 1)); // Jul 1

  if (today <= deadline) {
    return {
      taxYear: year + 1,
      filingDeadline: deadline.toISOString().slice(0, 10),
      windowOpen: today >= open,
    };
  }
  return {
    taxYear: year + 2,
    filingDeadline: new Date(Date.UTC(year + 1, 8, 1)).toISOString().slice(0, 10),
    windowOpen: false,
  };
}
