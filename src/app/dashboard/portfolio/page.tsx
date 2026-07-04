import Link from "next/link";
import { Download } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { getPortfolio } from "@/lib/portfolio";
import { STATUS_LABELS } from "@/lib/appeal-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
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
      <PageHeader
        title="Portfolio analytics"
        description="Assessment exposure and appeal opportunity across every property you track."
      >
        <Button variant="outline" render={<a href="/api/portfolio/export" />}>
          <Download data-icon="inline-start" />
          Export CSV
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total assessed value" value={usd(totals.assessed)} />
        <StatCard
          label="Projected annual savings"
          value={usd(totals.savings)}
          valueClassName="text-success"
          hint="Estimate — assumes ~25 mills combined millage per property."
        />
        <StatCard
          label="Properties scored"
          value={`${totals.scored}/${rows.length}`}
        />
        <StatCard label="Under appeal" value={totals.appealing} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Properties</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              title="No properties yet"
              description="Add properties to build your portfolio view."
            >
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/properties" />}
              >
                Add properties
              </Button>
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Assessed</TableHead>
                  <TableHead className="text-right">Est. market value</TableHead>
                  <TableHead className="text-right">
                    Annual savings (est.)
                  </TableHead>
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
                    <TableCell className="text-right font-mono">
                      {usd(r.current_assessed)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.estimated_fmv != null ? (
                        usd(r.estimated_fmv)
                      ) : (
                        <Link
                          href={`/score/${r.parid}`}
                          className="font-sans text-sm text-primary underline underline-offset-2"
                        >
                          Run score
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {usd(r.estimated_annual_savings)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
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
