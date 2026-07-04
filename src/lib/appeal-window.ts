/**
 * Allegheny County annual appeal window: appeals for tax year Y are filed
 * roughly July 1 - September 1 of year Y-1 (per County Ordinance 06-24-OR the
 * deadline has been September 1/2 in recent cycles).
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
