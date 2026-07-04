import Link from "next/link";
import { notFound } from "next/navigation";
import { computeSavingsScore } from "@/lib/savings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Savings score" };

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

function probabilityLabel(p: number): { label: string; tone: string } {
  if (p >= 0.7) return { label: "Strong case", tone: "text-green-700" };
  if (p >= 0.45) return { label: "Worth appealing", tone: "text-amber-700" };
  return { label: "Weak case", tone: "text-muted-foreground" };
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
  const { label, tone } = probabilityLabel(score.probability);
  const hasCase = score.assessment_reduction > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        &larr; TaxForm
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{subject.full_address}</h1>
          <p className="text-sm text-muted-foreground">
            {subject.muni_desc} · {subject.class_desc ?? subject.class} · Parcel{" "}
            {score.parid}
          </p>
        </div>
        <Badge variant="secondary">Tax year {score.tax_year}</Badge>
      </div>

      <Card className="mt-6">
        <CardContent className="grid gap-6 pt-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Estimated annual savings</p>
            <p className="text-3xl font-bold">
              {hasCase ? usd(score.estimated_annual_savings) : "$0"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Success probability</p>
            <p className="text-3xl font-bold">
              {(score.probability * 100).toFixed(0)}%
            </p>
            <p className={`text-sm font-medium ${tone}`}>{label}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Assessment reduction</p>
            <p className="text-3xl font-bold">
              {hasCase ? usd(score.assessment_reduction) : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>How the math works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Estimated fair market value (from comparable sales)
            </span>
            <span className="font-medium">{usd(score.estimated_fmv)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              &times; Common Level Ratio ({(score.clr * 100).toFixed(2)}%)
            </span>
            <span className="font-medium">{usd(score.implied_assessed)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your current assessment</span>
            <span className="font-medium">{usd(score.current_assessed)}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">
              {hasCase
                ? "Over-assessment an appeal can eliminate"
                : "Your assessment is already at or below the implied value"}
            </span>
            <span className="font-bold">
              {hasCase ? usd(score.assessment_reduction) : "$0"}
            </span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Savings assume a combined millage of ~25 mills. {score.comp_result.narrative}
          </p>
        </CardContent>
      </Card>

      {score.comp_result.comps.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Comparable sales used</CardTitle>
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
                    <TableCell className="text-right">{usd(c.adjusted_value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {hasCase && (
        <Card className="mt-6 border-primary">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <h2 className="text-xl font-bold">
              Ready to claim {usd(score.estimated_annual_savings)}/year?
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Create a free account to generate your appeal letter, track
              deadlines, and file with the county.
            </p>
            <Button size="lg" render={<Link href="/signup" />}>
              Start my appeal
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
