export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready_to_file: "Ready to file",
  filed: "Filed",
  hearing_scheduled: "Hearing scheduled",
  decided: "Decided",
  withdrawn: "Withdrawn",
};

export const STATUS_ORDER = [
  "draft",
  "ready_to_file",
  "filed",
  "hearing_scheduled",
  "decided",
  "withdrawn",
] as const;

export type AppealStatus = (typeof STATUS_ORDER)[number];
