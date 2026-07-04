import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadForm } from "./upload-form";
import { ProcessButton } from "./process-button";
import { rentRollSchema, t12Schema } from "@/lib/extraction";
import { conditionAnalysisSchema } from "@/lib/vision";

const TYPE_LABELS: Record<string, string> = {
  rent_roll: "Rent roll",
  t12: "T-12",
  photo: "Photo",
  appeal_letter: "Appeal letter",
  other: "Other",
};

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

function extractedSummary(type: string, extracted: unknown): string | null {
  if (!extracted) return null;
  if (type === "rent_roll") {
    const parsed = rentRollSchema.safeParse(extracted);
    if (parsed.success) {
      const t = parsed.data.totals;
      return `${t.unit_count} units, ${(t.occupancy_rate * 100).toFixed(0)}% occupied, ${usd(t.monthly_scheduled_rent)}/mo scheduled rent`;
    }
  }
  if (type === "t12") {
    const parsed = t12Schema.safeParse(extracted);
    if (parsed.success) {
      const income = (extracted as { income_approach?: { cap_rate: number; indicated_value: number } })
        .income_approach;
      return `NOI ${usd(parsed.data.net_operating_income)}${income ? ` — income approach at ${(income.cap_rate * 100).toFixed(1)}% cap: ${usd(income.indicated_value)}` : ""}`;
    }
  }
  if (type === "photo") {
    const parsed = conditionAnalysisSchema.safeParse(extracted);
    if (parsed.success) {
      return `Condition: ${parsed.data.overall_condition.replace("_", " ")} — ${parsed.data.findings.length} finding(s)`;
    }
  }
  return null;
}

type DocRow = {
  id: string;
  type: string;
  parid: string | null;
  original_name: string | null;
  processing_status: string;
  extracted_json: unknown;
  created_at: string;
};

type PropRow = {
  parid: string;
  parcels: { full_address: string | null } | null;
};

export default async function DocumentsPage() {
  await requireClient();
  const supabase = await createClient();

  const [{ data: docsData }, { data: propsData }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, type, parid, original_name, processing_status, extracted_json, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("client_properties").select("parid, parcels(full_address)"),
  ]);
  const docs = (docsData ?? []) as DocRow[];
  const properties = ((propsData ?? []) as unknown as PropRow[]).map((p) => ({
    parid: p.parid,
    address: p.parcels?.full_address ?? null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Documents</h1>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm properties={properties} />
          <p className="mt-3 text-xs text-muted-foreground">
            Rent rolls and T-12s are parsed into structured data for the income
            approach. Photos are analyzed for condition evidence that feeds
            your comps and appeal letter.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your documents</CardTitle>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y">
              {docs.map((d) => {
                const summary = extractedSummary(d.type, d.extracted_json);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {d.original_name ?? TYPE_LABELS[d.type]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {TYPE_LABELS[d.type]}
                        {summary && <> · {summary}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge
                        variant={
                          d.processing_status === "processed"
                            ? "default"
                            : d.processing_status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {d.processing_status}
                      </Badge>
                      {["rent_roll", "t12", "photo"].includes(d.type) &&
                        d.processing_status !== "processed" && (
                          <ProcessButton documentId={d.id} />
                        )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
