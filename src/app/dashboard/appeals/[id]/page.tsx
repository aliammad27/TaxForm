import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeSavingsScore } from "@/lib/savings";
import { getOrCreatePrediction } from "@/lib/adjudication";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/appeal-status";
import { updateAppealStatus } from "../actions";
import { LetterButton } from "./letter-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function AppealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireClient();
  const { id } = await params;
  const supabase = await createClient();

  const { data: appeal } = await supabase
    .from("appeals")
    .select(
      "id, client_id, parid, tax_year, status, target_value, filing_deadline, filed_date, hearing_date, decided_date, outcome_total, notes, parcels(full_address, muni_desc, class_desc, county_total)"
    )
    .eq("id", id)
    .single();
  if (!appeal) notFound();

  const parcel = appeal.parcels as unknown as {
    full_address: string | null;
    muni_desc: string | null;
    class_desc: string | null;
    county_total: number | null;
  } | null;

  const [score, prediction, { data: documents }] = await Promise.all([
    computeSavingsScore(appeal.parid).catch(() => null),
    getOrCreatePrediction(appeal.id).catch(() => null),
    supabase
      .from("documents")
      .select("id, type, original_name, processing_status, created_at")
      .eq("appeal_id", appeal.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/appeals"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Appeals
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {parcel?.full_address ?? appeal.parid}
            </h1>
            <p className="text-sm text-muted-foreground">
              {parcel?.muni_desc} · Tax year {appeal.tax_year} · Parcel {appeal.parid}
            </p>
          </div>
          <Badge>{STATUS_LABELS[appeal.status] ?? appeal.status}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Case value</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {score ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current assessment</span>
                  <span className="font-medium">{usd(score.current_assessed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated market value</span>
                  <span className="font-medium">{usd(score.estimated_fmv)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Target assessed value (CLR {(score.clr * 100).toFixed(2)}%)
                  </span>
                  <span className="font-medium">{usd(score.implied_assessed)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Estimated annual savings</span>
                  <span className="font-bold">
                    {usd(score.estimated_annual_savings)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                No valuation available for this parcel yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome prediction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {prediction ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Probability of a reduction
                  </span>
                  <span className="font-bold">
                    {(prediction.probability_reduction * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Expected assessment reduction
                  </span>
                  <span className="font-medium">
                    {(prediction.expected_reduction_pct * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  Modeled on {prediction.training_note ?? "historical BPAAR dispositions"}.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Prediction unavailable — train the adjudication model first
                (npm run train:adjudication).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appeal letter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generates a written submission grounded in your comparable sales,
            the CLR calculation, and any uploaded condition photos.
          </p>
          <LetterButton appealId={appeal.id} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status &amp; dates</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateAppealStatus} className="space-y-3">
              <input type="hidden" name="id" value={appeal.id} />
              <div className="space-y-1">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={appeal.status}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="hearing_date">Hearing date</Label>
                <Input
                  id="hearing_date"
                  name="hearing_date"
                  type="date"
                  defaultValue={appeal.hearing_date ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="outcome_total">Decided value (if decided)</Label>
                <Input
                  id="outcome_total"
                  name="outcome_total"
                  type="number"
                  defaultValue={appeal.outcome_total ?? ""}
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                Update
              </Button>
            </form>
            <dl className="mt-4 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <dt>Filing deadline</dt>
                <dd>{appeal.filing_deadline ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Filed</dt>
                <dd>{appeal.filed_date ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Decided</dt>
                <dd>{appeal.decided_date ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {!documents?.length ? (
              <p className="text-sm text-muted-foreground">
                No documents yet. Upload rent rolls, T-12s, or condition photos
                from the{" "}
                <Link href="/dashboard/documents" className="underline">
                  documents page
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span>{d.original_name ?? d.type}</span>
                    <Badge variant="secondary">{d.processing_status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
