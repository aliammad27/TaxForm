import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { getPortfolio } from "@/lib/portfolio";
import { STATUS_LABELS } from "@/lib/appeal-status";
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

const usd = (n: number | null) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

export default async function PortfolioPage() {
  await requireClient();
  const rows = await getPortfolio();

  const totals = rows.reduce(
    (acc, r) => ({
      assessed: acc.assessed + (r.current_assessed ?? 0),
      fmv: acc.fmv + (r.estimated_fmv ?? 0),
      savings: acc.savings + (r.estimated_annual_savings ?? 0),
      scored: acc.scored + (r.estimated_fmv != null ? 1 : 0),
      appealing: acc.appealing + (r.appeal_status ? 1 : 0),
    }),
    { assessed: 0, fmv: 0, savings: 0, scored: 0, appealing: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio analytics</h1>
        <Button variant="outline" render={<a href="/api/portfolio/export" />}>
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total assessed value
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {usd(totals.assessed)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projected annual savings
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-green-700">
            {usd(totals.savings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Properties scored
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.scored}/{rows.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Under appeal
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.appealing}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Properties</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No properties yet.{" "}
              <Link href="/dashboard/properties" className="underline">
                Add properties
              </Link>{" "}
              to build your portfolio.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Assessed</TableHead>
                  <TableHead className="text-right">Est. market value</TableHead>
                  <TableHead className="text-right">Annual savings</TableHead>
                  <TableHead className="text-right">Probability</TableHead>
                  <TableHead>Appeal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.parid}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/score/${r.parid}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {r.address ?? r.parid}
                      </Link>
                      {r.nickname && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({r.nickname})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {usd(r.current_assessed)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.estimated_fmv != null ? (
                        usd(r.estimated_fmv)
                      ) : (
                        <Link
                          href={`/score/${r.parid}`}
                          className="text-sm underline"
                        >
                          Run score
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {usd(r.estimated_annual_savings)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.probability != null
                        ? `${(r.probability * 100).toFixed(0)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {r.appeal_status ? (
                        <Badge variant="secondary">
                          {STATUS_LABELS[r.appeal_status] ?? r.appeal_status}{" "}
                          {r.appeal_tax_year}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
