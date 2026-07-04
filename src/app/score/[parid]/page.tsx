import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CircleDollarSign,
  Gauge,
  TrendingDown,
} from "lucide-react";
import { computeSavingsScore } from "@/lib/savings";
import { Badge } from "@/components/ui/badge";
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

function probabilityLabel(p: number): {
  label: string;
  tone: string;
  bar: string;
} {
  if (p >= 0.7)
    return { label: "Strong case", tone: "text-success", bar: "bg-success" };
  if (p >= 0.45)
    return {
      label: "Worth appealing",
      tone: "text-warning",
      bar: "bg-warning",
    };
  return {
    label: "Weak case",
    tone: "text-muted-foreground",
    bar: "bg-muted-foreground",
  };
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
  const { label, tone, bar } = probabilityLabel(score.probability);
  const hasCase = score.assessment_reduction > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              {subject.full_address}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {subject.muni_desc} · {subject.class_desc ?? subject.class} ·
              Parcel {score.parid}
            </p>
          </div>
          <Badge variant="secondary">Tax year {score.tax_year}</Badge>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Estimated annual savings"
            value={hasCase ? usd(score.estimated_annual_savings) : "$0"}
            icon={CircleDollarSign}
            valueClassName={hasCase ? "text-success" : undefined}
          />
          <StatCard
            label="Success probability"
            value={`${(score.probability * 100).toFixed(0)}%`}
            icon={Gauge}
            hint={
              <span className="space-y-1.5">
                <span className={`block font-medium ${tone}`}>{label}</span>
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${bar}`}
                    style={{ width: `${Math.round(score.probability * 100)}%` }}
                  />
                </span>
              </span>
            }
          />
          <StatCard
            label="Assessment reduction"
            value={hasCase ? usd(score.assessment_reduction) : "—"}
            icon={TrendingDown}
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
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                Estimated fair market value (from comparable sales)
              </span>
              <span className="font-mono font-medium">
                {usd(score.estimated_fmv)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                &times; Common Level Ratio ({(score.clr * 100).toFixed(2)}%)
              </span>
              <span className="font-mono font-medium">
                {usd(score.implied_assessed)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                Your current assessment
              </span>
              <span className="font-mono font-medium">
                {usd(score.current_assessed)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2.5">
              <span className="font-medium">
                {hasCase
                  ? "Over-assessment an appeal can eliminate"
                  : "Your assessment is already at or below the implied value"}
              </span>
              <span
                className={`font-mono font-bold ${hasCase ? "text-success" : ""}`}
              >
                {hasCase ? usd(score.assessment_reduction) : "$0"}
              </span>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Savings assume a combined millage of ~25 mills.{" "}
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
          <div className="relative mt-8 overflow-hidden rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(30rem_15rem_at_50%_120%,--alpha(var(--color-primary-foreground)/12%),transparent)]"
            />
            <div className="relative flex flex-col items-center gap-3">
              <h2 className="font-heading text-2xl font-bold tracking-tight">
                Ready to claim {usd(score.estimated_annual_savings)}/year?
              </h2>
              <p className="max-w-md text-sm text-primary-foreground/80">
                Create a free account to generate your appeal letter, track
                deadlines, and file with the county.
              </p>
              <Button
                size="lg"
                variant="secondary"
                className="mt-2 h-11 px-6"
                render={<Link href="/signup" />}
              >
                Start my appeal
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-8 rounded-lg border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
            Good news — your assessment already looks fair. Check back after
            the next reassessment, or{" "}
            <Link href="/score" className="underline underline-offset-2">
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
