/** Shared search error messages for public and dashboard flows. */
export type SearchFailureKind = "database" | "query" | "validation";

export function searchErrorMessage(kind: SearchFailureKind): string {
  switch (kind) {
    case "database":
      return "We're having a technical issue — please try again in a few minutes.";
    case "query":
      return "Search is temporarily unavailable.";
    case "validation":
      return "Enter at least 3 characters.";
  }
}

/**
 * Classifies a parcel search failure for user-facing copy.
 * Logs the underlying error server-side when provided.
 */
export async function classifySearchFailure(
  err: unknown,
  isDatabaseReachable: () => Promise<boolean>
): Promise<SearchFailureKind> {
  console.error("[searchParcels]", err);
  if (!(await isDatabaseReachable())) return "database";
  return "query";
}
