import Link from "next/link";
import { notFound } from "next/navigation";
import { computeSavingsScore } from "@/lib/savings";
import type { ParcelSummary } from "@/lib/parcels";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Savings score" };

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

function probabilityLabel(p: number): { label: string; tone: string; bar: string } {
  if (p >= 0.7)
    return { label: "Strong case", tone: "text-success", bar: "bg-success" };
  if (p >= 0.45)
    return { label: "Worth appealing", tone: "text-warning", bar: "bg-warning" };
  return {
    label: "Weak case",
    tone: "text-muted-foreground",
    bar: "bg-muted-foreground",
  };
}

function isCommercialParcel(subject: ParcelSummary): boolean {
  const text = `${subject.class_desc ?? ""} ${subject.use_desc ?? ""}`.toUpperCase();
  return subject.class === "C" || text.includes("COMMERCIAL");
}

export default async function ScorePage({
  params,
}: {
  params: Promise<{ parid: string }>;
}) {
  const { parid } = await params;
  const score = await computeSavingsScore(parid);
  if (!score) notFound();

  const subject = score.comp_result.subject;
  const commercial = isCommercialParcel(subject);
  const { label, tone, bar } = probabilityLabel(score.probability);
  const hasCase = score.assessment_reduction > 0;
  const signupHref = commercial ? "/signup?path=commercial" : "/signup?path=residential";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-8 py-16">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Savings report · Tax year {score.tax_year} · Parcel {score.parid}
        </p>
        <h1 className="mt-4 font-serif text-[46px] leading-tight tracking-[-0.01em]">
          {subject.full_address}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {subject.muni_desc} · {subject.class_desc ?? subject.class}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          {commercial
            ? "Commercial score: comparable sales are weighted with commercial area adjustments, and a processed T-12 can add an income-approach value."
            : "Residential score: comparable sales are adjusted for homeowner-scale factors like living area, bathrooms, and documented condition."}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Est. annual savings"
            value={hasCase ? usd(score.estimated_annual_savings) : "$0"}
            valueClassName={hasCase ? "text-success" : undefined}
            hint={
              score.millage?.source === "actual"
                ? `Based on your municipality's combined millage of ${score.millage.mills} mills.`
                : "Estimate — assumes ~25 mills combined millage; actual millage varies by municipality."
            }
          />
          <StatCard
            label="Success probability"
            value={`${(score.probability * 100).toFixed(0)}%`}
            hint={
              <span className="space-y-1.5">
                <span className={`block font-medium ${tone}`}>{label}</span>
                <span className="block h-1 w-full overflow-hidden bg-muted">
                  <span
                    className={`block h-full ${bar}`}
                    style={{ width: `${Math.round(score.probability * 100)}%` }}
                  />
                </span>
                <span className="block">
                  {score.probability_basis === "county_history"
                    ? `Based on ${score.county} County's historical appeal decisions.`
                    : "General estimate — local decision data not yet available."}
                </span>
              </span>
            }
          />
          <StatCard
            label="Assessment reduction"
            value={hasCase ? usd(score.assessment_reduction) : "—"}
          />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How the math works</CardTitle>
            <CardDescription>
              Your case is the gap between what the county assesses and what
              its own ratio says it should assess.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {commercial && score.valuation?.income_fmv ? (
              <>
                <div className="flex justify-between gap-4 py-2">
                  <span className="text-muted-foreground">
                    Sales-comparison value (from comparable sales)
                    {score.valuation.selected === "comp" && " — used"}
                  </span>
                  <span className="font-mono">
                    {usd(score.valuation.comp_fmv)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    Income-approach value (NOI &divide; cap rate
                    {score.valuation.cap_rate
                      ? ` of ${(score.valuation.cap_rate * 100).toFixed(1)}%`
                      : ""}
                    ){score.valuation.selected === "income" && " — used"}
                  </span>
                  <span className="font-mono">
                    {usd(score.valuation.income_fmv)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    Estimated fair market value (lower of the two approaches)
                  </span>
                  <span className="font-mono">{usd(score.estimated_fmv)}</span>
                </div>
              </>
            ) : commercial ? (
              <>
                <div className="flex justify-between gap-4 py-2">
                  <span className="text-muted-foreground">
                    Sales-comparison value (from comparable commercial sales)
                  </span>
                  <span className="font-mono">
                    {usd(score.valuation?.comp_fmv ?? score.estimated_fmv)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    Income-approach value (upload a processed T-12 to enable)
                  </span>
                  <span className="font-mono">Pending</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    Estimated fair market value currently used
                  </span>
                  <span className="font-mono">{usd(score.estimated_fmv)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between gap-4 py-2">
                <span className="text-muted-foreground">
                  Estimated fair market value (from comparable residential sales)
                </span>
                <span className="font-mono">{usd(score.estimated_fmv)}</span>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-dashed py-2">
              <span className="text-muted-foreground">
                &times; Common Level Ratio ({(score.clr * 100).toFixed(2)}%)
              </span>
              <span className="font-mono">{usd(score.implied_assessed)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-dashed py-2">
              <span className="text-muted-foreground">
                Your current assessment
              </span>
              <span className="font-mono">{usd(score.current_assessed)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t py-2.5">
              <span className="font-medium">
                {hasCase
                  ? "Over-assessment an appeal can eliminate"
                  : "Your assessment is already at or below the implied value"}
              </span>
              <span
                className={`font-mono font-semibold ${hasCase ? "text-success" : ""}`}
              >
                {hasCase ? usd(score.assessment_reduction) : "$0"}
              </span>
            </div>
            <p className="pt-3 text-xs text-muted-foreground">
              {score.millage?.source === "actual"
                ? `Savings use your municipality's combined county + municipal + school millage of ${score.millage.mills} mills. `
                : "Savings are an estimate: they assume a combined county + municipal + school millage of ~25 mills. Your actual millage varies by municipality and school district. "}
              {score.comp_result.narrative}
            </p>
          </CardContent>
        </Card>

        {score.comp_result.comps.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Comparable sales used</CardTitle>
              <CardDescription>
                Recent arms-length sales near your property, adjusted the way
                appraisers do it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Sale</TableHead>
                    <TableHead className="text-right">Adjusted value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {score.comp_result.comps.map((c) => (
                    <TableRow key={c.parid}>
                      <TableCell className="font-medium">{c.address}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {usd(c.sale_price)} on {c.sale_date}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {usd(c.adjusted_value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {hasCase ? (
          <div className="mt-10 border-t pt-8">
            <h2 className="max-w-xl font-serif text-3xl leading-tight tracking-tight">
              That&apos;s {usd(score.estimated_annual_savings)} a year,{" "}
              <em className="text-primary">every year</em>, until you appeal.
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              {commercial
                ? "Create a commercial account to upload rent rolls and T-12s, track deadlines, and move viable parcels into an appeal workflow."
                : "Create a free account to generate your appeal letter, upload condition photos, track deadlines, and file with the county."}
            </p>
            <Button size="lg" className="mt-5 h-11 px-6" render={<Link href={signupHref} />}>
              {commercial ? "Start commercial review" : "Start my appeal"}
              <span className="font-mono">→</span>
            </Button>
          </div>
        ) : (
          <p className="mt-10 border-t pt-8 text-sm text-muted-foreground">
            Good news — your assessment already looks fair. Check back after
            the next reassessment, or{" "}
            <Link
              href="/score"
              className="text-foreground underline underline-offset-2"
            >
              score another property
            </Link>
            .
          </p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
